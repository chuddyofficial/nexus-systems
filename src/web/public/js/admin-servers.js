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
            s.vipActive ? ' 💎' : null,
          ]),
          el('td', {}, String(s.memberCount ?? '—')),
          el('td', { class: 'mono' }, s.ownerId),
          el('td', { class: 'muted' }, s.joinedAt ? new Date(s.joinedAt).toLocaleDateString() : '—'),
          el('td', { style: 'display:flex;gap:6px;' }, [
            el('button', { class: 'btn btn-sm', onclick: () => toggleDetail(s.id) }, 'Details'),
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
      body.appendChild(el('tr', { id: `detail-${s.id}`, style: 'display:none;' }, el('td', { colspan: '5' }, el('div', { id: `detail-body-${s.id}`, class: 'muted' }, 'Loading...'))));
    }
  }

  async function toggleDetail(guildId) {
    const row = document.getElementById(`detail-${guildId}`);
    if (!row) return;
    const isOpen = row.style.display !== 'none';
    row.style.display = isOpen ? 'none' : 'table-row';
    if (isOpen) return;
    try {
      const d = await api(`/api/admin/servers/${guildId}/detail`);
      const body = document.getElementById(`detail-body-${guildId}`);
      body.innerHTML = '';
      body.appendChild(
        el('div', { style: 'display:flex;gap:24px;flex-wrap:wrap;padding:8px 0;' }, [
          el('div', {}, [el('strong', {}, 'Warnings: '), String(d.warningCount)]),
          el('div', {}, [el('strong', {}, 'Tickets: '), `${d.ticketCount} (${d.openTicketCount} open)`]),
          el('div', {}, [el('strong', {}, 'Mod Actions: '), String(d.modActionCount)]),
          el('div', {}, [el('strong', {}, 'AutoMod: '), d.automodEnabled ? 'On' : 'Off']),
          el('div', {}, [el('strong', {}, 'Anti-Raid: '), d.antiraidEnabled ? 'On' : 'Off']),
          el('div', {}, [el('strong', {}, 'Anti-Nuke: '), d.antinukeEnabled ? 'On' : 'Off']),
          el('div', {}, [el('strong', {}, 'Owner ID: '), d.ownerId]),
          el('div', {}, [el('strong', {}, 'Created: '), new Date(d.createdAt).toLocaleDateString()]),
        ])
      );
    } catch (err) {
      toast(err.message, 'error');
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
