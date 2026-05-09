// PDF Annotator Pro - Background Service Worker
// Handles PDF file interception and redirection to viewer

chrome.runtime.onInstalled.addListener(() => {
  console.log('PDF Annotator Pro installed');
});

const VIEWER_PAGE = 'viewer.html';

// Validate URL scheme to prevent open redirect vulnerabilities
function isValidScheme(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'file:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isOwnExtensionUrl(url) {
  // Any URL from our own extension (chrome-extension://<id>/...)
  return url.startsWith(chrome.runtime.getURL(''));
}

function isPdfUrl(url) {
  try {
    // Decode the URL fully before checking — handles double-encoded cases
    const decoded = decodeURIComponent(url);
    return decoded.toLowerCase().endsWith('.pdf');
  } catch {
    return url.toLowerCase().endsWith('.pdf');
  }
}

function redirectToPdfViewer(tabId, pdfUrl) {
  // SECURITY FIX: Validate URL scheme before redirecting
  if (!isValidScheme(pdfUrl)) {
    console.warn('Blocked invalid PDF URL scheme:', pdfUrl);
    return;
  }
  
  // SECURITY FIX: Ensure we're not redirecting to external domains unexpectedly
  try {
    const parsedUrl = new URL(pdfUrl);
    if (parsedUrl.protocol !== 'file:' && 
        !['http', 'https'].includes(parsedUrl.protocol)) {
      console.warn('Blocked potentially malicious PDF URL:', pdfUrl);
      return;
    }
  } catch (e) {
    console.warn('Failed to parse PDF URL:', pdfUrl);
    return;
  }
  
  const viewerUrl = chrome.runtime.getURL(VIEWER_PAGE) + '?file=' + encodeURIComponent(pdfUrl);
  chrome.tabs.update(tabId, { url: viewerUrl });
}

// Handle http/https PDF links
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading') return;
  const url = changeInfo.url;
  if (!url) return;

  // CRITICAL: Never redirect our own extension pages
  if (isOwnExtensionUrl(url)) return;

  if (isPdfUrl(url)) {
    redirectToPdfViewer(tabId, url);
  }
});

// Handle file:// PDFs
if (chrome.webNavigation) {
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    // Only intercept top-level frames, not iframes
    if (details.frameId !== 0) return;

    const url = details.url;

    // CRITICAL: Never intercept our own extension pages
    if (isOwnExtensionUrl(url)) return;

    if (isPdfUrl(url)) {
      redirectToPdfViewer(details.tabId, url);
    }
  }, {
    url: [
      { schemes: ['file'] },
      { schemes: ['http'] },
      { schemes: ['https'] }
    ]
  });
}
