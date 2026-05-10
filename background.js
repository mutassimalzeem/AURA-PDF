// Service Worker - PDF URL interception
// Production-hardened: persists rate-limit and dedup state to chrome.storage.session
// so SW restarts do not reset security controls (Fix H-2).
const VIEWER_HTML = 'viewer.html';
const ALLOWED_PROTOCOLS = new Set(['https:', 'file:']);
const PDF_MIME = 'application/pdf';
const MAX_PROBES_PER_MINUTE = 10;
const PROBE_TIMEOUT_MS = 5000;
const PROBE_CACHE_TTL_MS = 10 * 60 * 1000;
const PROBE_CACHE_MAX = 250;
const DEDUP_TIMEOUT_MS = 5000;
const DEDUP_MAX_ENTRIES = 1000;

// In-memory caches — hydrated from chrome.storage.session on startup (Fix H-2)
const probeCache = new Map();
const probeWindow = [];
const seenNavigations = new Map();

function debugLog() {}

// ── State persistence (Fix H-2) ──────────────────────────────────────────────

async function _hydrateState() {
  try {
    const data = await chrome.storage.session.get(['probeWindow', 'seenNavigations', 'bgProbeCache']);
    const now = Date.now();

    if (Array.isArray(data.probeWindow)) {
      const fresh = data.probeWindow.filter(ts => now - ts < 60_000);
      probeWindow.push(...fresh);
    }

    if (data.seenNavigations && typeof data.seenNavigations === 'object') {
      for (const [key, ts] of Object.entries(data.seenNavigations)) {
        if (now - ts < DEDUP_TIMEOUT_MS) seenNavigations.set(key, ts);
      }
    }

    if (data.bgProbeCache && typeof data.bgProbeCache === 'object') {
      for (const [url, ts] of Object.entries(data.bgProbeCache)) {
        if (parseTrustedUrl(url)?.protocol === 'https:' && now - Number(ts) < PROBE_CACHE_TTL_MS) {
          probeCache.set(url, { result: true, time: Number(ts) });
        }
      }
    }
  } catch (err) {
    debugLog('State hydration failed', err?.name);
  }
}

function successfulProbeCache(now = Date.now()) {
  const out = {};
  for (const [url, entry] of probeCache.entries()) {
    if (entry.result === true && now - entry.time <= PROBE_CACHE_TTL_MS) {
      out[url] = entry.time;
    }
  }
  return out;
}

async function _persistState() {
  try {
    await chrome.storage.session.set({
      probeWindow: [...probeWindow],
      seenNavigations: Object.fromEntries(seenNavigations),
      bgProbeCache: successfulProbeCache()
    });
  } catch (err) {
    debugLog('State persist failed', err?.name);
  }
}

// Hydrate on SW startup
_hydrateState();

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOwnUrl(url) {
  return typeof url === 'string' && url.startsWith(chrome.runtime.getURL(''));
}

function parseTrustedUrl(url) {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
    if (parsed.protocol === 'https:' && (parsed.username || parsed.password)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hasPdfPath(pathname) {
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded.toLowerCase().endsWith('.pdf');
  } catch {
    return pathname.toLowerCase().endsWith('.pdf');
  }
}

function hasPdfMimeHint(searchParams) {
  const contentType = searchParams.get('content-type') || searchParams.get('content_type') || searchParams.get('mime') || '';
  return contentType.trim().toLowerCase() === PDF_MIME;
}

function urlPathLooksPdf(url) {
  const parsed = parseTrustedUrl(url);
  if (!parsed) return false;
  return hasPdfPath(parsed.pathname) || hasPdfMimeHint(parsed.searchParams);
}

function pruneProbeCache(now) {
  for (const [key, entry] of probeCache.entries()) {
    if (now - entry.time > PROBE_CACHE_TTL_MS) probeCache.delete(key);
  }
  while (probeCache.size > PROBE_CACHE_MAX) {
    const oldest = probeCache.keys().next().value;
    if (!oldest) break;
    probeCache.delete(oldest);
  }
}

function canProbe(now) {
  while (probeWindow.length && now - probeWindow[0] > 60_000) probeWindow.shift();
  if (probeWindow.length >= MAX_PROBES_PER_MINUTE) return false;
  probeWindow.push(now);
  _persistState(); // persist after each probe count change (Fix H-2)
  return true;
}

async function probeIsPdf(url) {
  const parsed = parseTrustedUrl(url);
  if (!parsed || parsed.protocol !== 'https:') return false;

  const cacheKey = parsed.href;
  const now = Date.now();
  pruneProbeCache(now);

  const cached = probeCache.get(cacheKey);
  if (cached && now - cached.time <= PROBE_CACHE_TTL_MS) return cached.result;
  if (!canProbe(now)) return false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const resp = await fetch(parsed.href, {
      method: 'HEAD',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    const result = resp.ok && contentType.split(';', 1)[0].trim() === PDF_MIME;
    probeCache.set(cacheKey, { result, time: now });
    _persistState();
    return result;
  } catch (err) {
    debugLog('PDF probe failed', err?.name);
    probeCache.set(cacheKey, { result: false, time: now });
    _persistState();
    return false;
  }
}

function redirectToPdfViewer(tabId, pdfUrl) {
  const parsed = parseTrustedUrl(pdfUrl);
  if (!parsed) return;
  chrome.tabs.update(tabId, {
    url: `${chrome.runtime.getURL(VIEWER_HTML)}?file=${encodeURIComponent(parsed.href)}`
  });
}

// Fix L-4: schedule individual entry eviction so dedup map cannot fill up
// and block navigation if no new navigation fires to trigger cleanup.
function dedup(key, fn) {
  const now = Date.now();
  // Evict stale entries on each call
  for (const [entryKey, timestamp] of seenNavigations.entries()) {
    if (now - timestamp > DEDUP_TIMEOUT_MS) seenNavigations.delete(entryKey);
  }
  if (seenNavigations.has(key) || seenNavigations.size >= DEDUP_MAX_ENTRIES) return;
  seenNavigations.set(key, now);
  _persistState(); // persist dedup map (Fix H-2)
  // Also schedule self-eviction so the entry doesn't linger until next call
  setTimeout(() => {
    seenNavigations.delete(key);
    _persistState();
  }, DEDUP_TIMEOUT_MS + 100);
  fn();
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  const url = changeInfo.url;
  if (!url || isOwnUrl(url) || !parseTrustedUrl(url)) return;

  if (urlPathLooksPdf(url)) {
    dedup(`${tabId}:${url}`, () => redirectToPdfViewer(tabId, url));
    return;
  }

  probeIsPdf(url).then(isPdf => {
    if (isPdf) dedup(`${tabId}:${url}`, () => redirectToPdfViewer(tabId, url));
  });
});

if (chrome.webNavigation) {
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) return;
    const url = details.url;
    if (!url || isOwnUrl(url) || !urlPathLooksPdf(url)) return;
    dedup(`${details.tabId}:${url}`, () => redirectToPdfViewer(details.tabId, url));
  }, { url: [{ schemes: ['https', 'file'] }] });
}
