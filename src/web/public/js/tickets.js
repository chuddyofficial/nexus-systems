(async function () {
  const gid = window.GUILD_ID;

  async function loadTickets() {
    const tickets = await api(`/api/servers/${gid}/tickets`);
    const openBody = document.getElementById('open-body');
    const historyBody = document.getElementById('history-body');
    openBody.innerHTML = '';
    historyBody.innerHTML = '';

    const open = tickets.filter((t) => t.status === 'open');
    document.getElementById('open-empty').style.display = open.length ? 'none' : 'block';

    for (const t of open) {
      openBody.appendChild(
        el('tr', {}, [
          el('td', { class: 'mono' }, `#${t.channel_id}`),
          el('td', { class: 'mono' }, t.user_id),
          el('td', { class: 'muted' }, new Date(t.created_at.replace(' ', 'T') + 'Z').toLocaleString()),
          el('td', {}, el('button', {
            class: 'btn btn-sm btn-danger',
            onclick: async () => {
              if (!(await confirmDialog('Close and delete this ticket channel?'))) return;
              await api(`/api/servers/${gid}/tickets/${t.id}/close`, { method: 'POST' });
              toast('Ticket closed.');
              loadTickets();
            },
          }, 'Close')),
        ])
      );
    }

    for (const t of tickets.slice(0, 30)) {
      historyBody.appendChild(
        el('tr', {}, [
          el('td', { class: 'mono' }, `#${t.channel_id}`),
          el('td', { class: 'mono' }, t.user_id),
          el('td', {}, el('span', { class: `badge ${t.status === 'open' ? 'badge-green' : 'badge-red'}` }, t.status)),
          el('td', { class: 'muted' }, new Date(t.created_at.replace(' ', 'T') + 'Z').toLocaleString()),
        ])
      );
    }
  }

  await Promise.all([
    populateChannelSelect(document.getElementById('panel_channel'), gid, null, false),
    populateCategorySelect(document.getElementById('category'), gid, null, false),
    populateRoleSelect(document.getElementById('support_role'), gid, null, false),
  ]);

  document.getElementById('post-panel-btn').addEventListener('click', async () => {
    const panelChannelId = document.getElementById('panel_channel').value;
    const categoryId = document.getElementById('category').value;
    const supportRoleId = document.getElementById('support_role').value;
    if (!panelChannelId || !categoryId || !supportRoleId) return toast('Pick a panel channel, category, and support role.', 'error');
    try {
      await api(`/api/servers/${gid}/tickets/setup`, { method: 'POST', body: { panelChannelId, categoryId, supportRoleId } });
      toast('Ticket panel posted!');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  loadTickets().catch((err) => toast(err.message, 'error'));
})();
