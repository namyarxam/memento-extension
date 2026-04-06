(function () {
  if (document.getElementById('cb-btn')) return;

  let lastX = 0, lastY = 0;
  let mode = 'idle';
  let lockedElement = null;

  // Track mouse — freeze position when hovering the button
  document.addEventListener('mousemove', e => {
    if (e.target.id !== 'cb-btn') {
      lastX = e.clientX;
      lastY = e.clientY;
    }
  });

  // ── Floating Button ──────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'cb-btn';
  btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="9" height="9" rx="1"/><rect x="13" y="3" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/></svg>`;
  btn.title = 'Capture Brick';
  Object.assign(btn.style, {
    position: 'fixed', bottom: '88px', right: '24px',
    width: '48px', height: '48px', borderRadius: '50%',
    background: '#18181b', color: '#ffffff', border: '1px solid #3f3f46',
    cursor: 'pointer', zIndex: '2147483647',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)', transition: 'all 0.18s ease',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    outline: 'none', padding: '0',
  });
  document.body.appendChild(btn);

  btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.08)');
  btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');

  // ── Toast ────────────────────────────────────────────────────────────────
  const toast = document.createElement('div');
  Object.assign(toast.style, {
    position: 'fixed', bottom: '148px', right: '24px',
    background: '#18181b', color: '#fafafa', padding: '9px 14px',
    borderRadius: '10px', fontSize: '13px', lineHeight: '1.4',
    zIndex: '2147483647', opacity: '0', transition: 'opacity 0.25s ease',
    pointerEvents: 'none', maxWidth: '240px', border: '1px solid #3f3f46',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  });
  document.body.appendChild(toast);

  let toastTimer;
  function showToast(msg, duration = 3000) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.style.opacity = '1';
    toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
  }

  // ── Button States ────────────────────────────────────────────────────────
  function setIdle() {
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="9" height="9" rx="1"/><rect x="13" y="3" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/></svg>`;
    btn.title = 'Capture Brick';
    btn.style.background = '#18181b'; btn.style.border = '1px solid #3f3f46';
    btn.style.pointerEvents = 'auto';
    mode = 'idle'; lockedElement = null;
  }

  function setReady() {
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    btn.title = 'Save Brick';
    btn.style.background = '#2563eb'; btn.style.border = '1px solid #3b82f6';
    mode = 'selecting';
  }

  function setSaving() {
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    btn.style.background = '#71717a'; btn.style.border = '1px solid #52525b';
    btn.style.pointerEvents = 'none';
  }

  // ── Find Text Element ────────────────────────────────────────────────────
  function findBestElement(x, y) {
    // Sample a small grid around the cursor to find best candidate
    const points = [[x,y],[x-20,y],[x+20,y],[x,y-20],[x,y+20],[x-40,y],[x,y-40]];
    for (const [px, py] of points) {
      const el = document.elementFromPoint(px, py);
      if (!el || el.id === 'cb-btn') continue;
      const found = walkUpForText(el);
      if (found) return found;
    }
    return null;
  }

  function walkUpForText(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      const text = cur.innerText?.trim() || '';
      if (text.length > 15) {
        const tag = cur.tagName;
        // Block elements always win
        if (['P','LI','BLOCKQUOTE','H1','H2','H3','H4','PRE','TD'].includes(tag)) return cur;
        // Div/span: only if it looks like a prose-width container, not a layout wrapper
        if (['DIV','SPAN'].includes(tag)) {
          const rect = cur.getBoundingClientRect();
          if (rect.width > 80 && rect.width < window.innerWidth * 0.9 && text.length < 3000) return cur;
        }
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function getParagraphNumber(el) {
    const all = Array.from(document.querySelectorAll('p, li, h1, h2, h3, h4, blockquote'));
    const idx = all.findIndex(n => n === el || n.contains(el) || el.contains(n));
    return idx >= 0 ? idx + 1 : '?';
  }

  function getPageTitle() {
    return document.title.replace(/ [-|] Claude.*$/i, '').trim() || 'Claude Conversation';
  }

  // ── Highlight ────────────────────────────────────────────────────────────
  function highlightElement(el) {
    clearHighlight();
    lockedElement = el;
    el.dataset.cbHighlighted = 'true';
    el.style.outline = '2px solid #2563eb';
    el.style.outlineOffset = '3px';
    el.style.borderRadius = '4px';
    el.style.background = 'rgba(37, 99, 235, 0.07)';
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  function clearHighlight() {
    const prev = document.querySelector('[data-cb-highlighted]');
    if (prev) {
      prev.style.outline = '';
      prev.style.outlineOffset = '';
      prev.style.borderRadius = '';
      prev.style.background = '';
      delete prev.dataset.cbHighlighted;
    }
    lockedElement = null;
  }

  // ── Main Click ───────────────────────────────────────────────────────────
  btn.addEventListener('click', async () => {

    if (mode === 'idle') {
      // If user already manually selected text — use it immediately
      const existingSel = window.getSelection()?.toString().trim();
      if (existingSel && existingSel.length > 5) {
        setReady();
        showToast('Selection locked. Tap ✓ to save.', 3000);
        return;
      }

      // Otherwise find element near cursor
      const el = findBestElement(lastX, lastY);
      if (el) {
        highlightElement(el);
        setReady();
        showToast('Drag to adjust. Tap ✓ to save.', 3500);
      } else {
        showToast('Hover over the text you want, then tap.');
      }

    } else if (mode === 'selecting') {
      const sel = window.getSelection();
      let text = sel?.toString().trim();
      if (!text && lockedElement) text = lockedElement.innerText?.trim() || '';

      if (!text) {
        showToast('Nothing captured. Try again.');
        clearHighlight();
        setIdle();
        return;
      }

      const pageTitle = getPageTitle();
      const url = window.location.href;
      const pNum = lockedElement ? getParagraphNumber(lockedElement) : '?';
      const source = `${pageTitle} p${pNum}`;

      clearHighlight();
      window.getSelection()?.removeAllRanges();
      setSaving();
      showToast('Saving brick…');

      const saveTimeout = setTimeout(() => {
        setIdle();
        showToast('❌ Timed out. Try again.');
      }, 12000);

      // Ping first to wake the service worker, then save
      const doSave = () => {
        chrome.runtime.sendMessage(
          { action: 'saveBrick', text, source, url },
          (response) => {
            clearTimeout(saveTimeout);
            setIdle();
            if (chrome.runtime.lastError) {
              console.error('CB lastError:', chrome.runtime.lastError);
              showToast('❌ Extension error. Reload this page and try again.');
              return;
            }
            if (response?.success) {
              showToast(`🧱 Saved — ${source}`);
            } else {
              showToast('❌ Save failed: ' + (response?.reason || 'unknown'));
            }
          }
        );
      };

      try {
        chrome.runtime.sendMessage({ action: 'ping' }, () => {
          if (chrome.runtime.lastError) { /* worker was asleep, now awake */ }
          setTimeout(doSave, 100);
        });
      } catch(e) {
        clearTimeout(saveTimeout);
        setIdle();
        showToast('❌ Could not reach extension. Reload this page.');
      }
    }
  });

  // Escape cancels
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mode === 'selecting') {
      clearHighlight();
      window.getSelection()?.removeAllRanges();
      setIdle();
      toast.style.opacity = '0';
    }
  });

})();
