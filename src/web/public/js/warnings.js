(async function () {
  const gid = window.GUILD_ID;
  const PAGE_SIZE = 50;
  let offset = 0;
  let total = 0;
  let loaded = [];

  function renderRow(w) {
    return el('tr', { 'data-id': w.id }, [
      el('td', { class: 'mono' }, `#${w.id}`),
      el('td', { class: 'mono' }, w.user_id),
      el('td', { class: 'mono' }, w.moderator_id),
      el('td', {}, w.reason || ''),
      el('td', { class: 'muted' }, new Date(w.created_at.replace(' ', 'T') + 'Z').toLocaleString()),
      el('td', {}, el('button', {
        class: 'btn btn-sm btn-danger',
        onclick: async (e) => {
          await api(`/api/servers/${gid}/warnings/${w.id}`, { method: 'DELETE' });
          e.target.closest('tr').remove();
        },
      }, 'Delete')),
    ]);
  }

  function applyFilter() {
    const q = document.getElementById('warnings-search').value.trim().toLowerCase();
    const body = document.getElementById('warnings-body');
    body.innerHTML = '';
    const filtered = q ? loaded.filter((w) => w.user_id.includes(q) || (w.reason || '').toLowerCase().includes(q)) : loaded;
    document.getElementById('warnings-empty').style.display = filtered.length ? 'none' : 'block';
    for (const w of filtered) body.appendChild(renderRow(w));
  }

  async function loadPage() {
    try {
      const { rows, total: t } = await api(`/api/servers/${gid}/warnings/page?limit=${PAGE_SIZE}&offset=${offset}`);
      total = t;
      loaded = loaded.concat(rows);
      offset += rows.length;
      applyFilter();
      document.getElementById('warnings-load-more').style.display = offset < total ? 'block' : 'none';
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('warnings-search').addEventListener('input', applyFilter);
  document.getElementById('warnings-load-more').addEventListener('click', loadPage);
  document.getElementById('warnings-export').addEventListener('click', async () => {
    try {
      const all = await api(`/api/servers/${gid}/warnings`);
      if (!all.length) return toast('Nothing to export.', 'error');
      downloadCsv('warnings.csv', all, [
        { key: 'id', label: 'ID' },
        { key: 'user_id', label: 'User ID' },
        { key: 'moderator_id', label: 'Moderator ID' },
        { key: 'reason', label: 'Reason' },
        { key: 'created_at', label: 'When' },
      ]);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  loadPage();
})();
