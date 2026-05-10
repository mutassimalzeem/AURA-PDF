// PDF Viewer - Handles PDF.js rendering, text layer, and link layer
// Production fixes applied:
//   H-3: Dark mode computed on-demand via CSS filter (no _rawImageData storage)
//   L-7: Touch / Pointer Events support for mobile/tablet
//   L-8: mousemove throttled via requestAnimationFrame
const VALID_TOOLS = new Set(['select', 'highlight', 'underline', 'strikethrough', 'text', 'draw']);
const TRUSTED_EXTERNAL_LINK_PROTOCOLS = new Set(['https:', 'mailto:']);
const EXPECTED_RESOURCE_HASHES = {
  'lib/pdf.min.js': '5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946',
  'lib/pdf.worker.min.js': 'feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b'
};

function debugLog() {}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export class PDFViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id        = containerId;
      this.container.className = 'viewer-container';
      document.body.appendChild(this.container);
    }

    this.pdfDoc        = null;
    this.pages         = [];
    this.currentPage   = 1;
    this.totalPages    = 0;
    this.zoom          = 1.0;
    this.tool          = 'select';
    this.pdfjsLib      = null;
    this.darkMode      = 'off';
    this.isDrawing     = false;
    this.currentPath   = [];
    this.drawStartPos  = null;
    this._renderVersion = 0;
    this._rafPending   = false; // L-8: rAF throttle flag

    // Fingerprint of loaded PDF for content-based identity
    this.pdfFingerprint = null;

    this._boundScroll        = this._onScroll.bind(this);
    this._boundClick         = this._onClick.bind(this);
    // L-7: use pointer events (covers mouse + touch + stylus)
    this._boundPointerDown   = this._onPointerDown.bind(this);
    this._boundPointerMove   = this._onPointerMove.bind(this);
    this._boundPointerUp     = this._onPointerUp.bind(this);
    this._boundDocPointerUp  = this._onDocPointerUp.bind(this);

    this.onPageChange          = null;
    this.onDrawingEnd          = null;
    this.onTextAnnotationClick = null;
    this.onDrawingMove         = null;
  }

  // ── Dark mode (Fix H-3) ───────────────────────────────────────
  // Use CSS filter instead of pixel-by-pixel ImageData transforms.
  // This avoids storing large per-page ImageData buffers in memory.
  setDarkMode(mode) {
    this.darkMode = mode;
    this._applyDarkModeFilter();
  }

  _applyDarkModeFilter() {
    const filters = {
      off:   '',
      dark:  'invert(1) hue-rotate(180deg)',
      sepia: 'sepia(0.6) brightness(0.9)'
    };
    const filter = filters[this.darkMode] || '';
    for (const p of this.pages) {
      p.canvas.style.filter = filter;
    }
  }

  // ── PDF.js bootstrap ──────────────────────────────────────────
  async _verifyExtensionResource(path) {
    const expected = EXPECTED_RESOURCE_HASHES[path];
    if (!expected) throw new Error('Missing resource integrity metadata');
    const resp = await fetch(chrome.runtime.getURL(path), { cache: 'no-store' });
    if (!resp.ok) throw new Error('Failed to verify PDF renderer');
    const actual = await sha256Hex(await resp.arrayBuffer());
    if (actual !== expected) throw new Error('PDF renderer integrity check failed');
  }

  async initPDFJS() {
    if (window.pdfjsLib) { this.pdfjsLib = window.pdfjsLib; return; }
    await Promise.all([
      this._verifyExtensionResource('lib/pdf.min.js'),
      this._verifyExtensionResource('lib/pdf.worker.min.js')
    ]);
    await new Promise((res, rej) => {
      if (window.pdfjsLib) { res(); return; }
      const s = document.createElement('script');
      s.src     = chrome.runtime.getURL('lib/pdf.min.js');
      s.onload  = res;
      s.onerror = () => rej(new Error('Failed to load pdf.min.js'));
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
    this.pdfjsLib = window.pdfjsLib;
  }

  // ── Load PDF ──────────────────────────────────────────────────
  async loadPDF(url) {
    if (!this.pdfjsLib) await this.initPDFJS();
    if (this.pdfDoc) { try { this.pdfDoc.destroy(); } catch {} this.pdfDoc = null; }

    const cMapBase = chrome.runtime.getURL('lib/cmaps/');
    let cMapOpts = {};
    try {
      const probe = await fetch(cMapBase + 'Adobe-CNS1-UCS2.bcmap', { method: 'HEAD' });
      if (probe.ok) cMapOpts = { cMapUrl: cMapBase, cMapPacked: true };
    } catch {}

    this.pdfDoc     = await this.pdfjsLib.getDocument({ url, ...cMapOpts }).promise;
    this.totalPages = this.pdfDoc.numPages;

    try {
      const fp = this.pdfDoc.fingerprints;
      this.pdfFingerprint = Array.isArray(fp) ? fp[0] : null;
    } catch { this.pdfFingerprint = null; }

    await this._renderAllPages();
    this._setupInteraction();
    return this.pdfDoc;
  }

  // ── Rendering ─────────────────────────────────────────────────
  async _renderAllPages() {
    const myVersion = ++this._renderVersion;
    this.container.innerHTML = '';
    this.pages = [];

    for (let i = 1; i <= this.totalPages; i++) {
      if (this._renderVersion !== myVersion) return;
      await this._renderPage(i, myVersion);
    }
    // Apply dark mode filter to all freshly rendered canvases (Fix H-3)
    if (this.darkMode !== 'off') this._applyDarkModeFilter();
  }

  async _renderPage(pageNum, myVersion) {
    const page     = await this.pdfDoc.getPage(pageNum);
    if (this._renderVersion !== myVersion) return;

    const scale    = this.zoom * 1.5;
    const viewport = page.getViewport({ scale });

    const pageContainer = document.createElement('div');
    pageContainer.className          = 'pdf-page-container';
    pageContainer.dataset.pageNumber = pageNum;
    pageContainer.style.width        = viewport.width  + 'px';
    pageContainer.style.height       = viewport.height + 'px';

    const canvas        = document.createElement('canvas');
    canvas.width        = viewport.width;
    canvas.height       = viewport.height;
    canvas.style.width  = viewport.width  + 'px';
    canvas.style.height = viewport.height + 'px';

    const textLayerDiv        = document.createElement('div');
    textLayerDiv.className    = 'pdf-text-layer';
    textLayerDiv.style.width  = viewport.width  + 'px';
    textLayerDiv.style.height = viewport.height + 'px';

    const linkLayerDiv        = document.createElement('div');
    linkLayerDiv.className    = 'pdf-link-layer';
    linkLayerDiv.style.width  = viewport.width  + 'px';
    linkLayerDiv.style.height = viewport.height + 'px';

    const annotationLayer        = document.createElement('div');
    annotationLayer.className    = 'annotation-layer';
    annotationLayer.dataset.pageNumber = pageNum;

    pageContainer.appendChild(canvas);
    pageContainer.appendChild(textLayerDiv);
    pageContainer.appendChild(linkLayerDiv);
    pageContainer.appendChild(annotationLayer);
    this.container.appendChild(pageContainer);

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (this._renderVersion !== myVersion) return;

    // Text layer
    try {
      const textContent = await page.getTextContent();
      if (this._renderVersion !== myVersion) return;
      if (this.pdfjsLib.renderTextLayer) {
        this.pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container:         textLayerDiv,
          viewport,
          textDivs:          []
        });
      }
    } catch (err) { debugLog('Text layer failed', err?.name); }

    // Link/annotation layer
    try {
      const pdfAnnotations = await page.getAnnotations();
      if (this._renderVersion !== myVersion) return;
      if (this.pdfjsLib.AnnotationLayer && pdfAnnotations.length > 0) {
        this.pdfjsLib.AnnotationLayer.render({
          viewport:    viewport.clone({ dontFlip: true }),
          div:         linkLayerDiv,
          annotations: pdfAnnotations,
          page,
          linkService: this._buildLinkService(),
          renderForms: false,
        });
      }
    } catch (err) { debugLog('Link layer failed', err?.name); }

    // Fix H-3: do NOT store _rawImageData — dark mode uses CSS filter instead
    const pageData = {
      pageNum, canvas, context: ctx, viewport,
      annotationLayer, textLayerDiv, linkLayerDiv,
      pageContainer,
      pdfWidth:  viewport.viewBox[2] - viewport.viewBox[0],
      pdfHeight: viewport.viewBox[3] - viewport.viewBox[1],
    };
    this.pages.push(pageData);
  }

  // ── Link service ─────────────────────────────────────────────
  _buildLinkService() {
    const self = this;
    return {
      getDestinationHash:   () => '#',
      getAnchorUrl:         () => '#',
      navigateTo:           () => {},
      addLinkAttributes(link, url, newWindow) {
        let safeUrl = null;
        try {
          const parsed = new URL(url);
          if (TRUSTED_EXTERNAL_LINK_PROTOCOLS.has(parsed.protocol)) safeUrl = parsed.href;
        } catch {}
        if (!safeUrl) {
          link.removeAttribute('href');
          link.addEventListener('click', (e) => e.preventDefault());
          return;
        }
        link.href   = safeUrl;
        link.target = '_blank';
        link.rel    = 'noopener noreferrer';
        link.addEventListener('click', (e) => {
          if (self.tool !== 'select') { e.preventDefault(); return; }
        });
      },
      goToDestination(dest) {
        if (!dest) return;
        const pageNum = Array.isArray(dest) ? dest[0] : null;
        if (typeof pageNum === 'number') self.goToPage(pageNum + 1);
      },
      externalLinkEnabled: true,
      externalLinkRel:     'noopener noreferrer',
      externalLinkTarget:  2,
    };
  }

  // ── Interaction (Fix L-7: pointer events; Fix L-8: rAF throttle) ─────────
  _setupInteraction() {
    this.container.removeEventListener('scroll',       this._boundScroll);
    this.container.removeEventListener('click',        this._boundClick);
    this.container.removeEventListener('pointerdown',  this._boundPointerDown);
    this.container.removeEventListener('pointermove',  this._boundPointerMove);
    this.container.removeEventListener('pointerup',    this._boundPointerUp);
    this.container.addEventListener('scroll',      this._boundScroll);
    this.container.addEventListener('click',       this._boundClick);
    this.container.addEventListener('pointerdown', this._boundPointerDown);
    this.container.addEventListener('pointermove', this._boundPointerMove);
    this.container.addEventListener('pointerup',   this._boundPointerUp);

    document.removeEventListener('pointerup', this._boundDocPointerUp);
    document.addEventListener('pointerup', this._boundDocPointerUp);
  }

  _onScroll() { this._updateCurrentPage(); }
  _onClick(e) { if (this.tool === 'text' && this.onTextAnnotationClick) this.onTextAnnotationClick(e); }

  _onPointerDown(e) {
    if (!['draw','highlight','underline','strikethrough'].includes(this.tool)) return;
    this.container.setPointerCapture?.(e.pointerId);
    this.isDrawing    = true;
    this.drawStartPos = this._relPos(e);
    this.currentPath  = [this.drawStartPos];
    e.preventDefault();
  }

  // Fix L-8: throttle with requestAnimationFrame so high-frequency devices
  // (144 Hz, touch) don't push thousands of redundant points per stroke.
  _onPointerMove(e) {
    if (!this.isDrawing) return;
    if (this._rafPending) return; // drop this frame — rAF will catch the next
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      if (!this.isDrawing) return;
      const pos = this._relPos(e);
      this.currentPath.push(pos);
      this.onDrawingMove?.(this.currentPath, this.drawStartPos, pos);
    });
  }

  _onPointerUp(e) { this._endDraw(e); }
  _onDocPointerUp(e) {
    if (this.isDrawing && !this.container.contains(e.target)) this._endDraw(e);
  }

  _endDraw(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    const pos = this._relPos(e);
    this.currentPath.push(pos);
    this.onDrawingEnd?.(this.currentPath, this.drawStartPos, pos);
    this.currentPath = []; this.drawStartPos = null;
  }

  _relPos(e) {
    const r = this.container.getBoundingClientRect();
    return { x: e.clientX - r.left + this.container.scrollLeft,
             y: e.clientY - r.top  + this.container.scrollTop };
  }

  _updateCurrentPage() {
    const mid = this.container.scrollTop + this.container.clientHeight / 2;
    for (const p of this.pages) {
      const top = p.pageContainer.offsetTop;
      if (mid >= top && mid < top + p.pageContainer.offsetHeight) {
        if (this.currentPage !== p.pageNum) { this.currentPage = p.pageNum; this.onPageChange?.(p.pageNum); }
        break;
      }
    }
  }

  // ── Zoom ──────────────────────────────────────────────────────
  setZoom(zoomLevel, onComplete) {
    this.zoom = zoomLevel;
    this._renderAllPages().then(() => { this._setupInteraction(); onComplete?.(); });
  }
  zoomIn()  { this.setZoom(Math.min(this.zoom + 0.25, 3.0)); }
  zoomOut() { this.setZoom(Math.max(this.zoom - 0.25, 0.25)); }

  // ── Tool ──────────────────────────────────────────────────────
  setTool(tool) {
    if (!VALID_TOOLS.has(tool)) return;
    this.tool = tool;
    const cursors = { select:'default', text:'text', draw:'crosshair', highlight:'crosshair', underline:'crosshair', strikethrough:'crosshair' };
    this.container.style.cursor = cursors[tool] || 'default';

    document.querySelectorAll('.pdf-text-layer').forEach(tl => {
      tl.style.pointerEvents = (tool === 'select') ? 'auto' : 'none';
    });
    document.querySelectorAll('.pdf-link-layer').forEach(ll => {
      ll.style.pointerEvents = (tool === 'select') ? 'auto' : 'none';
    });
    document.querySelectorAll('.annotation-layer').forEach(al => {
      al.classList.toggle('interactive', tool !== 'select');
    });
  }

  // ── Helpers ───────────────────────────────────────────────────
  getPageFromPosition(pos) {
    for (const p of this.pages) {
      const top = p.pageContainer.offsetTop;
      if (pos.y >= top && pos.y < top + p.pageContainer.offsetHeight)
        return { page: p, localY: pos.y - top, localX: pos.x };
    }
    return null;
  }

  getPageDimensions(pageNum) {
    const p = this.pages[pageNum - 1];
    return p ? { pdfWidth: p.pdfWidth, pdfHeight: p.pdfHeight, scale: this.zoom * 1.5 } : null;
  }

  getAnnotationLayer(pageNum) { return this.pages[pageNum-1]?.annotationLayer ?? null; }
  getPageInfo(pageNum) {
    const p = this.pages[pageNum-1];
    return p ? { viewport: p.viewport, annotationLayer: p.annotationLayer, pageContainer: p.pageContainer } : null;
  }
  goToPage(n) {
    if (n >= 1 && n <= this.totalPages && this.pages[n-1]) {
      this.pages[n-1].pageContainer.scrollIntoView({ behavior:'smooth' });
      this.currentPage = n;
    }
  }
  print()          { window.print(); }
  getTotalPages()  { return this.totalPages; }
  getCurrentPage() { return this.currentPage; }
  getZoom()        { return this.zoom; }

  destroy() {
    document.removeEventListener('pointerup', this._boundDocPointerUp);
    this.container.removeEventListener('pointerdown', this._boundPointerDown);
    this.container.removeEventListener('pointermove', this._boundPointerMove);
    this.container.removeEventListener('pointerup',   this._boundPointerUp);
    if (this.pdfDoc) { try { this.pdfDoc.destroy(); } catch {} this.pdfDoc = null; }
    this.pages = [];
  }
}
