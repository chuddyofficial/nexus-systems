(async function () {
  const gid = window.GUILD_ID;
  try {
    const config = await api(`/api/servers/${gid}/config`);

    document.getElementById('welcome_enabled').checked = !!config.welcome_enabled;
    document.getElementById('welcome_message').value = config.welcome_message || '';
    document.getElementById('welcome_embed_color').value = config.welcome_embed_color || '#5865F2';
    document.getElementById('leave_enabled').checked = !!config.leave_enabled;
    document.getElementById('leave_message').value = config.leave_message || '';

    await Promise.all([
      populateChannelSelect(document.getElementById('welcome_channel'), gid, config.welcome_channel),
      populateChannelSelect(document.getElementById('leave_channel'), gid, config.leave_channel),
    ]);

    document.getElementById('save-btn').addEventListener('click', async () => {
      try {
        await api(`/api/servers/${gid}/config`, {
          method: 'POST',
          body: {
            welcome_enabled: document.getElementById('welcome_enabled').checked,
            welcome_channel: document.getElementById('welcome_channel').value || null,
            welcome_message: document.getElementById('welcome_message').value,
            welcome_embed_color: document.getElementById('welcome_embed_color').value,
            leave_enabled: document.getElementById('leave_enabled').checked,
            leave_channel: document.getElementById('leave_channel').value || null,
            leave_message: document.getElementById('leave_message').value,
          },
        });
        toast('Welcome/leave settings saved.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  } catch (err) {
    toast(err.message, 'error');
  }
})();
