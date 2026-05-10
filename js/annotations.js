// Annotation Manager - Handles all annotation operations
const VALID_TOOLS = new Set(['select', 'highlight', 'underline', 'strikethrough', 'text', 'draw']);
const ANNOTATION_TYPES = new Set(['highlight', 'underline', 'strikethrough', 'text', 'draw']);
const DRAWING_TYPES = new Set(['highlight', 'underline', 'strikethrough', 'draw']);
const MAX_ANNOTATIONS = 10000;
const MAX_TEXT_LENGTH = 1000;
const MAX_PATH_POINTS = 5000;
const MAX_SIZE = 50;
const DEFAULT_COLOR = '#e0af68';

function debugLog() {}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, MAX_TEXT_LENGTH);
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class AnnotationManager {
  constructor(storageKey) {
    this.storageKey     = storageKey;
    this.viewer         = null;
    this.annotations    = [];
    this.currentTool    = 'select';
    this.currentColor   = DEFAULT_COLOR;
    this.currentOpacity = 0.4;
    this.currentSize    = 2;
    this._cryptoKey     = null;
  }

  // ── Viewer binding ────────────────────────────────────────────
  setViewer(viewer) {
    this.viewer = viewer;
    this._attachCallbacks();
  }

  refreshAfterZoom() {
    if (!this.viewer) return;
    this._attachCallbacks();
    this._rerenderAll();
  }

  _attachCallbacks() {
    this.viewer.onDrawingEnd          = (path, start, end) => this._createFromPath(path, start, end);
    this.viewer.onTextAnnotationClick = (e)                => this._createTextAnnotation(e);
  }

  // ── Setters ───────────────────────────────────────────────────
  setTool(t) {
    if (!VALID_TOOLS.has(t)) return;
    this.currentTool = t;
  }
  setColor(c)   { this.currentColor = this._safeColor(c); }
  setOpacity(o) { this.currentOpacity = clampNumber(o, 0, 1, 0.4); }
  setSize(s)    { this.currentSize = clampNumber(s, 0.5, MAX_SIZE, 2); }

  // ── Coordinate system ─────────────────────────────────────────
  _toPdfCoords(pxX, pxY, pageNum) {
    const dims = this.viewer?.getPageDimensions(pageNum);
    if (!dims) return { x: 0, y: 0 };

    const scaledW = dims.pdfWidth * dims.scale;
    const scaledH = dims.pdfHeight * dims.scale;
    if (!Number.isFinite(scaledW) || !Number.isFinite(scaledH) || scaledW <= 0 || scaledH <= 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: clampNumber(pxX / scaledW, 0, 1, 0),
      y: clampNumber(pxY / scaledH, 0, 1, 0)
    };
  }

  _toPixelCoords(normX, normY, pageNum) {
    const dims = this.viewer?.getPageDimensions(pageNum);
    if (!dims) return { x: 0, y: 0 };

    const scaledW = dims.pdfWidth * dims.scale;
    const scaledH = dims.pdfHeight * dims.scale;
    if (!Number.isFinite(scaledW) || !Number.isFinite(scaledH) || scaledW <= 0 || scaledH <= 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: clampNumber(normX, 0, 1, 0) * scaledW,
      y: clampNumber(normY, 0, 1, 0) * scaledH
    };
  }

  _sizeToStorage(pxSize, pageNum) {
    const dims = this.viewer?.getPageDimensions(pageNum);
    if (!dims || !Number.isFinite(dims.scale) || dims.scale <= 0) return clampNumber(pxSize, 0.5, MAX_SIZE, 2);
    return clampNumber(pxSize / dims.scale, 0.5, MAX_SIZE, 2);
  }

  _sizeToPx(ptSize, pageNum) {
    const dims = this.viewer?.getPageDimensions(pageNum);
    const size = clampNumber(ptSize, 0.5, MAX_SIZE, 2);
    if (!dims || !Number.isFinite(dims.scale) || dims.scale <= 0) return size;
    return clampNumber(size * dims.scale, 0.5, MAX_SIZE * dims.scale, 2);
  }

  _safeColor(c) {
    const value = String(c || '');
    return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value) ? value : DEFAULT_COLOR;
  }

  _generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `ann_${crypto.randomUUID()}`;
    return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  _annotationSelector(id) {
    const escaped = window.CSS?.escape ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, '');
    return `[data-annotation-id="${escaped}"]`;
  }

  _canAddAnnotation() {
    return this.annotations.length < MAX_ANNOTATIONS;
  }

  _validPage(page) {
    const n = Number(page);
    const total = this.viewer?.getTotalPages?.() || Number.MAX_SAFE_INTEGER;
    return Number.isInteger(n) && n >= 1 && n <= total ? n : null;
  }

  _safePoint(point) {
    if (!point || typeof point !== 'object') return null;
    return {
      x: clampNumber(point.x, 0, 1, 0),
      y: clampNumber(point.y, 0, 1, 0)
    };
  }

  _sanitizeAnnotation(input) {
    if (!input || typeof input !== 'object') return null;
    if (!/^ann_[a-zA-Z0-9_-]{1,80}$/.test(String(input.id || ''))) return null;
    if (!ANNOTATION_TYPES.has(input.type)) return null;

    const page = this._validPage(input.page);
    if (!page) return null;

    const ann = {
      id: input.id,
      type: input.type,
      page,
      color: this._safeColor(input.color),
      createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : Date.now()
    };

    if (input.type === 'text') {
      const position = this._safePoint(input.position);
      if (!position) return null;
      ann.position = position;
      ann.text = sanitizeText(input.text);
      return ann;
    }

    const startPos = this._safePoint(input.startPos);
    const endPos = this._safePoint(input.endPos);
    if (!startPos || !endPos) return null;

    ann.startPos = startPos;
    ann.endPos = endPos;
    ann.opacity = clampNumber(input.opacity, 0, 1, 0.4);
    ann.size = clampNumber(input.size, 0.5, MAX_SIZE, 2);

    if (input.type === 'draw') {
      if (!Array.isArray(input.path) || input.path.length < 2) return null;
      ann.path = input.path.slice(0, MAX_PATH_POINTS).map(p => this._safePoint(p)).filter(Boolean);
      if (ann.path.length < 2) return null;
      // Fix L-5: reject zero-area paths (all points identical) — invisible and wasteful
      const xs = ann.path.map(pt => pt.x), ys = ann.path.map(pt => pt.y);
      const hasArea = (Math.max(...xs) - Math.min(...xs)) > 0.0001 ||
                      (Math.max(...ys) - Math.min(...ys)) > 0.0001;
      if (!hasArea) return null;
    } else if (Array.isArray(input.path)) {
      ann.path = input.path.slice(0, MAX_PATH_POINTS).map(p => this._safePoint(p)).filter(Boolean);
    }

    return ann;
  }

  _sanitizeAnnotations(value) {
    if (!Array.isArray(value) || value.length > MAX_ANNOTATIONS) return [];
    return value.map(a => this._sanitizeAnnotation(a)).filter(Boolean);
  }

  // ── Creation ─────────────────────────────────────────────────
  async _createFromPath(path, startPos, endPos) {
    if (!this.viewer || !DRAWING_TYPES.has(this.currentTool) || !Array.isArray(path) || path.length < 2 || !this._canAddAnnotation()) return;
    const pageInfo = this.viewer.getPageFromPosition(startPos) ?? this._nearestPage(startPos);
    if (!pageInfo) return;

    const pageNum = pageInfo.page.pageNum;
    const pageTop = pageInfo.page.pageContainer.offsetTop;
    const toNorm = (px, py) => this._toPdfCoords(px, py - pageTop, pageNum);
    const safePath = path.slice(0, MAX_PATH_POINTS).map(p => toNorm(p.x, p.y));

    const ann = {
      id:        this._generateId(),
      type:      this.currentTool,
      page:      pageNum,
      startPos:  toNorm(startPos.x, startPos.y),
      endPos:    toNorm(endPos.x,   endPos.y),
      path:      safePath,
      color:     this._safeColor(this.currentColor),
      opacity:   this.currentOpacity,
      size:      this._sizeToStorage(this.currentSize, pageNum),
      createdAt: Date.now()
    };

    const clean = this._sanitizeAnnotation(ann);
    if (!clean) return;

    this.annotations.push(clean);
    this._renderAnnotation(clean);
    this.onAnnotationsChanged?.(this.annotations);
    await this.saveToStorage();
  }

  async _createTextAnnotation(e) {
    if (!this.viewer || !this._canAddAnnotation()) return;
    const rect = this.viewer.container.getBoundingClientRect();
    const absPx = {
      x: e.clientX - rect.left + this.viewer.container.scrollLeft,
      y: e.clientY - rect.top  + this.viewer.container.scrollTop
    };
    const pageInfo = this.viewer.getPageFromPosition(absPx) ?? this._nearestPage(absPx);
    if (!pageInfo) return;

    const pageNum = pageInfo.page.pageNum;
    const pageTop = pageInfo.page.pageContainer.offsetTop;
    const norm    = this._toPdfCoords(absPx.x, absPx.y - pageTop, pageNum);

    const ann = {
      id:        this._generateId(),
      type:      'text',
      page:      pageNum,
      position:  norm,
      color:     this._safeColor(this.currentColor),
      text:      '',
      createdAt: Date.now()
    };

    const clean = this._sanitizeAnnotation(ann);
    if (!clean) return;

    this.annotations.push(clean);
    this._renderTextAnnotation(clean);
    this.onAnnotationsChanged?.(this.annotations);
    await this.saveToStorage();

    setTimeout(() => {
      document.querySelector(`${this._annotationSelector(clean.id)} textarea`)?.focus();
    }, 100);
  }

  _nearestPage(pos) {
    if (!this.viewer?.pages.length) return null;
    let best = null, bestDist = Infinity;
    for (const p of this.viewer.pages) {
      const top = p.pageContainer.offsetTop, bot = top + p.pageContainer.offsetHeight;
      const dist = pos.y < top ? top - pos.y : pos.y > bot ? pos.y - bot : 0;
      if (dist < bestDist) { bestDist = dist; best = { page: p, localY: 0, localX: pos.x }; }
    }
    return best;
  }

  // ── Rendering ─────────────────────────────────────────────────
  _rerenderAll() {
    document.querySelectorAll('.annotation-layer').forEach(l => { l.textContent = ''; });
    for (const ann of this.annotations) {
      ann.type === 'text' ? this._renderTextAnnotation(ann) : this._renderAnnotation(ann);
    }
  }

  _renderAnnotation(ann) {
    if (!DRAWING_TYPES.has(ann.type)) return;
    const layer = this.viewer?.getAnnotationLayer(ann.page);
    if (!layer) return;
    const el = document.createElement('div');
    el.className = `annotation-${ann.type}`;
    el.dataset.annotationId = ann.id;
    el.style.position = 'absolute';
    switch (ann.type) {
      case 'highlight':     this._renderHighlight(el, ann);     break;
      case 'underline':     this._renderUnderline(el, ann);     break;
      case 'strikethrough': this._renderStrikethrough(el, ann); break;
      case 'draw':          this._renderDrawing(el, ann);       break;
    }
    layer.appendChild(el);
  }

  _renderHighlight(el, ann) {
    const p = ann.page;
    const s = this._toPixelCoords(ann.startPos.x, ann.startPos.y, p);
    const e = this._toPixelCoords(ann.endPos.x,   ann.endPos.y,   p);
    const x1 = Math.min(s.x, e.x), y1 = Math.min(s.y, e.y);
    const w  = Math.abs(e.x - s.x), h  = Math.abs(e.y - s.y);
    Object.assign(el.style, { left:`${x1}px`, top:`${y1}px`, width:`${w}px`, height:`${h}px`,
      background:this._safeColor(ann.color), opacity:ann.opacity, pointerEvents:'none' });
    el.title = `Highlight - p.${p}`;
  }

  _renderUnderline(el, ann) {
    const p  = ann.page;
    const s  = this._toPixelCoords(ann.startPos.x, ann.startPos.y, p);
    const e  = this._toPixelCoords(ann.endPos.x,   ann.endPos.y,   p);
    const dx = e.x - s.x, dy = e.y - s.y;
    const len = Math.sqrt(dx*dx + dy*dy), angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const pxSize = this._sizeToPx(ann.size, p);
    Object.assign(el.style, { left:`${s.x}px`, top:`${s.y}px`, width:`${len}px`, height:`${pxSize}px`,
      background:this._safeColor(ann.color), opacity:ann.opacity,
      transformOrigin:'0 50%', transform:`rotate(${angle}deg)`, pointerEvents:'none' });
    el.title = `Underline - p.${p}`;
  }

  _renderStrikethrough(el, ann) {
    const p  = ann.page;
    const s  = this._toPixelCoords(ann.startPos.x, ann.startPos.y, p);
    const e  = this._toPixelCoords(ann.endPos.x,   ann.endPos.y,   p);
    const dx = e.x - s.x, dy = e.y - s.y;
    const len = Math.sqrt(dx*dx + dy*dy), angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const pxSize = this._sizeToPx(ann.size, p);
    Object.assign(el.style, { left:`${s.x}px`, top:`${s.y - 8}px`, width:`${len}px`, height:`${pxSize}px`,
      background:this._safeColor(ann.color), opacity:ann.opacity,
      transformOrigin:'0 50%', transform:`rotate(${angle}deg)`, pointerEvents:'none' });
    el.title = `Strikethrough - p.${p}`;
  }

  _renderDrawing(el, ann) {
    if (!ann.path || ann.path.length < 2) return;
    const p   = ann.page;
    const px  = ann.path.map(pt => this._toPixelCoords(pt.x, pt.y, p));
    const xs  = px.map(pt => pt.x), ys = px.map(pt => pt.y);
    const pxSize = this._sizeToPx(ann.size, p);
    const pad = pxSize;
    const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
    const w    = Math.max(...xs) + pad - minX, h = Math.max(...ys) + pad - minY;

    if (![minX, minY, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
    Object.assign(el.style, { left:`${minX}px`, top:`${minY}px`, width:`${w}px`, height:`${h}px` });

    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
    svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible;';

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg','path');
    let d = `M ${px[0].x} ${px[0].y}`;
    for (let i = 1; i < px.length; i++) d += ` L ${px[i].x} ${px[i].y}`;
    pathEl.setAttribute('d', d);
    pathEl.setAttribute('stroke',          this._safeColor(ann.color));
    pathEl.setAttribute('stroke-width',    pxSize);
    pathEl.setAttribute('fill',            'none');
    pathEl.setAttribute('stroke-linecap',  'round');
    pathEl.setAttribute('stroke-linejoin', 'round');
    pathEl.setAttribute('opacity',         ann.opacity);
    svg.appendChild(pathEl);
    el.appendChild(svg);
    el.title = `Drawing - p.${p}`;
  }

  _renderTextAnnotation(ann) {
    const layer = this.viewer?.getAnnotationLayer(ann.page);
    if (!layer) return;
    const pxPos = this._toPixelCoords(ann.position.x, ann.position.y, ann.page);

    const el = document.createElement('div');
    el.className = 'annotation-text-note';
    el.dataset.annotationId = ann.id;
    Object.assign(el.style, { position:'absolute', left:`${pxPos.x}px`, top:`${pxPos.y}px` });

    const header = document.createElement('div');
    header.className = 'note-header';
    const dot = document.createElement('div');
    dot.className = 'note-color';
    dot.style.background = this._safeColor(ann.color);
    const delBtn = document.createElement('button');
    delBtn.className = 'note-delete';
    delBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    delBtn.addEventListener('click', () => this.deleteAnnotation(ann.id));
    header.appendChild(dot);
    header.appendChild(delBtn);

    const ta = document.createElement('textarea');
    ta.placeholder = 'Type your note';
    ta.maxLength = MAX_TEXT_LENGTH;
    ta.value = sanitizeText(ann.text);
    ta.addEventListener('input', (ev) => {
      ann.text = sanitizeText(ev.target.value);
      if (ev.target.value !== ann.text) ev.target.value = ann.text;
      this.saveToStorage();
    });

    el.appendChild(header);
    el.appendChild(ta);
    layer.appendChild(el);
  }

  // ── CRUD ──────────────────────────────────────────────────────
  deleteAnnotation(id) {
    const idx = this.annotations.findIndex(a => a.id === id);
    if (idx === -1) return;
    this.annotations.splice(idx, 1);
    document.querySelector(this._annotationSelector(id))?.remove();
    this.onAnnotationsChanged?.(this.annotations);
    this.saveToStorage();
  }

  // ── Persistence ───────────────────────────────────────────────
  async _getCryptoKey() {
    if (this._cryptoKey) return this._cryptoKey;
    const material = `${chrome.runtime.id}:${this.storageKey}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
    this._cryptoKey = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return this._cryptoKey;
  }

  async _encryptAnnotations(annotations) {
    const key = await this._getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(annotations));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
    return {
      encrypted: true,
      version: 1,
      iv: bytesToBase64(iv),
      data: bytesToBase64(ciphertext)
    };
  }

  async _decryptAnnotations(record) {
    if (!record?.encrypted || record.version !== 1 || typeof record.iv !== 'string' || typeof record.data !== 'string') {
      return [];
    }
    const key = await this._getCryptoKey();
    const iv = base64ToBytes(record.iv);
    const ciphertext = base64ToBytes(record.data);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  async loadAnnotations() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      const raw = result[this.storageKey];
      const parsed = Array.isArray(raw) ? raw : await this._decryptAnnotations(raw);
      this.annotations = this._sanitizeAnnotations(parsed);
      this._rerenderAll();
      this.onAnnotationsChanged?.(this.annotations);
      if (Array.isArray(raw) && this.annotations.length > 0) await this.saveToStorage();
    } catch (err) {
      debugLog('Annotation load failed', err?.name);
      this.annotations = [];
    }
  }

  // Fix M-2: pre-flight size check and surface storage errors to caller/UI
  async saveToStorage() {
    try {
      const safeAnnotations = this._sanitizeAnnotations(this.annotations);
      this.annotations = safeAnnotations;

      // Warn before hitting chrome.storage.local quota (~5 MB default)
      const serialised = JSON.stringify(safeAnnotations);
      const estimatedBytes = new TextEncoder().encode(serialised).length;
      const QUOTA_WARN_BYTES = 4 * 1024 * 1024; // warn at 4 MB
      if (estimatedBytes > QUOTA_WARN_BYTES) {
        this.onStorageWarning?.(`Annotations are large (${Math.round(estimatedBytes / 1024)} KB). Consider exporting and clearing old annotations to free space.`);
      }

      const encrypted = await this._encryptAnnotations(safeAnnotations);
      await chrome.storage.local.set({ [this.storageKey]: encrypted });
    } catch (err) {
      debugLog('Annotation save failed', err?.name);
      // Surface storage errors (e.g. QUOTA_BYTES_PER_ITEM exceeded) to the UI
      const isQuota = err?.name === 'QuotaExceededError' || err?.message?.includes('QUOTA');
      const msg = isQuota
        ? 'Storage quota exceeded — annotations could not be saved. Export your annotations and clear some to free space.'
        : 'Annotations could not be saved. Please try again.';
      this.onStorageError?.(msg);
    }
  }

  // Fix L-9: return a privacy notice alongside the exported data.
  exportAnnotations() {
    return {
      data: JSON.stringify(this.annotations, null, 2),
      privacyNotice: 'This file contains all your annotation text and positions in plain readable form. Review it before sharing.'
    };
  }

  getAnnotations()        { return this.annotations; }
  getAnnotationCount()    { return this.annotations.length; }
  getAnnotationsByPage(p) { return this.annotations.filter(a => a.page === p); }

  // Fix M-3: two-phase import so the UI can ask for confirmation before overwriting.
  // Phase 1 – validate; returns a descriptor, never mutates state.
  //   { status: 'needs_confirm', count, existing } — caller must call confirmImport()
  //   { status: 'ok', count }                      — applied immediately (no existing anns)
  //   { status: 'error', message }                 — parse/validation failure; nothing changed
  importAnnotationsPreflight(json) {
    if (typeof json !== 'string' || json.length > 5 * 1024 * 1024) {
      return { status: 'error', message: 'Import file is too large or invalid.' };
    }
    let parsed;
    try { parsed = JSON.parse(json); } catch {
      return { status: 'error', message: 'Import file is not valid JSON.' };
    }
    const safe = this._sanitizeAnnotations(parsed);
    if (safe.length === 0) {
      return { status: 'error', message: 'No valid annotations found in the import file.' };
    }
    if (this.annotations.length > 0) {
      this._pendingImport = safe;
      return { status: 'needs_confirm', count: safe.length, existing: this.annotations.length };
    }
    this._applyImport(safe);
    return { status: 'ok', count: safe.length };
  }

  // Phase 2 – called after user confirms overwrite in the UI.
  confirmImport() {
    if (!this._pendingImport) return;
    this._applyImport(this._pendingImport);
    this._pendingImport = null;
  }

  cancelImport() { this._pendingImport = null; }

  _applyImport(safe) {
    this.annotations = safe;
    this._rerenderAll();
    this.onAnnotationsChanged?.(this.annotations);
    this.saveToStorage();
  }

  clearAllAnnotations() {
    this.annotations = [];
    document.querySelectorAll('.annotation-layer').forEach(l => { l.textContent = ''; });
    this.onAnnotationsChanged?.(this.annotations);
    this.saveToStorage();
  }
}
