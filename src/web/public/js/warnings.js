(async function () {
  const gid = window.GUILD_ID;
  try {
    const warnings = await api(`/api/servers/${gid}/warnings`);
    const body = document.getElementById('warnings-body');
    if (!warnings.length) {
      document.getElementById('warnings-empty').style.display = 'block';
      return;
    }
    for (const w of warnings) {
      body.appendChild(
        el('tr', {}, [
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
        ])
      );
    }
  } catch (err) {
    toast(err.message, 'error');
  }
})();
