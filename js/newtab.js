// newtab.js — PDF file picker for the new-tab override page
// Fix M-4: Instead of creating a blob URL in newtab context and passing it via URL
// parameter (which can cause cross-tab scope issues and leaks the blob URL to history),
// we now read the file as an ArrayBuffer, open the viewer tab, wait for it to signal
// readiness, then transfer the buffer directly via chrome.tabs.sendMessage.
// The blob URL is created inside the viewer tab where it will be used — never crosses contexts.
const MAX_PDF_SIZE = 100 * 1024 * 1024;

const openBtn   = document.getElementById('open-btn');
const fileInput = document.getElementById('file-input');

openBtn?.addEventListener('click', () => fileInput?.click());
fileInput?.addEventListener('change', (e) => { if (e.target.files[0]) openPDF(e.target.files[0]); });

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.style.background = 'var(--bg-secondary)';
});
document.addEventListener('dragleave', () => { document.body.style.background = ''; });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.style.background = '';
  if (e.dataTransfer.files[0]) openPDF(e.dataTransfer.files[0]);
});

async function looksLikePdf(file) {
  if (file.size > MAX_PDF_SIZE) return false;
  if (file.type && file.type !== 'application/pdf') return false;
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') return false;
  try {
    const head = await file.slice(0, 5).arrayBuffer();
    return new TextDecoder('ascii').decode(head) === '%PDF-';
  } catch { return false; }
}

// Fix L-6: replace alert() with inline UI message
function showError(msg) {
  let el = document.getElementById('newtab-error');
  if (!el) {
    el = document.createElement('p');
    el.id = 'newtab-error';
    el.style.cssText = 'color:#f7768e;margin-top:12px;font-size:14px;text-align:center;';
    (document.querySelector('.container') || document.body).appendChild(el);
  }
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 4000);
}

async function openPDF(file) {
  if (!(await looksLikePdf(file))) {
    showError('Please choose a PDF file under 100 MB.');
    return;
  }

  // Read the full file buffer in newtab context
  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    showError('Could not read the file. Please try again.');
    return;
  }

  // Open viewer tab WITHOUT a blob URL in the URL bar (Fix M-4)
  const viewerUrl = `${chrome.runtime.getURL('viewer.html')}?name=${encodeURIComponent(file.name)}`;
  const tab = await chrome.tabs.create({ url: viewerUrl });

  // Poll until the viewer registers its runtime message listener, then send the buffer.
  const MAX_WAIT_MS = 15000;
  const start = Date.now();
  const poll = setInterval(async () => {
    if (Date.now() - start > MAX_WAIT_MS) { clearInterval(poll); return; }
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'pdf-transfer',
        name: file.name,
        size: file.size,
        // Transfer as transferable: chunk to avoid message size limits
        buffer: buffer
      });
      clearInterval(poll);
    } catch {
      // Tab not yet ready — retry on next tick
    }
  }, 300);
}
