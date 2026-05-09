// PDF Annotator - PDF Viewer Module
import { pdfjsLib } from './pdf.min.js';

export class PDFViewer {
  constructor(containerId) {
    this.containerId = containerId;
    this.pdfDoc = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.scale = 1.0;
    this.canvas = null;
    this.ctx = null;
    this.annotationLayers = [];
    this.onPageChange = null;
    
    this.init();
  }

  async init() {
    // Initialize PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
    
    let container = document.getElementById(this.containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = this.containerId;
      container.className = 'pdf-container';
      document.body.appendChild(container);
    }
    container.style.display = '';
  }

  async loadPDF(url) {
    try {
      const loadingTask = pdfjsLib.getDocument(url);
      this.pdfDoc = await loadingTask.promise;
      this.totalPages = this.pdfDoc.numPages;
      
      await this.renderPage(1);
    } catch (error) {
      console.error('Error loading PDF:', error);
      throw error;
    }
  }

  async renderPage(pageNum) {
    if (!this.pdfDoc) return;
    
    const page = await this.pdfDoc.getPage(pageNum);
    this.currentPage = pageNum;
    
    const viewport = page.getViewport({ scale: this.scale });
    
    // Create or reuse canvas
    let canvasContainer = document.getElementById(`${this.containerId}-canvas`);
    if (!canvasContainer) {
      canvasContainer = document.createElement('div');
      canvasContainer.id = `${this.containerId}-canvas`;
      canvasContainer.className = 'canvas-container';
      const container = document.getElementById(this.containerId);
      if (container) container.appendChild(canvasContainer);
    }
    
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pdf-canvas';
    this.ctx = this.canvas.getContext('2d');
    this.canvas.height = viewport.height;
    this.canvas.width = viewport.width;
    
    canvasContainer.innerHTML = '';
    canvasContainer.appendChild(this.canvas);
    
    const renderContext = {
      canvasContext: this.ctx,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    // Create annotation layer
    this.createAnnotationLayer(viewport);
    
    if (this.onPageChange) {
      this.onPageChange(pageNum);
    }
  }

  createAnnotationLayer(viewport) {
    const pageNum = this.currentPage;
    let annotationLayer = document.getElementById(`annotation-layer-${pageNum}`);
    
    if (annotationLayer) {
      annotationLayer.remove();
    }
    
    annotationLayer = document.createElement('div');
    annotationLayer.id = `annotation-layer-${pageNum}`;
    annotationLayer.className = 'annotation-layer';
    annotationLayer.style.position = 'absolute';
    annotationLayer.style.top = '0';
    annotationLayer.style.left = '0';
    annotationLayer.style.width = `${viewport.width}px`;
    annotationLayer.style.height = `${viewport.height}px`;
    annotationLayer.style.pointerEvents = 'auto';
    
    const canvasContainer = document.getElementById(`${this.containerId}-canvas`);
    if (canvasContainer) {
      canvasContainer.style.position = 'relative';
      canvasContainer.appendChild(annotationLayer);
    }
    
    this.annotationLayers[pageNum] = annotationLayer;
  }

  getAnnotationLayer(pageNum = this.currentPage) {
    return this.annotationLayers[pageNum] || null;
  }

  goToPage(pageNum) {
    if (pageNum >= 1 && pageNum <= this.totalPages) {
      this.renderPage(pageNum);
    }
  }

  setZoom(newScale) {
    this.scale = newScale;
    this.renderPage(this.currentPage);
  }

  getZoom() {
    return this.scale;
  }

  getTotalPages() {
    return this.totalPages;
  }

  getCurrentPage() {
    return this.currentPage;
  }

  setTool(tool) {
    // Tool handling is done by annotation manager
    this.currentTool = tool;
  }

  print() {
    window.print();
  }
}
