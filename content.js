(function () {
  if (document.getElementById('cb-btn')) return;

  let mode = 'idle';
  let hoveredElement = null;
  let selectedElements = [];
  let dragState = null;

  // ── Styles ───────────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    [data-cb-hover] {
      outline: 2px solid rgba(120, 113, 108, 0.4) !important;
      outline-offset: 3px;
      border-radius: 4px;
      background: rgba(120, 113, 108, 0.04) !important;
    }
    [data-cb-selected] {
      outline: 2px solid #78716c !important;
      outline-offset: 3px;
      border-radius: 4px;
      background: rgba(120, 113, 108, 0.08) !important;
    }
    [data-cb-pending] {
      outline: 2px dashed rgba(120, 113, 108, 0.5) !important;
      outline-offset: 3px;
      border-radius: 4px;
      background: rgba(120, 113, 108, 0.04) !important;
    }
    .cb-selecting, .cb-selecting * { cursor: crosshair !important; }
    #cb-mode-ring {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 2147483644;
      box-shadow: inset 0 0 80px rgba(87, 83, 78, 0.1), inset 0 0 160px rgba(87, 83, 78, 0.05);
      opacity: 0;
      transition: opacity 0.4s ease;
    }
    #cb-mode-ring.cb-visible { opacity: 1; }
    @keyframes cb-eject {
      0%   { opacity: 0.9; transform: translateY(0) scale(1) rotate(-2deg); }
      100% { opacity: 0;   transform: translateY(-72px) scale(0.7) rotate(4deg); }
    }
    .cb-eject {
      position: fixed;
      width: 22px;
      height: 30px;
      border-radius: 4px 4px 2px 2px;
      background: linear-gradient(to bottom, #fef3c7 72%, #fbbf24 72%);
      box-shadow: 0 3px 12px rgba(0,0,0,0.15);
      pointer-events: none;
      z-index: 2147483646;
      animation: cb-eject 0.75s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    }
  `;
  document.head.appendChild(styleEl);

  // ── Mode ring overlay ─────────────────────────────────────────────────────
  const modeRing = document.createElement('div');
  modeRing.id = 'cb-mode-ring';
  document.body.appendChild(modeRing);

  document.addEventListener('mousemove', e => {
    if (mode !== 'selecting') return;
    if (dragState) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (!dragState.isDragging && (dx * dx + dy * dy) > 25) {
        dragState.isDragging = true;
        clearHover();
      }
      if (dragState.isDragging) updateDragSelection(dragState.startY, e.clientY);
    } else {
      updateHover(e.clientX, e.clientY, e.target);
    }
  }, { passive: true });

  // ── Floating Button (polaroid shape) ─────────────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'cb-btn';
  btn.innerHTML = `<div id="cb-btn-photo"></div><div id="cb-btn-strip"></div>`;
  Object.assign(btn.style, {
    position: 'fixed', bottom: '88px', right: '72px',
    width: '32px', height: '40px', borderRadius: '6px 6px 3px 3px',
    background: '#44403c',
    border: '1.5px solid rgba(255,255,255,0.85)',
    cursor: 'pointer', zIndex: '2147483647',
    boxShadow: '0 4px 18px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.15)',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
    display: 'flex', flexDirection: 'column', alignItems: 'stretch',
    outline: 'none', padding: '0',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  });

  const btnPhoto = btn.querySelector('#cb-btn-photo');
  Object.assign(btnPhoto.style, {
    flex: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '700',
    letterSpacing: '-0.02em',
    transition: 'background 0.18s ease',
  });

  const btnStrip = btn.querySelector('#cb-btn-strip');
  Object.assign(btnStrip.style, {
    height: '9px',
    background: 'rgba(255,255,255,0.85)',
    borderTop: 'none',
    flexShrink: '0',
    transition: 'background 0.18s ease',
  });

  document.body.appendChild(btn);

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.06)';
    btn.style.boxShadow = '0 8px 24px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.15)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 18px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.15)';
  });

  // ── Toast ────────────────────────────────────────────────────────────────
  const toast = document.createElement('div');
  Object.assign(toast.style, {
    position: 'fixed', bottom: '148px', right: '72px',
    background: '#292524', color: '#e7e5e4', padding: '9px 14px',
    borderRadius: '8px', fontSize: '13px', lineHeight: '1.4',
    zIndex: '2147483647', opacity: '0', transition: 'opacity 0.25s ease',
    pointerEvents: 'none', maxWidth: '220px',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
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

  // ── Icons ────────────────────────────────────────────────────────────────
  // Bookmark-M ribbon — bookmark silhouette with M-shaped bottom
  const ICON_BOOKMARK = `<svg width="11" height="14" viewBox="0 -1 12 15" fill="none">
    <path d="M0 1.5A1.5 1.5 0 0 1 1.5 0h9A1.5 1.5 0 0 1 12 1.5V14l-3.5-7.5L6 14l-3.5-7.5L0 14V1.5z" fill="#4aba6a"/>
  </svg>`;
  const ICON_CROSSHAIR = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.4" stroke-linecap="round">
    <circle cx="7" cy="7" r="3"/>
    <line x1="7" y1="1" x2="7" y2="3.5"/>
    <line x1="7" y1="10.5" x2="7" y2="13"/>
    <line x1="1" y1="7" x2="3.5" y2="7"/>
    <line x1="10.5" y1="7" x2="13" y2="7"/>
  </svg>`;
  const ICON_DOTS = `<svg width="16" height="4" viewBox="0 0 16 4" fill="rgba(255,255,255,0.5)">
    <circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/><circle cx="14" cy="2" r="1.3"/>
  </svg>`;

  // ── Button rendering ─────────────────────────────────────────────────────
  function setIdle() {
    btnPhoto.innerHTML = ICON_BOOKMARK;
    btnPhoto.style.background = '';
    btnStrip.style.background = 'rgba(255,255,255,0.85)';
    btn.title = 'Memento — save a moment';
    btn.style.pointerEvents = 'auto';
    btn.style.transform = 'scale(1)';
  }

  function setSelecting() {
    const count = selectedElements.length;
    if (count > 0) {
      btnPhoto.innerHTML = `<span style="color:#e7e5e4;font-size:13px;font-weight:700">${count}</span>`;
      btnStrip.style.background = 'rgba(255,255,255,0.7)';
    } else {
      btnPhoto.innerHTML = ICON_CROSSHAIR;
      btnStrip.style.background = 'rgba(255,255,255,0.85)';
    }
    btnPhoto.style.background = '';
    btn.title = count > 0 ? `Save ${count} block${count > 1 ? 's' : ''}` : 'Click text to select';
    btn.style.pointerEvents = 'auto';
    btn.style.transform = 'scale(1)';
  }

  function setSaving() {
    btnPhoto.innerHTML = ICON_DOTS;
    btnPhoto.style.background = '';
    btnStrip.style.background = 'rgba(255,255,255,0.85)';
    btn.style.pointerEvents = 'none';
    btn.style.transform = 'scale(1)';
  }

  // ── Eject animation ───────────────────────────────────────────────────────
  function spawnEject() {
    const rect = btn.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'cb-eject';
    Object.assign(el.style, {
      left: rect.left + (rect.width / 2 - 14) + 'px',
      top: rect.top + 'px',
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  setIdle();

  // ── Mode management ───────────────────────────────────────────────────────
  function enterSelecting() {
    mode = 'selecting';
    document.body.classList.add('cb-selecting');
    modeRing.classList.add('cb-visible');
    setSelecting();
    showToast('Click or drag to select text, then click to save.', 4000);
  }

  function exitSelecting() {
    mode = 'idle';
    document.body.classList.remove('cb-selecting');
    modeRing.classList.remove('cb-visible');
    clearHover();
    clearPending();
    clearAllSelected();
    dragState = null;
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

  // ── Drag-to-select ────────────────────────────────────────────────────────
  const BLOCK_TAGS = 'p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, td, figure, details, summary';

  function collectBlockElements() {
    return Array.from(document.querySelectorAll(BLOCK_TAGS)).filter(el => {
      if (el.closest('#cb-btn')) return false;
      const text = el.innerText?.trim() || '';
      return text.length > 2;
    });
  }

  function clearPending() {
    document.querySelectorAll('[data-cb-pending]').forEach(el => delete el.dataset.cbPending);
  }

  function updateDragSelection(startY, endY) {
    clearPending();
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    dragState.pendingEls = [];
    for (const el of dragState.blocks) {
      const rect = el.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      if (centerY >= minY && centerY <= maxY && !el.dataset.cbSelected) {
        el.dataset.cbPending = 'true';
        dragState.pendingEls.push(el);
      }
    }
  }

  document.addEventListener('mousedown', e => {
    if (mode !== 'selecting') return;
    if (e.target.closest('#cb-btn')) return;
    if (e.button !== 0) return;
    const el = findBestElement(e.clientX, e.clientY);
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      startEl: el,
      isDragging: false,
      blocks: collectBlockElements(),
      pendingEls: [],
    };
  }, true);

  document.addEventListener('click', e => {
    if (mode !== 'selecting') return;
    if (e.target.closest('#cb-btn')) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  document.addEventListener('mouseup', e => {
    if (mode !== 'selecting' || !dragState) return;
    if (dragState.isDragging && dragState.pendingEls.length > 0) {
      clearPending();
      for (const el of dragState.pendingEls) {
        if (!el.dataset.cbSelected) {
          el.dataset.cbSelected = 'true';
          selectedElements.push(el);
        }
      }
      setSelecting();
    } else if (dragState.startEl) {
      clearHover();
      toggleSelect(dragState.startEl);
    }
    dragState = null;
  }, true);

  // ── Role detection ────────────────────────────────────────────────────────
  function detectRole(el) {
    const host = location.hostname;
    if (host.includes('chatgpt.com')) {
      const msg = el.closest('[data-message-author-role]');
      if (msg) return msg.dataset.messageAuthorRole === 'user' ? 'user' : 'assistant';
    }
    if (host.includes('claude.ai')) {
      if (el.closest('[data-testid="user-message"]')) return 'user';
      if (el.closest('[data-is-streaming]') || el.closest('.font-claude-response')) return 'assistant';
    }
    if (host.includes('gemini.google.com')) {
      if (el.closest('user-query')) return 'user';
      if (el.closest('model-response')) return 'assistant';
    }
    return 'unknown';
  }

  // ── Message boundary (prevents walking up past a message container) ────────
  function getMessageCeiling(el) {
    const host = location.hostname;
    if (host.includes('chatgpt.com')) return el.closest('[data-message-author-role]');
    if (host.includes('claude.ai')) {
      return el.closest('[data-testid="user-message"]')
        || el.closest('[data-is-streaming]')
        || el.closest('.font-claude-response');
    }
    if (host.includes('gemini.google.com')) {
      return el.closest('user-query') || el.closest('model-response');
    }
    return null;
  }

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

      const blocks = selectedElements
        .map(el => ({ text: el.innerText?.trim() || '', role: detectRole(el) }))
        .filter(b => b.text.length > 0);

      const text = blocks.map(b => b.text).join('\n\n');
      const source_text = text.slice(0, 80);
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
        chrome.runtime.sendMessage({ action: 'saveBrick', text, url, blocks, source_text }, response => {
          clearTimeout(saveTimeout);
          setIdle();
          if (chrome.runtime.lastError) {
            showToast('Extension error. Reload the page and try again.');
            return;
          }
          if (response?.success) {
            spawnEject();
            showToast(`Saved ${savedCount > 1 ? savedCount + ' moments' : '1 moment'}.`);
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

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mode === 'selecting') exitSelecting();
  });

  // ── Element finding ───────────────────────────────────────────────────────
  const SEMANTIC_TAGS = new Set(['P','LI','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','PRE','TD','FIGURE','DETAILS','SUMMARY','CODE']);

  function findBestElement(x, y) {
    const points = [[x,y],[x-15,y],[x+15,y],[x,y-10],[x,y+10]];
    for (const [px, py] of points) {
      const el = document.elementFromPoint(px, py);
      if (!el || el.closest('#cb-btn')) continue;
      const found = walkUpForText(el);
      if (found) return found;
    }
    return null;
  }

  function walkUpForText(el) {
    const ceiling = getMessageCeiling(el);
    let cur = el;
    let bestDiv = null;
    while (cur && cur !== document.body) {
      if (ceiling && cur === ceiling.parentElement) break;
      const text = cur.innerText?.trim() || '';
      if (text.length > 2) {
        const tag = cur.tagName;
        if (SEMANTIC_TAGS.has(tag)) return cur;
        if (tag === 'DIV' || tag === 'SPAN') {
          const rect = cur.getBoundingClientRect();
          if (rect.width > 60 && rect.width < window.innerWidth * 0.9 && text.length < 2000) {
            if (!bestDiv) bestDiv = cur;
          }
        }
      }
      cur = cur.parentElement;
    }
    return bestDiv;
  }

  // ── Jump to source ────────────────────────────────────────────────────────
  const initHash = window.location.hash;
  if (initHash.startsWith('#cb-find=')) {
    const needle = decodeURIComponent(initHash.slice(9)).trim().slice(0, 60).toLowerCase();
    history.replaceState(null, '', location.pathname + location.search);
    let attempts = 0;
    const findInterval = setInterval(() => {
      attempts++;
      const els = document.querySelectorAll('p, li, blockquote, pre, h1, h2, h3, h4, td');
      for (const el of els) {
        if ((el.innerText || '').trim().toLowerCase().includes(needle)) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.dataset.cbHover = 'true';
          setTimeout(() => delete el.dataset.cbHover, 2500);
          clearInterval(findInterval);
          return;
        }
      }
      const divs = document.querySelectorAll('div');
      for (const el of divs) {
        if ((el.innerText || '').trim().toLowerCase().startsWith(needle)) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.dataset.cbHover = 'true';
          setTimeout(() => delete el.dataset.cbHover, 2500);
          clearInterval(findInterval);
          return;
        }
      }
      if (attempts >= 20) clearInterval(findInterval);
    }, 500);
  }

})();
