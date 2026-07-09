(async function () {
  let allServers = [];
  const body = document.getElementById('servers-body');
  const emptyState = document.getElementById('servers-empty');

  function render(list) {
    body.innerHTML = '';
    emptyState.style.display = list.length ? 'none' : 'block';
    for (const s of list) {
      body.appendChild(
        el('tr', {}, [
          el('td', {}, [
            s.icon ? el('img', { src: s.icon, style: 'width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:8px;' }) : null,
            s.name,
          ]),
          el('td', {}, String(s.memberCount ?? '—')),
          el('td', { class: 'mono' }, s.ownerId),
          el('td', { class: 'muted' }, s.joinedAt ? new Date(s.joinedAt).toLocaleDateString() : '—'),
          el('td', { style: 'display:flex;gap:6px;' }, [
            el('a', { class: 'btn btn-sm', href: `/servers/${s.id}` }, 'Open Dashboard'),
            el('button', {
              class: 'btn btn-sm btn-danger',
              onclick: async () => {
                if (!(await confirmDialog(`Remove the bot from "${s.name}"? It will need to be re-invited to come back.`))) return;
                try {
                  await api(`/api/admin/servers/${s.id}/leave`, { method: 'POST' });
                  toast('Left server.');
                  load();
                } catch (err) {
                  toast(err.message, 'error');
                }
              },
            }, 'Leave'),
          ]),
        ])
      );
    }
  }

  async function load() {
    try {
      allServers = await api('/api/admin/servers');
      render(allServers);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    render(!q ? allServers : allServers.filter((s) => s.name.toLowerCase().includes(q) || s.id.includes(q)));
  });

  load();
})();
