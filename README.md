# PDF Annotator Pro — Chrome Extension

A modern, full-featured PDF viewer and annotator built as a Manifest V3 Chrome extension.

---

## Features

### 📖 PDF Viewing
- High-quality rendering via the **locally bundled** PDF.js library (offline, no CDN)
- Progressive page rendering — pages appear as they render, no blank-screen wait
- Zoom from 25 % to 300 % (race-condition-safe: only the latest render wins)
- Jump-to-page input, smooth scroll navigation

### ✏️ Annotation Tools

| Tool | Shortcut | Notes |
|------|----------|-------|
| Select | `v` | Interact with existing annotations |
| Highlight | `h` | Filled rectangle |
| Underline | `u` | Line under a drag stroke |
| Strikethrough | `s` | Line through a drag stroke |
| Text Note | `t` | Click to place; saves immediately |
| Freehand Draw | `d` | Stroke finalises even if mouse leaves window |

Shortcuts are **case-sensitive** (`s` only — `Shift+S` is ignored).
Shortcuts are suppressed when a text input or textarea is focused.

### 🌙 Dark Mode
Three-state toggle (click toolbar moon icon to cycle):
- **Off** — original PDF rendering
- **Dark** — HSL-aware transform: whites → dark, colours stay vivid
- **Sepia** — warm parchment tone

### 💾 Persistence
- `chrome.storage.local` (not `localStorage` — unavailable in MV3 extension pages)
- Storage key = `pdf_ann_<SHA-256(canonicalUrl)[0:32]>` — two PDFs with the same
  filename from different locations are always stored separately

---

## Installation

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `pdf-annotator` folder
4. The extension icon appears in Chrome's toolbar

### PDF.js
Bundled locally in `lib/`:
```
lib/pdf.min.js          — main library
lib/pdf.worker.min.js   — web worker
```
No internet connection required. To update PDF.js: `cd scripts && node download-pdfjs.js`

---

## Project structure
```
pdf-annotator/
├── manifest.json           Chrome MV3 manifest
├── background.js           Service worker (PDF URL interception)
├── viewer.html             Viewer page (loads the app)
├── popup.html              Extension toolbar popup
├── newtab.html             Optional new-tab override
├── css/
│   ├── styles.css          Global design tokens & base styles
│   ├── toolbar.css         Toolbar & sidebar styles
│   └── viewer.css          PDF viewer & annotation styles
├── js/
│   ├── viewer.js           Main app (PDFAnnotatorApp)
│   ├── pdf-viewer.js       PDFViewer class
│   ├── annotations.js      AnnotationManager class
│   └── toolbar.js          Toolbar class
├── lib/
│   ├── pdf.min.js          PDF.js library
│   └── pdf.worker.min.js   PDF.js worker
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── scripts/
    └── download-pdfjs.js   Node.js script to update PDF.js
```

---

## Usage

### Opening a PDF
- Click the extension icon → **Open PDF File**
- Drag & drop a `.pdf` file onto the extension page (accepts any MIME type as long
  as the file extension is `.pdf`)
- `Ctrl+O` from within the viewer
- Navigate to any `http://`, `https://`, or `file://` URL whose path ends in `.pdf`

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open file picker |
| `Ctrl+S` | Save annotations |
| `Ctrl+P` | Print |
| `v` | Select tool |
| `h` | Highlight |
| `u` | Underline |
| `s` | Strikethrough |
| `t` | Text note |
| `d` | Draw |

---

## Technical details

### Annotation data model
Coordinates are stored **scale-normalised** (divided by the render scale at creation
time) so annotations render in the correct position at any zoom level.

```json
{
  "id":        "ann_<uuid>",
  "type":      "highlight",
  "page":      1,
  "startPos":  { "x": 0.42, "y": 0.18 },
  "endPos":    { "x": 0.71, "y": 0.22 },
  "color":     "#e0af68",
  "opacity":   0.4,
  "size":      2,
  "createdAt": 1700000000000
}
```

### Storage
- API: `chrome.storage.local` (**not** `window.localStorage`)
- Key: `pdf_ann_<first 32 hex chars of SHA-256(canonicalUrl)>`
- Loaded annotations are validated (must be array of objects with `id`, `type`, `page`)
  before use to prevent crashes from corrupt or imported data

### Security
- Error messages are set via `textContent` — never interpolated into `innerHTML`
- Sidebar annotation list is built via DOM APIs — no user data in `innerHTML`
- Annotation colours are validated against `/^#[0-9a-f]{3}([0-9a-f]{3})?$/i` before use
- Only `http:`, `https:`, and `file:` URLs are redirected to the viewer
- PDF URL detection checks the **pathname only** (not query string or fragment)

### Resource management
- Blob URLs are revoked when a new file is opened or the session is torn down
- PDF.js documents are destroyed (`pdfDoc.destroy()`) on each new load
- `ImageData` buffers are nulled before re-render to allow GC

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Extension not loading | Enable Developer mode; check `chrome://extensions/` |
| PDF not rendering | Open DevTools (F12) → Console for PDF.js errors |
| Annotations not saving | Verify storage permission in manifest; check incognito settings |
| Icons missing | Run `node icons/create-icons.js` (requires `canvas` npm package) |

---

## Roadmap
- [ ] Export PDF with baked-in annotations
- [ ] Search within PDF text layer
- [ ] Bookmarks / table of contents panel
- [ ] Shape annotations (rectangle, ellipse, arrow)

---

**MIT License** — use and modify freely.
