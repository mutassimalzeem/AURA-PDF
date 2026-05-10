// popup.js — Extension toolbar popup
// Fix L-6: replace alert() with inline status messages in the popup DOM.

document.getElementById('open-pdf')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
  window.close();
});

function showComingSoon(featureName) {
  let notice = document.getElementById('coming-soon-notice');
  if (!notice) {
    notice = document.createElement('p');
    notice.id = 'coming-soon-notice';
    notice.style.cssText = 'font-size:12px;color:var(--text-muted,#565f89);text-align:center;margin:8px 0 0;padding:0 12px;';
    document.body.appendChild(notice);
  }
  notice.textContent = `${featureName} coming soon!`;
  clearTimeout(notice._timer);
  notice._timer = setTimeout(() => { notice.textContent = ''; }, 3000);
}

document.getElementById('recent-files')?.addEventListener('click', () => {
  showComingSoon('Recent files');
});

document.getElementById('settings')?.addEventListener('click', () => {
  showComingSoon('Settings');
});
