(async function () {
  try {
    const stats = await api('/api/admin/stats');
    document.getElementById('stat-guilds').textContent = stats.guildCount;
    document.getElementById('stat-members').textContent = stats.totalMembers.toLocaleString();
    document.getElementById('stat-ping').textContent = `${stats.ping}ms`;

    const servers = await api('/api/admin/servers');
    const body = document.getElementById('top-servers-body');
    body.innerHTML = '';
    for (const s of servers.slice(0, 10)) {
      body.appendChild(
        el('tr', {}, [
          el('td', {}, s.name),
          el('td', {}, String(s.memberCount ?? '—')),
          el('td', {}, el('a', { class: 'btn btn-sm', href: `/servers/${s.id}` }, 'Open')),
        ])
      );
    }
  } catch (err) {
    toast(err.message, 'error');
  }
})();
