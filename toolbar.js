// PDF Annotator - Main Viewer Script
import { PDFViewer } from './pdf-viewer.js';
import { AnnotationManager } from './annotations.js';
import { Toolbar } from './toolbar.js';

class PDFAnnotatorApp {
  constructor() {
    this.pdfViewer         = null;
    this.annotationManager = null;
    this.toolbar           = null;
    this.currentFile       = null;
    this.fileName          = 'document';
    
    this.init();
  }

  async init() {
    console.log('PDF Annotator initializing...');
    
    const urlParams = new URLSearchParams(window.location.search);
    const pdfUrl    = urlParams.get('file');
    const pdfName   = urlParams.get('name');
    
    if (pdfName) this.fileName = pdfName.replace('.pdf', '');
    
    if (pdfUrl) {
      try {
        await this.loadPDF(pdfUrl);
      } catch (error) {
        console.error('Failed to initialize:', error);
        this.showError(`Failed to load PDF: ${error.message}`);
      }
    } else {
      this.showDropZone();
    }
    
    this.setupEventListeners();
  }

  async loadPDF(url) {
    try {
      console.log('Loading PDF from:', url);
      this.showLoading();
      
      this.currentFile = url;
      
      // Initialize PDF viewer (will reuse or create #pdf-container)
      this.pdfViewer = new PDFViewer('pdf-container');
      
      // FIX: Create AnnotationManager first, then Toolbar, then set the viewer
      // so that setViewer() triggers setupDrawingCallbacks() with a valid viewer
      this.annotationManager = new AnnotationManager(this.fileName);
      this.toolbar           = new Toolbar(this);
      
      // Load the PDF
      await this.pdfViewer.loadPDF(url);
      
      // FIX: Connect viewer to annotation manager AFTER PDF is loaded
      // (annotation layers exist now)
      this.annotationManager.setViewer(this.pdfViewer);
      
      // Page-change callback updates the toolbar page indicator
      this.pdfViewer.onPageChange = (page) => {
        if (this.toolbar) this.toolbar.updatePageInfo(page, this.pdfViewer.getTotalPages());
      };
      
      this.toolbar.setCallbacks({
        onPageChange:      (page)    => this.goToPage(page),
        onZoomChange:      (zoom)    => this.setZoom(zoom),
        onToolChange:      (tool)    => this.setTool(tool),
        onColorChange:     (color)   => this.setColor(color),
        onOpacityChange:   (opacity) => this.setOpacity(opacity),
        onSizeChange:      (size)    => this.setSize(size),
        onToggleSidebar:   ()        => this.toggleSidebar(),
        onDeleteAnnotation:(id)      => this.deleteAnnotation(id),
        onSavePDF:         ()        => this.savePDF(),
        onOpenFile:        ()        => this.openFile(),
        onPrint:           ()        => this.printPDF(),
        onDownload:        ()        => this.downloadPDF(),
        onDarkModeChange:  (mode)    => this.setDarkMode(mode)
      });
      
      await this.annotationManager.loadAnnotations();
      
      if (this.toolbar) {
        this.toolbar.updatePageInfo(1, this.pdfViewer.getTotalPages());
        this.toolbar.updateZoom(this.pdfViewer.getZoom());
      }
      
      this.hideLoading();
      console.log('PDF loaded successfully');
      
    } catch (error) {
      console.error('Error loading PDF:', error);
      this.hideLoading();
      throw error;
    }
  }

  showDropZone() {
    // FIX: Don't wipe body.innerHTML — it destroys the #pdf-container
    // and any already-rendered toolbar. Hide the container instead.
    const existingContainer = document.getElementById('pdf-container');
    if (existingContainer) existingContainer.style.display = 'none';
    
    // Remove any existing drop zone first
    const existing = document.getElementById('drop-zone');
    if (existing) existing.remove();
    
    const dropZone = document.createElement('div');
    dropZone.className = 'drop-zone';
    dropZone.id        = 'drop-zone';
    dropZone.innerHTML = `
      <div class="drop-zone-content">
        <svg class="drop-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <path d="M12 18v-6"/>
          <path d="M9 15l3-3 3 3"/>
        </svg>
        <h1 class="drop-zone-title">PDF Annotator Pro</h1>
        <p class="drop-zone-subtitle">Open a PDF to start annotating</p>
        <button class="open-file-btn" id="open-file-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
          Choose PDF File
        </button>
        <p class="drop-zone-hint">Or drag and drop a PDF file here</p>
        <input type="file" id="file-input" accept=".pdf,application/pdf" style="display:none">
      </div>
    `;
    document.body.appendChild(dropZone);
    this.setupDropZone();
  }

  setupDropZone() {
    const dropZone    = document.getElementById('drop-zone');
    const openFileBtn = document.getElementById('open-file-btn');
    const fileInput   = document.getElementById('file-input');
    
    if (!dropZone || !openFileBtn || !fileInput) {
      console.error('Drop zone elements not found');
      return;
    }
    
    openFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) this.handleFile(e.target.files[0]);
    });
    
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'application/pdf') this.handleFile(file);
    });
  }

  handleFile(file) {
    console.log('Handling file:', file.name);
    this.fileName = file.name.replace('.pdf', '');
    const url = URL.createObjectURL(file);
    
    // FIX: Remove drop zone before loading so it doesn't interfere with the viewer layout
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) dropZone.remove();
    
    this.loadPDF(url);
  }

  showLoading() {
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) dropZone.remove();
    
    let loadingEl = document.getElementById('loading');
    if (!loadingEl) {
      loadingEl = document.createElement('div');
      loadingEl.className = 'loading-container';
      loadingEl.id        = 'loading';
      loadingEl.innerHTML = `
        <div class="loading-spinner"></div>
        <p class="loading-text">Loading PDF...</p>
      `;
      document.body.appendChild(loadingEl);
    }
  }

  hideLoading() {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.remove();
    
    // FIX: Make sure the pdf-container is visible after loading
    const container = document.getElementById('pdf-container');
    if (container) container.style.display = '';
  }

  showError(message) {
    // FIX: Don't wipe body — insert error in a safe overlay
    let errEl = document.getElementById('error-overlay');
    if (errEl) errEl.remove();
    errEl = document.createElement('div');
    errEl.id        = 'error-overlay';
    errEl.className = 'error-container';
    errEl.innerHTML = `
      <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <h1 class="error-title">Oops! Something went wrong</h1>
      <p class="error-message">${message}</p>
      <button class="btn btn-primary" onclick="location.reload()">Reload</button>
    `;
    document.body.appendChild(errEl);
  }

  setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'o': e.preventDefault(); this.openFile(); break;
          case 's': e.preventDefault(); this.savePDF();  break;
          case 'p': e.preventDefault(); this.printPDF(); break;
        }
      } else if (!e.altKey) {
        // FIX: Guard against firing shortcuts when typing in inputs/textareas
        if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
        switch (e.key.toLowerCase()) {
          case 'v': this.setTool('select');        break;
          case 'h': this.setTool('highlight');     break;
          case 'u': this.setTool('underline');     break;
          case 't': this.setTool('text');          break;
          case 'd': this.setTool('draw');          break;
          case 's': this.setTool('strikethrough'); break;
        }
      }
    });
  }

  openFile() {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.pdf,application/pdf';
    input.onchange = (e) => { if (e.target.files[0]) this.handleFile(e.target.files[0]); };
    input.click();
  }

  goToPage(page) { if (this.pdfViewer) this.pdfViewer.goToPage(page); }

  setZoom(zoom) {
    if (this.pdfViewer) {
      this.pdfViewer.setZoom(zoom);
      // Re-attach callbacks after re-render
      this.pdfViewer.onPageChange = (page) => {
        if (this.toolbar) this.toolbar.updatePageInfo(page, this.pdfViewer.getTotalPages());
      };
      // FIX: Re-attach annotation callbacks after zoom re-render (annotation layers are recreated)
      if (this.annotationManager) this.annotationManager.setupDrawingCallbacks();
    }
  }

  setTool(tool) {
    if (this.pdfViewer)        this.pdfViewer.setTool(tool);
    if (this.annotationManager) this.annotationManager.setTool(tool);
    // FIX: Also update the toolbar active state when tool is changed via keyboard
    if (this.toolbar) {
      const btn = document.querySelector(`[data-tool="${tool}"]`);
      if (btn) this.toolbar.setActiveTool(btn);
    }
  }

  setColor(color)     { if (this.annotationManager) this.annotationManager.setColor(color); }
  setOpacity(opacity) { if (this.annotationManager) this.annotationManager.setOpacity(opacity); }
  setSize(size)       { if (this.annotationManager) this.annotationManager.setSize(size); }
  setDarkMode(mode)   { if (this.pdfViewer)         this.pdfViewer.setDarkMode(mode); }
  toggleSidebar()     { if (this.toolbar)            this.toolbar.toggleSidebar(); }
  deleteAnnotation(id){ if (this.annotationManager)  this.annotationManager.deleteAnnotation(id); }

  async savePDF() {
    if (!this.annotationManager || !this.pdfViewer) {
      // FIX: Use a non-blocking notification instead of alert()
      this.showToast('No PDF loaded to save');
      return;
    }
    try {
      await this.annotationManager.saveToStorage();
      this.showToast('Annotations saved!');
    } catch (error) {
      console.error('Error saving:', error);
      this.showToast('Failed to save annotations');
    }
  }

  // FIX: Add a non-blocking toast notification (alert() can be annoying)
  showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id    = 'toast';
      toast.style.cssText = `
        position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
        background:var(--bg-elevated,#2f3549); color:var(--text-primary,#c0caf5);
        padding:10px 20px; border-radius:8px; font-size:14px;
        box-shadow:0 4px 16px rgba(0,0,0,.4); z-index:9999;
        transition:opacity .3s ease; pointer-events:none;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  }

  printPDF()    { if (this.pdfViewer) this.pdfViewer.print(); }

  downloadPDF() {
    if (this.currentFile) {
      const a    = document.createElement('a');
      a.href     = this.currentFile;
      a.download = this.fileName + '.pdf';
      a.click();
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM ready, initializing app...');
  window.app = new PDFAnnotatorApp();
});
