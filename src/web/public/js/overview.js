(async function () {
  const gid = window.GUILD_ID;
  try {
    const [overview, config] = await Promise.all([api(`/api/servers/${gid}/overview`), api(`/api/servers/${gid}/config`)]);

    document.getElementById('stat-members').textContent = overview.memberCount ?? '—';
    document.getElementById('stat-channels').textContent = overview.channelCount ?? '—';
    document.getElementById('stat-roles').textContent = overview.roleCount ?? '—';

    await Promise.all([
      populateChannelSelect(document.getElementById('mod_log_channel'), gid, config.mod_log_channel),
      populateChannelSelect(document.getElementById('message_log_channel'), gid, config.message_log_channel),
      populateChannelSelect(document.getElementById('join_log_channel'), gid, config.join_log_channel),
    ]);

    document.getElementById('save-btn').addEventListener('click', async () => {
      try {
        await api(`/api/servers/${gid}/config`, {
          method: 'POST',
          body: {
            mod_log_channel: document.getElementById('mod_log_channel').value || null,
            message_log_channel: document.getElementById('message_log_channel').value || null,
            join_log_channel: document.getElementById('join_log_channel').value || null,
          },
        });
        toast('Saved logging settings.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  } catch (err) {
    toast(err.message, 'error');
  }
})();
