(async function () {
  const gid = window.GUILD_ID;
  const badgeColor = { ban: 'red', kick: 'yellow', timeout: 'yellow', warn: 'yellow', unban: 'green', untimeout: 'green', clear_warnings: 'green', softban: 'red' };
  const PAGE_SIZE = 50;
  let offset = 0;
  let total = 0;
  let loaded = [];

  function renderRow(a) {
    return el('tr', {}, [
      el('td', {}, el('span', { class: `badge badge-${badgeColor[a.action_type] || 'brand'}` }, a.action_type)),
      el('td', { class: 'mono' }, a.user_id),
      el('td', { class: 'mono' }, a.moderator_id),
      el('td', {}, a.reason || ''),
      el('td', { class: 'muted' }, new Date(a.created_at.replace(' ', 'T') + 'Z').toLocaleString()),
    ]);
  }

  function applyFilter() {
    const q = document.getElementById('modlog-search').value.trim().toLowerCase();
    const body = document.getElementById('modlog-body');
    body.innerHTML = '';
    const filtered = q
      ? loaded.filter((a) => a.user_id.includes(q) || a.moderator_id.includes(q) || a.action_type.toLowerCase().includes(q))
      : loaded;
    document.getElementById('modlog-empty').style.display = filtered.length ? 'none' : 'block';
    for (const a of filtered) body.appendChild(renderRow(a));
  }

  async function loadPage() {
    try {
      const { rows, total: t } = await api(`/api/servers/${gid}/modlog/page?limit=${PAGE_SIZE}&offset=${offset}`);
      total = t;
      loaded = loaded.concat(rows);
      offset += rows.length;
      applyFilter();
      document.getElementById('modlog-load-more').style.display = offset < total ? 'block' : 'none';
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('modlog-search').addEventListener('input', applyFilter);
  document.getElementById('modlog-load-more').addEventListener('click', loadPage);
  document.getElementById('modlog-export').addEventListener('click', async () => {
    try {
      const all = await api(`/api/servers/${gid}/modlog`);
      if (!all.length) return toast('Nothing to export.', 'error');
      downloadCsv('modlog.csv', all, [
        { key: 'id', label: 'ID' },
        { key: 'action_type', label: 'Action' },
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
