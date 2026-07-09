(async function () {
  const gid = window.GUILD_ID;
  try {
    const config = await api(`/api/servers/${gid}/config`);
    document.getElementById('verify-enabled').checked = !!config.verify_enabled;
    document.getElementById('verify-message').value = config.verify_message || '';

    await Promise.all([
      populateChannelSelect(document.getElementById('verify-channel'), gid, config.verify_channel_id, false),
      populateRoleSelect(document.getElementById('verify-role'), gid, config.verify_role_id, false),
    ]);

    document.getElementById('verify-post').addEventListener('click', async () => {
      const channelId = document.getElementById('verify-channel').value;
      const roleId = document.getElementById('verify-role').value;
      const message = document.getElementById('verify-message').value;
      if (!channelId || !roleId) return toast('Pick a channel and a role first.', 'error');
      if (!(await confirmDialog('Post the verification panel in this channel?', { danger: false, confirmText: 'Post' }))) return;
      try {
        await api(`/api/servers/${gid}/verify/setup`, { method: 'POST', body: { channelId, roleId, message } });
        toast('Verification panel posted!');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    document.getElementById('verify-save-toggle').addEventListener('click', async () => {
      try {
        await api(`/api/servers/${gid}/config`, { method: 'POST', body: { verify_enabled: document.getElementById('verify-enabled').checked } });
        toast('Saved.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  } catch (err) {
    toast(err.message, 'error');
  }
})();
