function toast(message, type = 'success') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

async function populateChannelSelect(selectEl, guildId, selectedValue, allowNone = true) {
  const channels = await api(`/api/servers/${guildId}/channels`);
  selectEl.innerHTML = '';
  if (allowNone) selectEl.appendChild(el('option', { value: '' }, '— None —'));
  for (const c of channels) {
    const opt = el('option', { value: c.id }, `#${c.name}`);
    if (c.id === selectedValue) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

async function populateRoleSelect(selectEl, guildId, selectedValue, allowNone = true) {
  const roles = await api(`/api/servers/${guildId}/roles`);
  selectEl.innerHTML = '';
  if (allowNone) selectEl.appendChild(el('option', { value: '' }, '— None —'));
  for (const r of roles) {
    const opt = el('option', { value: r.id }, r.name);
    if (r.id === selectedValue) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

async function populateCategorySelect(selectEl, guildId, selectedValue, allowNone = true) {
  const categories = await api(`/api/servers/${guildId}/categories`);
  selectEl.innerHTML = '';
  if (allowNone) selectEl.appendChild(el('option', { value: '' }, '— None —'));
  for (const c of categories) {
    const opt = el('option', { value: c.id }, c.name);
    if (c.id === selectedValue) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function skeletonBlock(count = 3) {
  const wrap = el('div', {});
  for (let i = 0; i < count; i++) wrap.appendChild(el('div', { class: 'skeleton skeleton-line' }));
  return wrap;
}

function renderBarChart(container, data, valueKey = 'total', labelKey = 'day') {
  container.innerHTML = '';
  if (!data.length) {
    container.appendChild(el('div', { class: 'empty-state' }, 'No data yet.'));
    return;
  }
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  const chart = el('div', { class: 'bar-chart' });
  for (const d of data) {
    const height = Math.max(2, Math.round((d[valueKey] / max) * 130));
    chart.appendChild(el('div', { class: 'bar', style: `height:${height}px;`, title: `${d[labelKey]}: ${d[valueKey]}` }));
  }
  container.appendChild(chart);
  const legend = el('div', { class: 'chart-legend' }, [
    el('span', {}, data[0][labelKey]),
    el('span', {}, data[data.length - 1][labelKey]),
  ]);
  container.appendChild(legend);
}

// ---------- Custom modal (replaces window.confirm) ----------
function ensureModalRoot() {
  let overlay = document.getElementById('modal-root');
  if (overlay) return overlay;
  overlay = el('div', { class: 'modal-overlay', id: 'modal-root' });
  document.body.appendChild(overlay);
  return overlay;
}

function confirmDialog(message, { title = 'Are you sure?', danger = true, confirmText = 'Confirm' } = {}) {
  return new Promise((resolve) => {
    const overlay = ensureModalRoot();
    const close = (result) => {
      overlay.classList.remove('open');
      overlay.innerHTML = '';
      resolve(result);
    };
    const box = el('div', { class: 'modal-box' }, [
      el('h3', {}, title),
      el('p', {}, message),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn', onclick: () => close(false) }, 'Cancel'),
        el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => close(true) }, confirmText),
      ]),
    ]);
    overlay.innerHTML = '';
    overlay.appendChild(box);
    overlay.classList.add('open');
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
  });
}

// ---------- Theme toggle ----------
function initThemeToggle(buttonEl) {
  const apply = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (buttonEl) buttonEl.textContent = theme === 'dark' ? '🌙' : '☀️';
  };
  const current = localStorage.getItem('theme') || 'dark';
  apply(current);
  if (buttonEl) {
    buttonEl.addEventListener('click', () => {
      apply(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }
}

// ---------- Command palette (Ctrl/Cmd+K) ----------
function initCommandPalette(guildId) {
  const pages = [
    { label: 'Overview', href: `/servers/${guildId}` },
    { label: 'Moderation', href: `/servers/${guildId}/moderation` },
    { label: 'AutoMod', href: `/servers/${guildId}/automod` },
    { label: 'Anti-Raid & Auto-Role', href: `/servers/${guildId}/antiraid` },
    { label: 'Welcome / Leave', href: `/servers/${guildId}/welcome` },
    { label: 'Leveling', href: `/servers/${guildId}/leveling` },
    { label: 'Starboard', href: `/servers/${guildId}/starboard` },
    { label: 'Tickets', href: `/servers/${guildId}/tickets` },
    { label: 'Giveaways', href: `/servers/${guildId}/giveaways` },
    { label: 'Suggestions', href: `/servers/${guildId}/suggestions` },
    { label: 'Custom Embeds', href: `/servers/${guildId}/embeds` },
    { label: 'Reaction Roles', href: `/servers/${guildId}/reactionroles` },
    { label: 'Custom Commands', href: `/servers/${guildId}/customcommands` },
    { label: 'Warnings', href: `/servers/${guildId}/warnings` },
    { label: 'Moderator Notes', href: `/servers/${guildId}/notes` },
    { label: 'Mod Log', href: `/servers/${guildId}/modlog` },
    { label: 'Audit Log', href: `/servers/${guildId}/auditlog` },
    { label: 'Analytics', href: `/servers/${guildId}/analytics` },
    { label: 'Members', href: `/servers/${guildId}/members` },
    { label: 'Backup & Restore', href: `/servers/${guildId}/backup` },
    { label: 'Live Console', href: `/servers/${guildId}/console` },
    { label: 'VIP', href: `/servers/${guildId}/vip` },
    { label: '← All Servers', href: `/servers` },
  ];

  const overlay = el('div', { class: 'palette-overlay', id: 'palette-root' });
  const input = el('input', { class: 'palette-input', placeholder: 'Jump to a page... (Esc to close)' });
  const results = el('div', { class: 'palette-results' });
  overlay.appendChild(el('div', { class: 'palette-box' }, [input, results]));
  document.body.appendChild(overlay);

  let activeIndex = 0;
  let filtered = pages;

  function render() {
    results.innerHTML = '';
    filtered.forEach((p, i) => {
      results.appendChild(
        el('div', { class: `palette-item ${i === activeIndex ? 'active' : ''}`, onclick: () => (window.location.href = p.href) }, [
          document.createTextNode(p.label),
        ])
      );
    });
  }

  function open() {
    overlay.classList.add('open');
    input.value = '';
    filtered = pages;
    activeIndex = 0;
    render();
    setTimeout(() => input.focus(), 10);
  }
  function close() {
    overlay.classList.remove('open');
  }

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    filtered = pages.filter((p) => p.label.toLowerCase().includes(q));
    activeIndex = 0;
    render();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, filtered.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); render(); }
    else if (e.key === 'Enter') { if (filtered[activeIndex]) window.location.href = filtered[activeIndex].href; }
    else if (e.key === 'Escape') close();
  });

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      overlay.classList.contains('open') ? close() : open();
    }
  });

  return { open, close };
}

// ---------- Emergency lockdown quick toggle (sidebar) ----------
async function initLockdownToggle(buttonEl, guildId) {
  const applyState = (active) => {
    buttonEl.textContent = active ? '🔒' : '🔓';
    buttonEl.classList.toggle('lockdown-active', active);
    buttonEl.title = active ? 'Lockdown is ON — click to lift it' : 'Toggle emergency lockdown';
  };

  try {
    const config = await api(`/api/servers/${guildId}/config`);
    applyState(!!config.antiraid_lockdown_active);
  } catch {
    /* ignore — button just won't reflect live state until clicked */
  }

  buttonEl.addEventListener('click', async () => {
    try {
      const config = await api(`/api/servers/${guildId}/config`);
      const next = !config.antiraid_lockdown_active;
      if (next && !(await confirmDialog(
        'Every new member who joins will be immediately removed until you turn this off. Use this during an active raid.',
        { title: 'Enable emergency lockdown?', confirmText: 'Enable Lockdown' }
      ))) return;
      await api(`/api/servers/${guildId}/config`, { method: 'POST', body: { antiraid_lockdown_active: next } });
      applyState(next);
      toast(next ? '🔒 Emergency lockdown enabled.' : 'Lockdown lifted.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) initThemeToggle(themeBtn);

  if (window.GUILD_ID) {
    const palette = initCommandPalette(window.GUILD_ID);
    const paletteBtn = document.getElementById('palette-trigger-btn');
    if (paletteBtn) paletteBtn.addEventListener('click', palette.open);

    const lockdownBtn = document.getElementById('lockdown-toggle-btn');
    if (lockdownBtn) initLockdownToggle(lockdownBtn, window.GUILD_ID);
  }
});
