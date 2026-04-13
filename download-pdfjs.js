// Toolbar - UI for all controls
export class Toolbar {
  constructor(app) {
    this.app = app;
    this.callbacks = {};
    this.sidebarOpen = false;
    
    this.render();
    this.setupEventListeners();
  }

  setCallbacks(callbacks) {
    this.callbacks = callbacks;
  }

  render() {
    // Create toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.innerHTML = this.getToolbarHTML();
    
    // Insert at beginning of body
    document.body.insertBefore(toolbar, document.body.firstChild);
    
    // Create sidebar
    this.renderSidebar();
  }

  getToolbarHTML() {
    return `
      <!-- File Controls -->
      <div class="toolbar-group file-controls">
        <button class="tool-btn tooltip" id="btn-open" data-tooltip="Open PDF (Ctrl+O)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
        </button>
        <button class="tool-btn tooltip" id="btn-download" data-tooltip="Download PDF">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7,10 12,15 17,10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button class="tool-btn tooltip" id="btn-print" data-tooltip="Print (Ctrl+P)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6,9 6,2 18,2 18,9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
        </button>
      </div>

      <!-- Tool Controls -->
      <div class="toolbar-group tool-controls">
        <button class="tool-btn tooltip active" data-tool="select" data-tooltip="Select (V)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
          </svg>
        </button>
        <button class="tool-btn tooltip" data-tool="highlight" data-tooltip="Highlight (H)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
        <button class="tool-btn tooltip" data-tool="underline" data-tooltip="Underline (U)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/>
            <line x1="4" y1="21" x2="20" y2="21"/>
          </svg>
        </button>
        <button class="tool-btn tooltip" data-tool="strikethrough" data-tooltip="Strikethrough (S)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="4" y1="12" x2="20" y2="12"/>
            <path d="M17.5 7.5c0-2-1.5-3.5-5.5-3.5S6 5.5 6 7.5c0 4 12 4 12 8 0 2-2 3.5-6 3.5s-6-1.5-6-3.5"/>
          </svg>
        </button>
        <button class="tool-btn tooltip" data-tool="text" data-tooltip="Text Note (T)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        <button class="tool-btn tooltip" data-tool="draw" data-tooltip="Draw (D)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
            <path d="M2 2l7.586 7.586"/>
            <circle cx="11" cy="11" r="2"/>
          </svg>
        </button>
        
        <!-- Color Picker -->
        <div class="dropdown" id="color-dropdown">
          <button class="tool-btn tooltip" id="btn-color" data-tooltip="Annotation Color">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="4" fill="currentColor"/>
            </svg>
          </button>
          <div class="dropdown-content" id="color-picker-popup">
            <label>Annotation Colors</label>
            <div class="color-options" data-color-group="highlight">
              <div class="color-swatch" style="background: #e0af68" data-color="#e0af68"></div>
              <div class="color-swatch" style="background: #9ece6a" data-color="#9ece6a"></div>
              <div class="color-swatch" style="background: #7aa2f7" data-color="#7aa2f7"></div>
              <div class="color-swatch" style="background: #f7768e" data-color="#f7768e"></div>
              <div class="color-swatch" style="background: #bb9af7" data-color="#bb9af7"></div>
              <div class="color-swatch" style="background: #7dcfff" data-color="#7dcfff"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation Controls -->
      <div class="toolbar-group navigation-controls">
        <button class="tool-btn" id="btn-prev-page">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
        </button>
        <div class="page-nav">
          <input type="number" class="page-input" id="page-input" min="1" value="1">
          <span class="page-total">/ <span id="page-total">0</span></span>
        </div>
        <button class="tool-btn" id="btn-next-page">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9,18 15,12 9,6"/>
          </svg>
        </button>
      </div>

      <!-- Zoom Controls -->
      <div class="toolbar-group zoom-controls">
        <button class="tool-btn" id="btn-zoom-out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <span class="zoom-display" id="zoom-display">100%</span>
        <button class="tool-btn" id="btn-zoom-in">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="11" y1="8" x2="11" y2="14"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
      </div>

      <!-- View Controls -->
      <div class="toolbar-group view-controls">

        <!-- Dark Mode Cycle Button -->
        <button class="tool-btn tooltip" id="btn-dark-mode" data-tooltip="Dark Mode (off)" data-dark-mode="off">
          <!-- Moon icon — shown when mode is 'off' -->
          <svg id="icon-dark-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
          <!-- Filled moon — shown when mode is 'dark' -->
          <svg id="icon-dark-on" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="display:none">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
          <!-- Sepia sun — shown when mode is 'sepia' -->
          <svg id="icon-dark-sepia" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        </button>

        <button class="tool-btn tooltip" id="btn-sidebar" data-tooltip="Annotations Panel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
        </button>
        <button class="tool-btn tooltip" id="btn-save" data-tooltip="Save Annotations (Ctrl+S)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17,21 17,13 7,13 7,21"/>
            <polyline points="7,3 7,8 15,8"/>
          </svg>
        </button>
      </div>
    `;
  }

  renderSidebar() {
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';
    sidebar.id = 'sidebar';
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <h3>Annotations</h3>
        <button class="tool-btn" id="btn-close-sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="sidebar-content">
        <div class="empty-state" id="annotations-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
          <p>No annotations yet</p>
          <p style="font-size: 12px; margin-top: 8px;">Use the tools above to start annotating</p>
        </div>
        <ul class="annotation-list" id="annotation-list"></ul>
      </div>
    `;
    
    document.body.appendChild(sidebar);
  }

  setupEventListeners() {
    // Tool buttons
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        this.setActiveTool(btn);
        this.callbacks.onToolChange?.(tool);
      });
    });
    
    // Color picker
    document.getElementById('btn-color')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const popup = document.getElementById('color-picker-popup');
      popup.classList.toggle('show');
    });
    
    // Color swatches
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = swatch.dataset.color;
        this.setActiveColor(swatch);
        this.callbacks.onColorChange?.(color);
        document.getElementById('color-picker-popup')?.classList.remove('show');
      });
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      document.getElementById('color-picker-popup')?.classList.remove('show');
    });
    
    // Page navigation
    document.getElementById('btn-prev-page')?.addEventListener('click', () => {
      const input = document.getElementById('page-input');
      const page = Math.max(1, parseInt(input.value) - 1);
      input.value = page;
      this.callbacks.onPageChange?.(page);
    });
    
    document.getElementById('btn-next-page')?.addEventListener('click', () => {
      const input = document.getElementById('page-input');
      const total = parseInt(document.getElementById('page-total').textContent);
      const page = Math.min(total, parseInt(input.value) + 1);
      input.value = page;
      this.callbacks.onPageChange?.(page);
    });
    
    document.getElementById('page-input')?.addEventListener('change', (e) => {
      const page = parseInt(e.target.value);
      const total = parseInt(document.getElementById('page-total').textContent);
      if (page >= 1 && page <= total) {
        this.callbacks.onPageChange?.(page);
      } else {
        e.target.value = 1;
      }
    });
    
    // Zoom controls
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      const display = document.getElementById('zoom-display');
      let zoom = parseInt(display.textContent) - 25;
      zoom = Math.max(25, zoom);
      display.textContent = zoom + '%';
      this.callbacks.onZoomChange?.(zoom / 100);
    });
    
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      const display = document.getElementById('zoom-display');
      let zoom = parseInt(display.textContent) + 25;
      zoom = Math.min(300, zoom);
      display.textContent = zoom + '%';
      this.callbacks.onZoomChange?.(zoom / 100);
    });
    
    // File operations
    document.getElementById('btn-open')?.addEventListener('click', () => {
      this.callbacks.onOpenFile?.();
    });
    
    document.getElementById('btn-download')?.addEventListener('click', () => {
      this.callbacks.onDownload?.();
    });
    
    document.getElementById('btn-print')?.addEventListener('click', () => {
      this.callbacks.onPrint?.();
    });
    
    document.getElementById('btn-save')?.addEventListener('click', () => {
      this.callbacks.onSavePDF?.();
    });
    
    // Dark mode cycle: off → dark → sepia → off
    document.getElementById('btn-dark-mode')?.addEventListener('click', () => {
      const btn   = document.getElementById('btn-dark-mode');
      const modes = ['off', 'dark', 'sepia'];
      const labels = { off: 'Dark Mode (off)', dark: 'Dark Mode (on)', sepia: 'Sepia Mode' };
      const current = btn.dataset.darkMode || 'off';
      const next    = modes[(modes.indexOf(current) + 1) % modes.length];
      btn.dataset.darkMode = next;
      btn.dataset.tooltip  = labels[next];

      // Swap icon
      document.getElementById('icon-dark-off').style.display   = next === 'off'   ? '' : 'none';
      document.getElementById('icon-dark-on').style.display    = next === 'dark'  ? '' : 'none';
      document.getElementById('icon-dark-sepia').style.display = next === 'sepia' ? '' : 'none';

      // Active highlight on button
      btn.classList.toggle('active', next !== 'off');

      // Tint the page background for sepia
      const container = document.querySelector('.viewer-container');
      if (container) {
        container.dataset.darkMode = next;
      }

      this.callbacks.onDarkModeChange?.(next);
    });

    // Sidebar
    document.getElementById('btn-sidebar')?.addEventListener('click', () => {
      this.toggleSidebar();
    });
    
    document.getElementById('btn-close-sidebar')?.addEventListener('click', () => {
      this.toggleSidebar();
    });
  }

  setActiveTool(activeBtn) {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.classList.remove('active');
    });
    activeBtn.classList.add('active');
  }

  setActiveColor(activeSwatch) {
    document.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.classList.remove('active');
    });
    activeSwatch.classList.add('active');
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
    const sidebar = document.getElementById('sidebar');
    const container = document.querySelector('.viewer-container');
    
    if (sidebar) {
      sidebar.classList.toggle('open', this.sidebarOpen);
    }
    if (container) {
      container.classList.toggle('sidebar-open', this.sidebarOpen);
    }
    
    if (this.sidebarOpen) {
      this.updateAnnotationList();
    }
  }

  updateAnnotationList() {
    const list = document.getElementById('annotation-list');
    const emptyState = document.getElementById('annotations-empty');
    
    if (!list || !emptyState) return;
    
    const annotations = this.app.annotationManager?.getAnnotations() || [];
    
    if (annotations.length === 0) {
      emptyState.style.display = 'block';
      list.innerHTML = '';
      return;
    }
    
    emptyState.style.display = 'none';
    list.innerHTML = annotations.map(ann => `
      <li class="annotation-item">
        <div class="annotation-color" style="background: ${ann.color}"></div>
        <div class="annotation-content">
          <div class="annotation-type">${ann.type}</div>
          <div class="annotation-text">${ann.text || 'Page ' + ann.page}</div>
          <div class="annotation-page">Page ${ann.page}</div>
        </div>
        <div class="annotation-actions">
          <button data-delete-id="${ann.id}" title="Delete annotation">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </li>
    `).join('');
    
    // Setup delete buttons
    list.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.deleteId;
        this.callbacks.onDeleteAnnotation?.(id);
        this.updateAnnotationList();
      });
    });
  }

  updatePageInfo(currentPage, totalPages) {
    const input = document.getElementById('page-input');
    const total = document.getElementById('page-total');
    
    if (input) input.value = currentPage;
    if (total) total.textContent = totalPages;
  }

  updateZoom(zoom) {
    const display = document.getElementById('zoom-display');
    if (display) {
      display.textContent = Math.round(zoom * 100) + '%';
    }
  }
}
