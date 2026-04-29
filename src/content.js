(function () {
  if (document.getElementById('cb-btn')) return;

  let mode = 'idle';
  let hoveredElement = null;
  let moments = []; // each moment: { elements: Element[], overlay: HTMLElement }
  const SEMANTIC_TAGS = new Set(['P','LI','H1','H2','H3','H4','H5','H6','PRE','TD','FIGURE','DETAILS','SUMMARY','CODE']);
  const BLOCK_TAGS = 'p, li, h1, h2, h3, h4, h5, h6, pre, td, figure, details, summary, code';

  // ── Styles ───────────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    [data-cb-hover] {
      outline: 2px solid rgba(120, 113, 108, 0.4) !important;
      outline-offset: 3px;
      border-radius: 4px;
      background: rgba(120, 113, 108, 0.04) !important;
    }
    .cb-selecting, .cb-selecting * { cursor: crosshair !important; user-select: none !important; -webkit-user-select: none !important; }
    #cb-btn, #cb-btn *,
    #cb-header-btn, #cb-header-btn * { cursor: pointer !important; }
    #cb-header-btn:not(:disabled):hover { filter: brightness(1.08); }
    #cb-header-btn[data-state="selecting-empty"]:hover { background: rgba(20,168,180,0.28) !important; }
    #cb-header-btn[data-state="selecting-count"]:hover { background: #0d8b95 !important; }
    #cb-header-btn[data-state="saving"] { cursor: default !important; opacity: 0.85; }
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

  // ── Drag overlay (hold+drag preview) ────────────────────────────────────
  const dragOverlay = document.createElement('div');
  dragOverlay.id = 'cb-drag-overlay';
  Object.assign(dragOverlay.style, {
    position: 'fixed', pointerEvents: 'none', zIndex: '2147483645',
    border: '2px dashed rgba(120, 113, 108, 0.5)',
    borderRadius: '4px',
    background: 'rgba(120, 113, 108, 0.06)',
    display: 'none',
  });
  document.body.appendChild(dragOverlay);

  function updateDragOverlay(blocksInRange) {
    if (blocksInRange.length === 0) { dragOverlay.style.display = 'none'; return; }
    let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
    for (const el of blocksInRange) {
      const r = el.getBoundingClientRect();
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
      if (r.left < left) left = r.left;
      if (r.right > right) right = r.right;
    }
    Object.assign(dragOverlay.style, {
      display: 'block',
      top: (top - 4) + 'px', left: (left - 4) + 'px',
      width: (right - left + 8) + 'px', height: (bottom - top + 8) + 'px',
    });
  }

  function hideDragOverlay() { dragOverlay.style.display = 'none'; }

  // ── Drag state ─────────────────────────────────────────────────────────────
  let dragStartX = 0, dragStartY = 0;
  let isDragging = false;
  let mouseIsDown = false;
  const DRAG_THRESHOLD = 5;

  function getBlocksInDragRange(startX, y1, y2) {
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);
    const all = Array.from(document.querySelectorAll(BLOCK_TAGS));
    const candidates = [];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) continue;
      const text = (el.innerText?.trim() || '');
      if (text.length < 3) continue;
      if (r.bottom < top || r.top > bottom) continue;
      if (startX < r.left - 40 || startX > r.right + 40) continue;
      if (el.closest('nav, aside, [role="navigation"], [role="complementary"]')) continue;
      if (!isInChatArea(el)) continue;
      candidates.push(el);
    }
    // Remove nested duplicates — if a parent and child both match, keep only the parent
    return candidates.filter(el =>
      !candidates.some(other => other !== el && other.contains(el))
    );
  }

  document.addEventListener('mousedown', e => {
    if (mode !== 'selecting') return;
    if (e.target.closest('#cb-btn') || e.target.closest('#cb-header-btn')) return;
    if (e.button !== 0) return;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    mouseIsDown = true;
    isDragging = false;
  }, true);

  document.addEventListener('mousemove', e => {
    if (mode !== 'selecting') return;

    if (mouseIsDown) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (!isDragging && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        isDragging = true;
        clearHover();
      }
      if (isDragging) {
        const blocksInRange = getBlocksInDragRange(dragStartX, dragStartY, e.clientY);
        updateDragOverlay(blocksInRange);
        return;
      }
    }

    updateHover(e.clientX, e.clientY, e.target);
  }, { passive: true });

  document.addEventListener('mouseup', e => {
    if (mode !== 'selecting') return;
    if (!mouseIsDown) return;
    mouseIsDown = false;

    if (isDragging) {
      isDragging = false;
      hideDragOverlay();
      const blocksInRange = getBlocksInDragRange(dragStartX, dragStartY, e.clientY);
      // Filter out elements already in a moment
      const newBlocks = blocksInRange.filter(b => !b.dataset.cbMoment);
      if (newBlocks.length > 0) addMoment(newBlocks);
      return;
    }

    // Not a drag — treat as click toggle
    if (e.target.closest('#cb-btn') || e.target.closest('#cb-header-btn')) return;
    const el = findBestElement(e.clientX, e.clientY);
    if (!el) return;
    clearHover();
    // If already in a moment, remove that entire moment
    const existing = el.dataset.cbMoment && moments.find(m => m.elements.includes(el));
    if (existing) {
      removeMoment(existing);
    } else {
      addMoment([el]);
    }
  }, true);

  // ── Floating Button (logo) ───────────────────────────────────────────────
  const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 167.42 196.24" width="28" height="32">
    <polygon fill="#0f7588" points="122.16 19.29 122.16 19.32 122.18 19.3 122.16 19.29"/>
    <polygon fill="#108292" points="167.04 146.75 167.04 146.85 84.11 97.97 83.66 98.23 83.69 98.25 83.69 196.24 167.31 146.91 167.04 146.75"/>
    <polygon fill="#105465" points="83.66 98.23 83.42 98.09 41.17 122.63 .01 146.91 83.64 196.24 83.64 98.25 83.66 98.23"/>
    <polygon fill="#0f7588" points="83.69 97.5 83.69 97.43 83.64 97.46 83.64 97.47 83.69 97.5"/>
    <polygon fill="#0f7588" points="83.99 97.76 83.87 97.83 84.11 97.97 84.23 97.9 83.99 97.76"/>
    <polygon fill="#0f7588" points=".21 49.16 0 146.91 84.13 97.73 .21 49.16"/>
    <polygon fill="#14a8b4" points="167.21 49.16 167.42 146.91 83.29 97.73 167.21 49.16"/>
    <polygon fill="#0f7588" points="83.87 97.83 83.54 97.64 83.09 97.9 83.42 98.09 83.87 97.83"/>
    <polygon fill="#0f7588" points="83.66 97.56 83.64 97.55 83.64 97.47 83.63 97.46 83.43 97.58 83.54 97.64 83.66 97.56"/>
    <polygon fill="#0f7588" points="83.66 97.56 83.99 97.76 84.06 97.72 83.69 97.5 83.69 97.55 83.66 97.56"/>
    <polygon fill="#fff" points="83.71 128.53 108.87 113.8 108.87 143.27 134.54 128.62 134.54 67.86 83.71 97.67 83.69 97.67 32.86 67.86 32.86 128.62 58.54 143.27 58.54 113.8 83.69 128.53 83.71 128.53"/>
    <polygon fill="#54b7c5" points="167.31 49.33 83.69 0 83.69 97.87 167.31 49.33"/>
    <polygon fill="#199eae" points="83.63 97.91 83.64 97.9 83.64 0 .01 49.33 83.63 97.91"/>
    <polygon fill="#fff" points="83.9 69.15 83.9 69.15 83.9 31.85 52.05 50.65 83.9 69.15"/>
    <polygon fill="#fff" opacity=".5" points="84.51 69.15 84.5 69.15 84.5 31.85 116.36 50.65 84.51 69.15"/>
  </svg>`;

  // Clip-path matching the logo's cube/hexagon silhouette (pointy-top, derived from SVG outer vertices)
  const HEX_CLIP = 'polygon(50% 0%, 100% 25.1%, 100% 74.9%, 50% 100%, 0% 74.9%, 0% 25.1%)';

  const btn = document.createElement('button');
  btn.id = 'cb-btn';
  btn.innerHTML = `<div id="cb-btn-photo"></div>`;
  Object.assign(btn.style, {
    position: 'fixed', top: '50%', right: '72px', transform: 'translateY(-50%)',
    width: '36px', height: '42px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer', zIndex: '2147483647',
    boxShadow: 'none',
    transition: 'transform 0.18s ease, filter 0.18s ease',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    outline: 'none', padding: '0',
    overflow: 'visible',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    filter: 'drop-shadow(0 3px 10px rgba(0,0,0,0.3))',
  });

  const btnPhoto = btn.querySelector('#cb-btn-photo');
  Object.assign(btnPhoto.style, {
    width: '100%', height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '700',
    letterSpacing: '-0.02em',
  });

  document.body.appendChild(btn);

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'translateY(-50%) scale(1.1)';
    btn.style.filter = 'drop-shadow(0 5px 14px rgba(0,0,0,0.4))';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'translateY(-50%) scale(1)';
    btn.style.filter = 'drop-shadow(0 3px 10px rgba(0,0,0,0.3))';
  });


  // ── Toast ────────────────────────────────────────────────────────────────
  const toast = document.createElement('div');
  Object.assign(toast.style, {
    position: 'fixed', top: 'calc(50% + 32px)', right: '36px',
    background: '#292524', color: '#e7e5e4', padding: '9px 14px',
    borderRadius: '8px', fontSize: '13px', lineHeight: '1.4',
    zIndex: '2147483647', opacity: '0', transition: 'opacity 0.25s ease',
    pointerEvents: 'none', maxWidth: '220px',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  });
  document.body.appendChild(toast);

  function positionToastNearAnchor() {
    const headerEl = document.getElementById('cb-header-btn');
    const anchor = (headerEl && headerEl.offsetParent) ? headerEl : btn;
    if (!anchor || !anchor.offsetParent) return;
    const rect = anchor.getBoundingClientRect();
    toast.style.top = (rect.bottom + 8) + 'px';
    toast.style.left = 'auto';
    toast.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
  }

  let toastTimer;
  function showToast(msg, duration = 3000) {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    positionToastNearAnchor();
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
  let hasHeaderButton = false;

  function updateHeaderButton(state, count) {
    const headerEl = document.getElementById('cb-header-btn');
    if (!headerEl) return;
    const iconEl = headerEl.querySelector('.cb-icon');
    const labelEl = headerEl.querySelector('.cb-label');
    if (!iconEl) return;

    if (state === 'idle') {
      iconEl.innerHTML = headerEl.dataset.iconOnly === 'true'
        ? buildHeaderLogo(20, 22)
        : (headerEl.dataset.platform === 'chatgpt.com' ? buildHeaderLogo(16, 18) : buildHeaderLogo(14, 16));
      if (labelEl) labelEl.textContent = 'Capture';
      headerEl.style.background = '';
      headerEl.style.color = '';
      headerEl.disabled = false;
      headerEl.dataset.state = 'idle';
    } else if (state === 'selecting') {
      if (count > 0) {
        iconEl.innerHTML = `<span style="color:#fff;font-weight:700;font-size:12px;line-height:1">${count}</span>`;
        if (labelEl) labelEl.textContent = 'Save';
        headerEl.style.background = '#14a8b4';
        headerEl.style.color = '#fff';
        headerEl.dataset.state = 'selecting-count';
      } else {
        iconEl.innerHTML = ICON_CROSSHAIR;
        if (labelEl) labelEl.textContent = 'Cancel';
        headerEl.style.background = 'rgba(20,168,180,0.18)';
        headerEl.style.color = '';
        headerEl.dataset.state = 'selecting-empty';
      }
      headerEl.disabled = false;
    } else if (state === 'saving') {
      iconEl.innerHTML = ICON_DOTS;
      if (labelEl) labelEl.textContent = 'Saving';
      headerEl.style.background = '#14a8b4';
      headerEl.style.color = '#fff';
      headerEl.disabled = true;
      headerEl.dataset.state = 'saving';
    }
  }

  function setIdle() {
    btnPhoto.style.background = 'transparent';
    btnPhoto.innerHTML = LOGO_SVG;
    btn.style.clipPath = 'none';
    btn.title = '';
    btn.style.pointerEvents = 'auto';
    btn.style.transform = 'translateY(-50%) scale(1)';
    btn.style.display = hasHeaderButton ? 'none' : 'flex';
    updateHeaderButton('idle');
  }

  function setSelecting() {
    const count = moments.length;
    if (count > 0) {
      btnPhoto.innerHTML = `<span style="color:#fff;font-size:13px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,0.4)">${count}</span>`;
      btnPhoto.style.background = 'rgba(20,168,180,0.85)';
    } else {
      btnPhoto.innerHTML = ICON_CROSSHAIR;
      btnPhoto.style.background = 'rgba(20,168,180,0.85)';
    }
    btn.style.clipPath = HEX_CLIP;
    btn.title = '';
    btn.style.pointerEvents = 'auto';
    btn.style.transform = 'translateY(-50%) scale(1)';
    btn.style.display = hasHeaderButton ? 'none' : 'flex';
    updateHeaderButton('selecting', count);
  }

  function setSaving() {
    btnPhoto.innerHTML = ICON_DOTS;
    btnPhoto.style.background = 'rgba(20,168,180,0.85)';
    btn.style.clipPath = HEX_CLIP;
    btn.style.pointerEvents = 'none';
    btn.style.transform = 'translateY(-50%) scale(1)';
    btn.style.display = hasHeaderButton ? 'none' : 'flex';
    updateHeaderButton('saving');
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
  }

  function exitSelecting() {
    mode = 'idle';
    document.body.classList.remove('cb-selecting');
    modeRing.classList.remove('cb-visible');
    clearHover();
    hideDragOverlay();
    clearAllMoments();
    mouseIsDown = false;
    isDragging = false;
    setIdle();
  }

  // ── Hover (fixed overlay — immune to platform CSS) ────────────────────────
  const hoverOverlay = document.createElement('div');
  hoverOverlay.id = 'cb-hover-overlay';
  Object.assign(hoverOverlay.style, {
    position: 'fixed', pointerEvents: 'none', zIndex: '2147483644',
    outline: '2px solid rgba(120, 113, 108, 0.4)',
    outlineOffset: '3px',
    borderRadius: '4px',
    background: 'rgba(120, 113, 108, 0.04)',
    display: 'none',
  });
  document.body.appendChild(hoverOverlay);

  function updateHover(x, y, target) {
    if (target.closest('#cb-btn')) { clearHover(); return; }
    const el = findBestElement(x, y);
    if (el === hoveredElement) return;
    clearHover();
    if (el && !el.dataset.cbMoment) {
      hoveredElement = el;
      const rect = el.getBoundingClientRect();
      Object.assign(hoverOverlay.style, {
        display: 'block',
        top: (rect.top - 2) + 'px',
        left: (rect.left - 2) + 'px',
        width: (rect.width + 4) + 'px',
        height: (rect.height + 4) + 'px',
      });
    }
  }

  function clearHover() {
    if (hoveredElement) {
      hoveredElement = null;
      hoverOverlay.style.display = 'none';
    }
  }

  // ── Moments (selection groups) ────────────────────────────────────────────
  function createMomentOverlay() {
    const div = document.createElement('div');
    Object.assign(div.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '2147483645',
      outline: '2px solid #78716c',
      outlineOffset: '3px',
      borderRadius: '4px',
      background: 'rgba(120, 113, 108, 0.05)',
    });
    document.body.appendChild(div);
    return div;
  }

  function repositionMomentOverlay(moment) {
    const { elements, overlay } = moment;
    let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
    for (const el of elements) {
      const r = el.getBoundingClientRect();
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
      if (r.left < left) left = r.left;
      if (r.right > right) right = r.right;
    }
    Object.assign(overlay.style, {
      top: (top - 2) + 'px', left: (left - 2) + 'px',
      width: (right - left + 4) + 'px', height: (bottom - top + 4) + 'px',
    });
  }

  function addMoment(elements) {
    const overlay = createMomentOverlay();
    const moment = { elements, overlay };
    elements.forEach(el => { el.dataset.cbMoment = 'true'; });
    moments.push(moment);
    repositionMomentOverlay(moment);
    setSelecting();
  }

  function removeMoment(moment) {
    moment.elements.forEach(el => delete el.dataset.cbMoment);
    moment.overlay.remove();
    moments = moments.filter(m => m !== moment);
    setSelecting();
  }

  function clearAllMoments() {
    for (const m of moments) {
      m.elements.forEach(el => delete el.dataset.cbMoment);
      m.overlay.remove();
    }
    moments = [];
  }

  // Reposition all moment overlays on ANY scroll (capture catches inner containers)
  document.addEventListener('scroll', () => {
    for (const m of moments) repositionMomentOverlay(m);
  }, { passive: true, capture: true });

  // Suppress native click in selecting mode to prevent links/buttons from firing
  document.addEventListener('click', e => {
    if (mode !== 'selecting') return;
    if (e.target.closest('#cb-btn') || e.target.closest('#cb-header-btn')) return;
    e.preventDefault();
    e.stopPropagation();
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

  // ── Chat area gating (only select inside AI conversation on known platforms) ─
  function isInChatArea(el) {
    const host = location.hostname;
    const known = host.includes('chatgpt.com') || host.includes('claude.ai') || host.includes('gemini.google.com');
    if (!known) return true;
    return !!getMessageCeiling(el);
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

  // ── Text extraction (preserves list formatting) ────────────────────────────
  function extractText(el) {
    const raw = el.innerText?.trim() || '';
    if (el.tagName === 'LI') {
      const parent = el.parentElement;
      if (parent && parent.tagName === 'OL') {
        const items = Array.from(parent.children).filter(c => c.tagName === 'LI');
        const idx = items.indexOf(el) + 1;
        return `${idx}. ${raw}`;
      }
      return `• ${raw}`;
    }
    return raw;
  }

  // ── Button click ──────────────────────────────────────────────────────────
  async function handleCaptureClick() {
    if (mode === 'idle') {
      // Check auth before entering selection mode
      try {
        const session = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'getSession' }, res => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(res);
          });
        });
        if (!session) {
          // Popup itself shows the sign-in prompt — no toast needed
          chrome.runtime.sendMessage({ action: 'openPopup' });
          return;
        }
      } catch {
        showToast('Could not reach extension. Reload the page.');
        return;
      }
      enterSelecting();
      return;
    }

    if (mode === 'selecting') {
      if (moments.length === 0) {
        exitSelecting();
        return;
      }

      // Each moment becomes one block
      const blocks = moments
        .map(m => {
          const text = m.elements
            .map(el => extractText(el))
            .filter(t => t.length > 0)
            .join('\n');
          const role = detectRole(m.elements[0]);
          return { text, role };
        })
        .filter(b => b.text.length > 0);

      const text = blocks.map(b => b.text).join('\n\n');
      const source_text = text.slice(0, 80);
      const url = window.location.href;

      exitSelecting();
      setSaving();

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
            showToast('Saved.');
          } else if (response?.reason === 'not_authenticated') {
            // Popup carries the sign-in prompt — skip toast to avoid overlap
            chrome.runtime.sendMessage({ action: 'openPopup' });
          } else {
            showToast(response?.reason || 'Save failed. Please try again.');
          }
        });
      };

      try {
        chrome.runtime.sendMessage({ action: 'ping' }, () => {
          if (chrome.runtime.lastError) { /* worker was asleep, now awake */ }
          setTimeout(doSave, 100);
        });
      } catch {
        clearTimeout(saveTimeout);
        setIdle();
        showToast('Could not reach extension. Reload the page.');
      }
    }
  }

  btn.addEventListener('click', handleCaptureClick);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mode === 'selecting') exitSelecting();
  });

  // ── Element finding ───────────────────────────────────────────────────────
  function findBestElement(x, y) {
    const points = [[x,y],[x-15,y],[x+15,y],[x,y-10],[x,y+10]];
    let best = null;
    for (const [px, py] of points) {
      const el = document.elementFromPoint(px, py);
      if (!el || el.closest('#cb-btn')) continue;
      if (el.id === 'cb-hover-overlay') continue;
      const found = walkUpForText(el);
      if (!found) continue;
      if (!isInChatArea(found)) continue;
      // Prefer semantic tags over DIV/SPAN; among equals prefer first found
      if (!best) { best = found; continue; }
      const foundIsSemantic = SEMANTIC_TAGS.has(found.tagName);
      const bestIsSemantic = SEMANTIC_TAGS.has(best.tagName);
      if (foundIsSemantic && !bestIsSemantic) best = found;
      else if (foundIsSemantic && bestIsSemantic && found.innerText.length < best.innerText.length) best = found;
    }
    return best;
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

  // ── Header button injection (sit next to native Share button) ────────────
  const HEADER_BTN_ID = 'cb-header-btn';

  function buildHeaderLogo(width, height) {
    return LOGO_SVG
      .replace(/width="\d+"/, `width="${width}"`)
      .replace(/height="\d+"/, `height="${height}"`);
  }

  const HEADER_PLATFORMS = [
    {
      host: 'claude.ai',
      shareSelector: '[data-testid="wiggle-controls-actions-share"]',
      build: () => {
        const b = document.createElement('button');
        b.type = 'button';
        b.id = HEADER_BTN_ID;
        b.dataset.platform = 'claude.ai';
        b.className = 'inline-flex items-center justify-center relative isolate shrink-0 select-none border-0.5 overflow-hidden transition duration-100 h-8 rounded-md px-3 min-w-[4rem] whitespace-nowrap !text-xs';
        b.style.cssText = 'cursor:pointer;background:transparent;color:inherit;font:inherit;gap:6px';
        b.title = 'Capture moment';
        b.setAttribute('aria-label', 'Capture moment with Memento');
        b.innerHTML = `<span class="cb-icon" style="display:inline-flex;align-items:center;justify-content:center;min-width:14px">${buildHeaderLogo(14, 16)}</span><span class="cb-label">Capture</span>`;
        return b;
      },
      inject: (btnEl, shareEl) => shareEl.parentElement.insertBefore(btnEl, shareEl),
    },
    {
      host: 'chatgpt.com',
      shareSelector: '[data-testid="share-chat-button"]',
      build: () => {
        const b = document.createElement('button');
        b.type = 'button';
        b.id = HEADER_BTN_ID;
        b.dataset.platform = 'chatgpt.com';
        b.className = 'btn relative btn-ghost text-token-text-primary hover:bg-token-surface-hover rounded-lg max-sm:hidden';
        b.title = 'Capture moment';
        b.setAttribute('aria-label', 'Capture moment with Memento');
        b.innerHTML = `<div class="flex w-full items-center justify-center gap-1.5"><span class="cb-icon" style="display:inline-flex;align-items:center;justify-content:center;min-width:16px">${buildHeaderLogo(16, 18)}</span><span class="cb-label">Capture</span></div>`;
        return b;
      },
      inject: (btnEl, shareEl) => shareEl.parentElement.insertBefore(btnEl, shareEl),
    },
    {
      host: 'gemini.google.com',
      shareSelector: '[data-test-id="share-button"]',
      build: () => {
        const b = document.createElement('button');
        b.type = 'button';
        b.id = HEADER_BTN_ID;
        b.dataset.platform = 'gemini.google.com';
        b.dataset.iconOnly = 'true';
        b.style.cssText = 'width:40px;height:40px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;cursor:pointer;padding:0;color:inherit';
        b.title = 'Capture moment';
        b.setAttribute('aria-label', 'Capture moment with Memento');
        b.innerHTML = `<span class="cb-icon" style="display:inline-flex;align-items:center;justify-content:center">${buildHeaderLogo(20, 22)}</span>`;
        b.addEventListener('mouseenter', () => { if (mode === 'idle') b.style.background = 'rgba(127,127,127,0.12)'; });
        b.addEventListener('mouseleave', () => { if (mode === 'idle') b.style.background = 'transparent'; });
        return b;
      },
      inject: (btnEl, shareEl) => {
        const wrapper = shareEl.closest('.buttons-container.share') || shareEl.parentElement;
        wrapper.parentElement.insertBefore(btnEl, wrapper);
      },
    },
  ];

  function getActivePlatform() {
    const host = location.hostname;
    return HEADER_PLATFORMS.find(p => host.includes(p.host)) || null;
  }

  function tryInjectHeaderButton() {
    if (document.getElementById(HEADER_BTN_ID)) return true;
    const platform = getActivePlatform();
    if (!platform) return false;
    const shareEl = document.querySelector(platform.shareSelector);
    if (!shareEl) return false;
    const btnEl = platform.build();
    btnEl.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      handleCaptureClick();
    });
    platform.inject(btnEl, shareEl);
    if (!hasHeaderButton) {
      hasHeaderButton = true;
    }
    btn.style.display = 'none';
    // Reflect current mode in the freshly injected button
    if (mode === 'selecting') updateHeaderButton('selecting', moments.length);
    else if (mode === 'saving') updateHeaderButton('saving');
    else updateHeaderButton('idle');
    return true;
  }

  function setupHeaderInjection() {
    if (!getActivePlatform()) return;
    tryInjectHeaderButton();
    const observer = new MutationObserver(() => {
      // Re-inject if our button got removed (SPA navigation, header re-render)
      if (!document.getElementById(HEADER_BTN_ID)) {
        tryInjectHeaderButton();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // After 4s, if still no header button, give up so floating button takes over
    setTimeout(() => {
      if (!document.getElementById(HEADER_BTN_ID)) {
        hasHeaderButton = false;
        if (mode === 'idle') btn.style.display = 'flex';
      }
    }, 4000);
  }

  setupHeaderInjection();

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
