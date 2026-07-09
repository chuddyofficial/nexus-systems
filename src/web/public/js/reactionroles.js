(async function () {
  const gid = window.GUILD_ID;
  try {
    const rows = await api(`/api/servers/${gid}/reactionroles`);
    const body = document.getElementById('rr-body');
    if (!rows.length) {
      document.getElementById('rr-empty').style.display = 'block';
      return;
    }
    for (const r of rows) {
      body.appendChild(
        el('tr', {}, [
          el('td', { class: 'mono' }, `#${r.channel_id}`),
          el('td', { class: 'mono' }, r.message_id),
          el('td', {}, /^\d+$/.test(r.emoji) ? `custom:${r.emoji}` : r.emoji),
          el('td', { class: 'mono' }, `@${r.role_id}`),
          el('td', {}, el('button', {
            class: 'btn btn-sm btn-danger',
            onclick: async (e) => {
              await api(`/api/servers/${gid}/reactionroles/${r.id}`, { method: 'DELETE' });
              e.target.closest('tr').remove();
            },
          }, 'Delete')),
        ])
      );
    }
  } catch (err) {
    toast(err.message, 'error');
  }
})();
