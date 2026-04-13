# PDF Annotator Pro - Chrome Extension

A modern, full-featured PDF viewer and annotator Chrome extension with beautiful dark mode support.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)

## Features

### 📖 PDF Viewing
- **High-quality rendering** - Powered by PDF.js for accurate PDF rendering
- **Smooth navigation** - Scroll through pages with ease
- **Zoom controls** - Zoom in/out from 25% to 300%
- **Page navigation** - Jump to any page instantly

### ✏️ Annotation Tools
- **Highlight** - Mark important text with colorful highlights
- **Underline** - Underline key passages
- **Strikethrough** - Cross out text you want to mark for deletion
- **Text Notes** - Add sticky notes anywhere on the PDF
- **Freehand Drawing** - Draw freely on the PDF with customizable colors and sizes

### 🎨 Modern Dark Mode
- **Tokyo Night inspired** - Beautiful dark palette with vibrant accent colors
- **Easy on the eyes** - Reduced eye strain during long reading sessions
- **Consistent theming** - All UI elements follow the dark theme

### 💾 Save & Load
- **Auto-save** - Annotations are automatically saved to local storage
- **Persistent** - Your annotations persist across sessions
- **Per-document** - Each PDF file has its own set of annotations

## Installation

### Step 1: Download/Clone the Extension

The extension files should be in a single folder:
```
pdf-annotator/
├── manifest.json
├── background.js
├── viewer.html
├── popup.html
├── newtab.html
├── css/
│   ├── styles.css
│   ├── toolbar.css
│   └── viewer.css
├── js/
│   ├── viewer.js
│   ├── pdf-viewer.js
│   ├── annotations.js
│   └── toolbar.js
└── icons/
    ├── icon.svg
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Step 2: PDF.js Library (Already Downloaded ✓)

PDF.js has been downloaded locally to the `lib/` folder. No additional action needed!

The library includes:
- `lib/pdf.min.js` - Main PDF.js library
- `lib/pdf.worker.min.js` - Web worker for PDF processing

If you need to update PDF.js in the future:
```bash
cd scripts
node download-pdfjs.js
```

### Step 2.5: Icons (Already Generated ✓)

The extension icons have been generated automatically. No additional action needed!

If you want to regenerate or customize the icons:
```bash
cd icons
node create-icons.js
```

### Step 3: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `pdf-annotator` folder
5. The extension should now be installed!

### Step 4: Set as Default PDF Viewer (Windows)

To make this extension open PDFs by default:

**Method 1: Windows Settings**
1. Right-click any PDF file
2. Select **Properties**
3. Under "Opens with", click **Change**
4. Select **Google Chrome**
5. Click **OK**

**Method 2: Chrome PDF Handler**
1. Open Chrome
2. Click the extension icon in the toolbar
3. Select "Open PDF File"
4. Navigate to your PDF

**Method 3: Drag and Drop**
- Simply drag and drop any PDF file onto the Chrome window with the extension open

## Usage

### Opening PDFs

1. **Click the extension icon** in Chrome's toolbar
2. **Drag and drop** a PDF file onto any extension page
3. **Use Ctrl+O** to open a file dialog

### Annotation Tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Select | `V` | Select and interact with annotations |
| Highlight | `H` | Highlight text/areas with color |
| Underline | `U` | Underline text |
| Strikethrough | `S` | Strike through text |
| Text Note | `T` | Add a text note (click to place) |
| Freehand Draw | `D` | Draw freely on the PDF |

### Color Picker

1. Click the **color picker** icon in the toolbar
2. Select your preferred annotation color
3. Available colors match the modern dark theme palette

### Navigation

- **Previous/Next page** - Use arrow buttons or page input
- **Zoom in/out** - Use + and - buttons (25% to 300%)
- **Scroll** - Use mouse/touchpad to scroll through pages

### Managing Annotations

- **View all annotations** - Click the sidebar button (right panel icon)
- **Delete annotation** - Click the trash icon in the sidebar or on the annotation
- **Edit text notes** - Click on the text area and start typing
- **Save annotations** - Automatically saved, or click the save button

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open PDF file |
| `Ctrl+S` | Save annotations |
| `Ctrl+P` | Print PDF |
| `V` | Select tool |
| `H` | Highlight tool |
| `U` | Underline tool |
| `S` | Strikethrough tool |
| `T` | Text note tool |
| `D` | Draw tool |

## Color Palette

The extension uses the Tokyo Night dark theme:

| Color | Hex | Usage |
|-------|-----|-------|
| Background | `#1a1b26` | Main background |
| Surface | `#24283b` | Cards, panels |
| Elevated | `#292e42` | Elevated surfaces |
| Blue | `#7aa2f7` | Primary accent |
| Purple | `#bb9af7` | Secondary accent |
| Cyan | `#7dcfff` | Tertiary accent |
| Green | `#9ece6a` | Success, highlights |
| Yellow | `#e0af68` | Warnings, highlights |
| Red | `#f7768e` | Errors, highlights |
| Text | `#c0caf5` | Primary text |

## Troubleshooting

### Extension not loading
- Make sure Developer mode is enabled
- Check for errors in `chrome://extensions/`
- Try reloading the extension

### PDFs not rendering
- Check your internet connection (PDF.js loads from CDN)
- Try a different PDF file
- Check Chrome's console for errors (F12)

### Annotations not saving
- Check if localStorage is enabled in Chrome
- Clear localStorage for the extension and try again
- Make sure you're not in incognito mode

### Icons not showing
- Run the icon generation script
- Or manually create PNG icons from the SVG

## Technical Details

### Architecture
- **Manifest V3** - Latest Chrome extension standard
- **PDF.js** - Mozilla's PDF rendering library
- **Vanilla JS** - No framework dependencies for maximum performance
- **CSS Variables** - Easy theming and customization

### Storage
- Annotations are stored in Chrome's localStorage
- Key format: `pdf_annotations_{filename}`
- Data format: JSON array of annotation objects

### Privacy
- All annotations are stored locally on your device
- No data is sent to external servers
- PDF.js loads from public CDN (Cloudflare)

## Future Enhancements

- [ ] Export annotated PDFs
- [ ] Cloud sync for annotations
- [ ] More annotation types (shapes, arrows)
- [ ] Search within PDF
- [ ] Bookmarks and table of contents
- [ ] Split view / compare PDFs
- [ ] OCR support
- [ ] Form filling support

## License

MIT License - Feel free to use and modify!

## Support

For issues, feature requests, or questions, please file an issue on the repository.

---

**Made with ❤️ for productive PDF workflows**
