(function () {
  if (document.getElementById('cb-btn')) return;

  let mode = 'idle';
  let hoveredElement = null;
  let selectedElements = [];

  // ── Styles ───────────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    [data-cb-hover] {
      outline: 2px solid rgba(37, 99, 235, 0.45) !important;
      outline-offset: 3px;
      border-radius: 4px;
      background: rgba(37, 99, 235, 0.05) !important;
    }
    [data-cb-selected] {
      outline: 2px solid #2563eb !important;
      outline-offset: 3px;
      border-radius: 4px;
      background: rgba(37, 99, 235, 0.12) !important;
    }
    .cb-selecting, .cb-selecting * { cursor: pointer !important; }
    #cb-mode-ring {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483644;
      box-shadow: inset 0 0 60px rgba(37, 99, 235, 0.18), inset 0 0 120px rgba(37, 99, 235, 0.08);
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    #cb-mode-ring.cb-visible { opacity: 1; }
  `;
  document.head.appendChild(styleEl);

  // ── Mode ring overlay ─────────────────────────────────────────────────────
  const modeRing = document.createElement('div');
  modeRing.id = 'cb-mode-ring';
  document.body.appendChild(modeRing);

  document.addEventListener('mousemove', e => {
    if (mode === 'selecting') updateHover(e.clientX, e.clientY, e.target);
  }, { passive: true });

  // ── Floating Button ──────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'cb-btn';
  Object.assign(btn.style, {
    position: 'fixed', bottom: '88px', right: '24px',
    width: '48px', height: '48px', borderRadius: '50%',
    background: '#18181b', color: '#ffffff', border: '1px solid #3f3f46',
    cursor: 'pointer', zIndex: '2147483647',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)', transition: 'all 0.18s ease',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    outline: 'none', padding: '0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: '15px', fontWeight: '600',
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

  // ── Button rendering ─────────────────────────────────────────────────────
  const ICON_GRID = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="9" height="9" rx="1"/><rect x="13" y="3" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/></svg>`;
  const ICON_CLOCK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

  function setIdle() {
    btn.innerHTML = ICON_GRID;
    btn.title = 'Capture Brick';
    btn.style.background = '#18181b';
    btn.style.border = '1px solid #3f3f46';
    btn.style.pointerEvents = 'auto';
  }

  function setSelecting() {
    const count = selectedElements.length;
    btn.innerHTML = count > 0 ? `${count}` : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>`;
    btn.title = count > 0 ? `Capture ${count} block${count > 1 ? 's' : ''}` : 'Click text blocks to select';
    btn.style.background = '#2563eb';
    btn.style.border = '1px solid #3b82f6';
    btn.style.pointerEvents = 'auto';
  }

  function setSaving() {
    btn.innerHTML = ICON_CLOCK;
    btn.style.background = '#71717a';
    btn.style.border = '1px solid #52525b';
    btn.style.pointerEvents = 'none';
  }

  setIdle();

  // ── Mode management ───────────────────────────────────────────────────────
  function enterSelecting() {
    mode = 'selecting';
    document.body.classList.add('cb-selecting');
    modeRing.classList.add('cb-visible');
    setSelecting();
    showToast('Click text blocks to select. Click button to capture.', 4000);
  }

  function exitSelecting() {
    mode = 'idle';
    document.body.classList.remove('cb-selecting');
    modeRing.classList.remove('cb-visible');
    clearHover();
    clearAllSelected();
    setIdle();
    toast.style.opacity = '0';
  }

  // ── Hover ─────────────────────────────────────────────────────────────────
  function updateHover(x, y, target) {
    if (target.closest('#cb-btn')) { clearHover(); return; }
    const el = findBestElement(x, y);
    if (el === hoveredElement) return;
    clearHover();
    if (el && !el.dataset.cbSelected) {
      hoveredElement = el;
      el.dataset.cbHover = 'true';
    }
  }

  function clearHover() {
    if (hoveredElement) {
      delete hoveredElement.dataset.cbHover;
      hoveredElement = null;
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  function toggleSelect(el) {
    if (el.dataset.cbSelected) {
      delete el.dataset.cbSelected;
      selectedElements = selectedElements.filter(e => e !== el);
    } else {
      el.dataset.cbSelected = 'true';
      selectedElements.push(el);
    }
    setSelecting();
  }

  function clearAllSelected() {
    selectedElements.forEach(el => delete el.dataset.cbSelected);
    selectedElements = [];
  }

  // Capture clicks on the page while in selecting mode
  document.addEventListener('click', e => {
    if (mode !== 'selecting') return;
    if (e.target.closest('#cb-btn')) return;
    e.preventDefault();
    e.stopPropagation();
    const el = findBestElement(e.clientX, e.clientY);
    if (!el) return;
    clearHover();
    toggleSelect(el);
  }, true);

  // ── Button click ──────────────────────────────────────────────────────────
  btn.addEventListener('click', async () => {
    if (mode === 'idle') {
      enterSelecting();
      return;
    }

    if (mode === 'selecting') {
      if (selectedElements.length === 0) {
        exitSelecting();
        return;
      }

      const text = selectedElements
        .map(el => el.innerText?.trim())
        .filter(Boolean)
        .join('\n\n');

      const url = window.location.href;
      const savedCount = selectedElements.length;

      exitSelecting();
      setSaving();
      showToast('Saving…');

      const saveTimeout = setTimeout(() => {
        setIdle();
        showToast('Timed out. Try again.');
      }, 12000);

      const doSave = () => {
        chrome.runtime.sendMessage({ action: 'saveBrick', text, url }, response => {
          clearTimeout(saveTimeout);
          setIdle();
          if (chrome.runtime.lastError) {
            showToast('Extension error. Reload the page and try again.');
            return;
          }
          if (response?.success) {
            showToast(`Saved ${savedCount > 1 ? savedCount + ' blocks' : '1 block'}.`);
          } else if (response?.reason === 'not_authenticated') {
            showToast('Sign in via the extension popup first.');
          } else {
            showToast('Save failed: ' + (response?.reason || 'unknown'));
          }
        });
      };

      try {
        chrome.runtime.sendMessage({ action: 'ping' }, () => {
          if (chrome.runtime.lastError) { /* worker was asleep, now awake */ }
          setTimeout(doSave, 100);
        });
      } catch (e) {
        clearTimeout(saveTimeout);
        setIdle();
        showToast('Could not reach extension. Reload the page.');
      }
    }
  });

  // Escape cancels
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mode === 'selecting') exitSelecting();
  });

  // ── Element finding ───────────────────────────────────────────────────────
  function findBestElement(x, y) {
    const points = [[x,y],[x-20,y],[x+20,y],[x,y-20],[x,y+20]];
    for (const [px, py] of points) {
      const el = document.elementFromPoint(px, py);
      if (!el || el.closest('#cb-btn')) continue;
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
        if (['P','LI','BLOCKQUOTE','H1','H2','H3','H4','PRE','TD'].includes(tag)) return cur;
        if (['DIV','SPAN'].includes(tag)) {
          const rect = cur.getBoundingClientRect();
          if (rect.width > 80 && rect.width < window.innerWidth * 0.9 && text.length < 3000) return cur;
        }
      }
      cur = cur.parentElement;
    }
    return null;
  }

})();
