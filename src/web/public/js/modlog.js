(async function () {
  const gid = window.GUILD_ID;
  const badgeColor = { ban: 'red', kick: 'yellow', timeout: 'yellow', warn: 'yellow', unban: 'green', untimeout: 'green', clear_warnings: 'green' };
  try {
    const actions = await api(`/api/servers/${gid}/modlog`);
    const body = document.getElementById('modlog-body');
    if (!actions.length) {
      document.getElementById('modlog-empty').style.display = 'block';
      return;
    }
    for (const a of actions) {
      body.appendChild(
        el('tr', {}, [
          el('td', {}, el('span', { class: `badge badge-${badgeColor[a.action_type] || 'brand'}` }, a.action_type)),
          el('td', { class: 'mono' }, a.user_id),
          el('td', { class: 'mono' }, a.moderator_id),
          el('td', {}, a.reason || ''),
          el('td', { class: 'muted' }, new Date(a.created_at.replace(' ', 'T') + 'Z').toLocaleString()),
        ])
      );
    }
  } catch (err) {
    toast(err.message, 'error');
  }
})();
