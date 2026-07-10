(async function () {
  const gid = window.GUILD_ID;
  try {
    const config = await api(`/api/servers/${gid}/config`);
    document.getElementById('starboard_enabled').checked = !!config.starboard_enabled;
    document.getElementById('starboard_emoji').value = config.starboard_emoji || '⭐';
    document.getElementById('starboard_threshold').value = config.starboard_threshold;
    document.getElementById('starboard_exclude_self').checked = !!config.starboard_exclude_self;
    await populateChannelSelect(document.getElementById('starboard_channel'), gid, config.starboard_channel);

    document.getElementById('save-btn').addEventListener('click', async () => {
      try {
        await api(`/api/servers/${gid}/config`, {
          method: 'POST',
          body: {
            starboard_enabled: document.getElementById('starboard_enabled').checked,
            starboard_channel: document.getElementById('starboard_channel').value || null,
            starboard_emoji: document.getElementById('starboard_emoji').value || '⭐',
            starboard_threshold: Number(document.getElementById('starboard_threshold').value),
            starboard_exclude_self: document.getElementById('starboard_exclude_self').checked,
          },
        });
        toast('Starboard settings saved.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  } catch (err) {
    toast(err.message, 'error');
  }
})();
