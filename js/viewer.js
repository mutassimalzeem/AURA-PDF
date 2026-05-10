// PDF Annotator — Main viewer script
import { PDFViewer }         from './pdf-viewer.js';
import { AnnotationManager } from './annotations.js';
import { Toolbar }           from './toolbar.js';

const MAX_PDF_SIZE = 100 * 1024 * 1024;
const PDF_MIME = 'application/pdf';

// ── Storage key helpers ───────────────────────────────────────────────────────

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// Fix 6/7: content-based identity
// Priority order for key derivation:
//   1. PDF internal fingerprint (pdfDoc.fingerprints[0]) — survives rename & URL change
//   2. SHA-256 of first 64 KB of file bytes (local drag-drop files)
//   3. SHA-256 of canonical URL (remote URLs with no fingerprint available)
// This means: same PDF from two different URLs → same key.
//             two different PDFs with same filename → different keys.
// Fix M-5: storage key uses first 512 KB + last 4 KB + total file size to reduce
// collision probability for programmatically-generated PDFs with identical headers.
// Falls back to URL if no byte content available.
async function deriveStorageKey(pdfFingerprint, fileBytes, canonicalUrl, fileSize) {
  let seed;
  if (pdfFingerprint && pdfFingerprint.length > 8) {
    seed = `fp:${pdfFingerprint}`;                  // most stable (PDF internal fingerprint)
  } else if (fileBytes) {
    // Use up to first 512 KB + last 4 KB overlap + total byte length for disambiguation
    const head = fileBytes.slice(0, 524288);         // first 512 KB
    const tail = fileBytes.slice(-4096);             // last 4 KB (may overlap on small files)
    const combined = new Uint8Array(head.byteLength + tail.byteLength + 8);
    combined.set(new Uint8Array(head), 0);
    combined.set(new Uint8Array(tail), head.byteLength);
    // Encode file size in last 8 bytes (big-endian 64-bit)
    const sizeView = new DataView(combined.buffer, combined.byteLength - 8);
    sizeView.setUint32(0, Math.floor((fileSize || 0) / 2**32), false);
    sizeView.setUint32(4, (fileSize || 0) >>> 0, false);
    const digest = await crypto.subtle.digest('SHA-256', combined);
    const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
    seed = `content:${hash}`;
  } else {
    seed = `url:${canonicalUrl}`;
  }
  return 'pdf_ann_' + (await sha256hex(seed)).slice(0, 32);
}

function stripPdfExt(name) { return name.replace(/\.pdf$/i, ''); }

function debugLog() {}

function sanitizeFileName(name) {
  return stripPdfExt(String(name || 'document')).replace(/[^\w .()-]/g, '').slice(0, 120) || 'document';
}

function isExtensionBlobUrl(parsed) {
  if (parsed.protocol !== 'blob:') return false;
  try {
    return new URL(parsed.pathname).origin === window.location.origin;
  } catch {
    return false;
  }
}

function parseSafePdfUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') {
      if (parsed.username || parsed.password) return null;
      return parsed;
    }
    if (parsed.protocol === 'file:' && pathLooksPdf(parsed)) return parsed;
    if (isExtensionBlobUrl(parsed)) return parsed;
  } catch {}
  return null;
}

function pathLooksPdf(parsed) {
  try {
    return decodeURIComponent(parsed.pathname).toLowerCase().endsWith('.pdf');
  } catch {
    return parsed.pathname.toLowerCase().endsWith('.pdf');
  }
}

function hasPdfMimeHint(parsed) {
  const mime = parsed.searchParams.get('content-type') || parsed.searchParams.get('content_type') || parsed.searchParams.get('mime') || '';
  return mime.trim().toLowerCase() === PDF_MIME;
}

function isPdfMagic(bytes) {
  if (!bytes || bytes.byteLength < 5) return false;
  const head = new TextDecoder('ascii').decode(new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength)));
  return head === '%PDF-';
}

async function readFirstBytes(response, length) {
  const reader = response.body?.getReader?.();
  if (!reader) return response.arrayBuffer();

  const chunks = [];
  let received = 0;
  try {
    while (received < length) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const out = new Uint8Array(Math.min(received, length));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.min(chunk.byteLength, out.length - offset));
    out.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= out.length) break;
  }
  return out.buffer;
}

async function inspectRemotePdf(parsed) {
  let headChecked = false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(parsed.href, {
      method: 'HEAD',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!resp.ok) throw new Error('HEAD failed');
    const contentLength = Number(resp.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_PDF_SIZE) {
      throw new Error('PDF file is too large');
    }
    const contentRange = resp.headers.get('content-range') || '';
    const totalSize = Number(contentRange.split('/')[1]);
    if (Number.isFinite(totalSize) && totalSize > MAX_PDF_SIZE) {
      throw new Error('PDF file is too large');
    }

    const contentType = (resp.headers.get('content-type') || '').toLowerCase().split(';', 1)[0].trim();
    if (contentType && contentType !== PDF_MIME) {
      throw new Error('URL does not point to a PDF');
    }
  } catch (err) {
    if (err?.message === 'PDF file is too large') throw err;
    if (pathLooksPdf(parsed) || hasPdfMimeHint(parsed)) {
      debugLog('Remote PDF preflight skipped', err?.name || err?.message);
    } else {
      throw err;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(parsed.href, {
      method: 'GET',
      headers: { Range: 'bytes=0-4' },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal
    });
    if (!resp.ok) throw new Error('Failed to inspect PDF');
    const contentLength = Number(resp.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_PDF_SIZE) {
      throw new Error('PDF file is too large');
    }
    headChecked = isPdfMagic(await readFirstBytes(resp, 5));
  } finally {
    clearTimeout(timeoutId);
  }
  if (!headChecked) throw new Error('URL does not point to a PDF');
}

async function inspectFilePdf(parsed) {
  if (!pathLooksPdf(parsed)) throw new Error('The selected file does not appear to be a PDF');
  const resp = await fetch(parsed.href, { cache: 'no-store' });
  if (!resp.ok) throw new Error('Chrome blocked access to this local PDF');
  const contentLength = Number(resp.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_PDF_SIZE) {
    throw new Error('PDF file is too large');
  }
  const head = await readFirstBytes(resp, 5);
  if (!isPdfMagic(head)) throw new Error('The selected file does not appear to be a PDF');
}

async function inspectBlobPdf(url) {
  const blob = await fetch(url, { credentials: 'same-origin' }).then(resp => {
    if (!resp.ok) throw new Error('Failed to read local PDF');
    return resp.blob();
  });
  if (blob.size > MAX_PDF_SIZE) throw new Error('PDF file is too large');
  const head = await blob.slice(0, 5).arrayBuffer();
  if (!isPdfMagic(head)) throw new Error('The selected file does not appear to be a PDF');
}

// ── App ───────────────────────────────────────────────────────────────────────
class PDFAnnotatorApp {
  constructor() {
    this.pdfViewer         = null;
    this.annotationManager = null;
    this.toolbar           = null;
    this.currentFile       = null;
    this.currentBlobUrl    = null;
    this._currentFileBytes = null;  // Fix 1/7: retain ArrayBuffer for content hashing
    this.fileName          = 'document';
    this._init();
  }

  async _init() {
    const params  = new URLSearchParams(window.location.search);
    const pdfUrl  = params.get('file');
    const pdfName = params.get('name');

    if (pdfName) this.fileName = sanitizeFileName(pdfName);

    if (pdfUrl) {
      const safeUrl = parseSafePdfUrl(pdfUrl);
      if (!safeUrl) {
        this._showError('Unsupported PDF source. Open local files with the file picker or use an HTTPS PDF URL.');
        return;
      }
      if (!pdfName) {
        try {
          const base = safeUrl.pathname.split('/').pop();
          if (base) this.fileName = sanitizeFileName(decodeURIComponent(base));
        } catch {}
      }
      try { await this._loadPDF(safeUrl.href, null); }
      catch (err) { debugLog('PDF load failed', err?.message); this._showError(err.message || 'Failed to load PDF'); }
    } else {
      this._showDropZone();
    }
    this._setupKeyboard();
  }

  // ── Core loader ───────────────────────────────────────────────
  // fileBytes: ArrayBuffer | null — provided when user opens a local file
  async _loadPDF(url, fileBytes) {
    this._showLoading();
    this._teardown();

    const parsed = parseSafePdfUrl(url);
    if (!parsed) throw new Error('Unsupported PDF source');
    if (fileBytes && !isPdfMagic(fileBytes)) throw new Error('The selected file does not appear to be a PDF');
    // Fix L-1: skip re-inspection for HTTPS PDFs already validated by background.js probe.
    // We check chrome.storage.session for the cached probe result to avoid triple-fetching.
    let bgAlreadyValidated = false;
    if (parsed.protocol === 'https:') {
      try {
        const sess = await chrome.storage.session.get('bgProbeCache');
        const cache = sess?.bgProbeCache || {};
        if (cache[parsed.href]) bgAlreadyValidated = true;
      } catch {}
      if (!bgAlreadyValidated) await inspectRemotePdf(parsed);
    }
    if (parsed.protocol === 'file:') await inspectFilePdf(parsed);
    if (parsed.protocol === 'blob:' && !fileBytes) await inspectBlobPdf(parsed.href);

    this.currentFile       = url;
    this._currentFileBytes = fileBytes;

    // Build viewer first so we can get the PDF fingerprint
    this.pdfViewer = new PDFViewer('pdf-container');
    // Fix L-2: align credentials with background.js — always omit to avoid
    // inconsistency between validation fetches and the pdf.js rendering fetch.
    await this.pdfViewer.loadPDF(url, { withCredentials: false });

    // Fix M-5: pass file.size for stronger storage key derivation
    const canonicalUrl = url.startsWith('blob:') ? `blob:${this.fileName}` : url;
    const fileSize = this._currentFileSize || null;
    const storageKey   = await deriveStorageKey(
      this.pdfViewer.pdfFingerprint,
      fileBytes,
      canonicalUrl,
      fileSize
    );

    this.annotationManager = new AnnotationManager(storageKey);
    this.toolbar           = new Toolbar(this);

    this.annotationManager.setViewer(this.pdfViewer);

    // Fix M-2: surface storage errors to the UI via toast
    this.annotationManager.onStorageError   = (msg) => this._showToast(msg, 'error');
    this.annotationManager.onStorageWarning = (msg) => this._showToast(msg, 'warn');

    // Set onPageChange exactly once
    this.pdfViewer.onPageChange = (page) =>
      this.toolbar?.updatePageInfo(page, this.pdfViewer.getTotalPages());

    this.toolbar.setCallbacks({
      onPageChange:       (page)  => this.pdfViewer?.goToPage(page),
      onZoomChange:       (zoom)  => this._setZoom(zoom),
      onToolChange:       (tool)  => this._setTool(tool),
      onColorChange:      (color) => this.annotationManager?.setColor(color),
      onOpacityChange:    (op)    => this.annotationManager?.setOpacity(op),
      onSizeChange:       (sz)    => this.annotationManager?.setSize(sz),
      onToggleSidebar:    ()      => this.toolbar?.toggleSidebar(),
      onDeleteAnnotation: (id)    => this.annotationManager?.deleteAnnotation(id),
      onSavePDF:          ()      => this._save(),
      onOpenFile:         ()      => this._openFilePicker(),
      onPrint:            ()      => this.pdfViewer?.print(),
      onDownload:         ()      => this._download(),
      onDarkModeChange:   (mode)  => this.pdfViewer?.setDarkMode(mode),
      // Fix M-3: two-phase import with confirmation dialog
      onExportAnnotations: ()     => this._exportAnnotations(),
      onImportAnnotations: (json) => this._importAnnotations(json),
    });

    await this.annotationManager.loadAnnotations();
    this.toolbar.updatePageInfo(1, this.pdfViewer.getTotalPages());
    this.toolbar.updateZoom(this.pdfViewer.getZoom());
    this._hideLoading();
  }

  _teardown() {
    if (this.currentBlobUrl) { URL.revokeObjectURL(this.currentBlobUrl); this.currentBlobUrl = null; }
    this._currentFileBytes = null;
    this.pdfViewer?.destroy();
    document.querySelector('.toolbar')?.remove();
    document.getElementById('sidebar')?.remove();
    this.pdfViewer = this.annotationManager = this.toolbar = null;
  }

  // ── Drop zone ─────────────────────────────────────────────────
  _showDropZone() {
    document.getElementById('pdf-container')?.style.setProperty('display','none');
    document.getElementById('drop-zone')?.remove();
    const dz = document.createElement('div');
    dz.className = 'drop-zone'; dz.id = 'drop-zone';
    dz.innerHTML = `
      <div class="drop-zone-content">
        <svg class="drop-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/>
        </svg>
        <h1 class="drop-zone-title">PDF Annotator Pro</h1>
        <p class="drop-zone-subtitle">Open a PDF to start annotating</p>
        <button class="open-file-btn" id="open-file-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>Choose PDF File
        </button>
        <p class="drop-zone-hint">Or drag and drop a PDF file here</p>
        <input type="file" id="file-input" accept=".pdf,application/pdf" style="display:none">
      </div>`;
    document.body.appendChild(dz);

    dz.querySelector('#open-file-btn').addEventListener('click', () =>
      dz.querySelector('#file-input').click());
    dz.querySelector('#file-input').addEventListener('change', (e) => {
      if (e.target.files[0]) this._handleFile(e.target.files[0]);
    });
    dz.addEventListener('dragover',  (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', ()  => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && this._isPdf(f)) this._handleFile(f);
    });
  }

  _isPdf(f) {
    return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
  }

  // Fix 1/7: read file bytes before creating blob URL so we can hash content
  async _handleFile(file) {
    this.fileName = sanitizeFileName(file.name);
    if (file.size > MAX_PDF_SIZE) {
      this._showError('PDF file is too large. The maximum supported size is 100 MB.');
      return;
    }
    if (!this._isPdf(file)) {
      this._showError('Please choose a PDF file.');
      return;
    }
    if (this.currentBlobUrl) URL.revokeObjectURL(this.currentBlobUrl);

    // Fix M-5: read up to 512 KB for stronger storage-key derivation (head + tail hashed).
    // Still only the first 512 KB is read eagerly; tail is derived in deriveStorageKey.
    let fileBytes = null;
    try {
      fileBytes = await file.slice(0, 524288).arrayBuffer();
    } catch {}
    if (!isPdfMagic(fileBytes)) {
      this._showError('The selected file does not appear to be a PDF.');
      return;
    }

    // Store file size for M-5 storage key derivation
    this._currentFileSize = file.size;

    const blobUrl       = URL.createObjectURL(file);
    this.currentBlobUrl = blobUrl;
    document.getElementById('drop-zone')?.remove();
    this._loadPDF(blobUrl, fileBytes).catch(err => this._showError(err.message));
  }

  // ── UI helpers ────────────────────────────────────────────────
  _showLoading() {
    document.getElementById('drop-zone')?.remove();
    if (!document.getElementById('loading')) {
      const el = document.createElement('div');
      el.id = 'loading'; el.className = 'loading-container';
      el.innerHTML = '<div class="loading-spinner"></div><p class="loading-text">Loading PDF…</p>';
      document.body.appendChild(el);
    }
  }
  _hideLoading() {
    document.getElementById('loading')?.remove();
    const c = document.getElementById('pdf-container');
    if (c) c.style.display = '';
  }

  _showError(message) {
    this._hideLoading();
    document.getElementById('error-overlay')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'error-overlay'; wrap.className = 'error-container';
    const icon = document.createElement('div');
    icon.innerHTML = '<svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    const title = document.createElement('h1'); title.className = 'error-title'; title.textContent = 'Something went wrong';
    const msg   = document.createElement('p');  msg.className   = 'error-message'; msg.textContent = message;
    const btn   = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Reload';
    btn.addEventListener('click', () => location.reload());
    wrap.append(icon, title, msg, btn);
    document.body.appendChild(wrap);
  }

  // Fix M-2: toast now accepts severity ('info'|'warn'|'error') for storage alerts
  _showToast(msg, severity = 'info') {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'toast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:8px;font-size:14px;box-shadow:0 4px 16px rgba(0,0,0,.4);z-index:9999;transition:opacity .3s ease;pointer-events:none;';
      document.body.appendChild(t);
    }
    const colours = {
      info:  'background:var(--bg-elevated,#2f3549);color:var(--text-primary,#c0caf5);',
      warn:  'background:#7c5c00;color:#ffe066;',
      error: 'background:#7c1f1f;color:#ffb3b3;',
    };
    t.style.cssText += colours[severity] || colours.info;
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(this._toastTimer);
    const delay = severity === 'error' ? 6000 : severity === 'warn' ? 5000 : 2500;
    this._toastTimer = setTimeout(() => { t.style.opacity = '0'; }, delay);
  }

  // Fix M-3 + L-9: export with privacy notice; fix L-9: show notice before download
  _exportAnnotations() {
    if (!this.annotationManager) { this._showToast('No PDF loaded'); return; }
    const { data, privacyNotice } = this.annotationManager.exportAnnotations();
    if (!data || !JSON.parse(data)?.length) { this._showToast('No annotations to export'); return; }

    // L-9: show privacy notice before triggering download
    const confirmed = window.confirm(`Export annotations?

${privacyNotice}`);
    if (!confirmed) return;

    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${this.fileName || 'annotations'}_annotations.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // Fix M-3: two-phase import — preflight first, show confirmation if existing annotations
  async _importAnnotations(json) {
    if (!this.annotationManager) { this._showToast('No PDF loaded'); return; }
    const result = this.annotationManager.importAnnotationsPreflight(json);
    if (result.status === 'error') {
      this._showToast(result.message, 'error'); return;
    }
    if (result.status === 'needs_confirm') {
      const confirmed = window.confirm(
        `Importing ${result.count} annotation(s) will replace your existing ${result.existing} annotation(s).\n\nThis cannot be undone. Continue?`
      );
      if (confirmed) {
        this.annotationManager.confirmImport();
        this._showToast(`Imported ${result.count} annotation(s)`);
      } else {
        this.annotationManager.cancelImport();
      }
      return;
    }
    this._showToast(`Imported ${result.count} annotation(s)`);
  }

  // ── Zoom ──────────────────────────────────────────────────────
  _setZoom(zoom) {
    if (!this.pdfViewer) return;
    this.pdfViewer.setZoom(zoom, () => this.annotationManager?.refreshAfterZoom());
  }

  // ── Tool ──────────────────────────────────────────────────────
  _setTool(tool) {
    this.pdfViewer?.setTool(tool);
    this.annotationManager?.setTool(tool);
    const btn = document.querySelector(`[data-tool="${tool}"]`);
    if (btn) this.toolbar?.setActiveTool(btn);
  }

  // ── Keyboard shortcuts ────────────────────────────────────────
  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'o': e.preventDefault(); this._openFilePicker(); break;
          case 's': e.preventDefault(); this._save();           break;
          case 'p': e.preventDefault(); this.pdfViewer?.print(); break;
        }
        return;
      }
      if (e.altKey) return;
      if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
      switch (e.key) {   // exact case — 's' only, not 'S'
        case 'v': this._setTool('select');        break;
        case 'h': this._setTool('highlight');     break;
        case 'u': this._setTool('underline');     break;
        case 't': this._setTool('text');          break;
        case 'd': this._setTool('draw');          break;
        case 's': this._setTool('strikethrough'); break;
      }
    });
  }

  // ── File ops ─────────────────────────────────────────────────
  _openFilePicker() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.pdf,application/pdf';
    inp.onchange = (e) => { if (e.target.files[0]) this._handleFile(e.target.files[0]); };
    inp.click();
  }

  async _save() {
    if (!this.annotationManager) { this._showToast('No PDF loaded'); return; }
    try { await this.annotationManager.saveToStorage(); this._showToast('Annotations saved!'); }
    catch { this._showToast('Failed to save annotations'); }
  }

  _download() {
    if (!this.currentFile) return;
    const a = document.createElement('a');
    a.href = this.currentFile; a.download = this.fileName + '.pdf'; a.click();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new PDFAnnotatorApp();

  // Fix M-4: receive PDF ArrayBuffer transferred from newtab.js
  // instead of relying on a cross-tab blob URL.
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg?.type === 'pdf-transfer' && msg.buffer instanceof ArrayBuffer) {
        const file = new File([msg.buffer], msg.name || 'document.pdf', { type: 'application/pdf' });
        window.app?._handleFile(file);
        sendResponse({ ok: true });
      }
      return false;
    });
  }
});
