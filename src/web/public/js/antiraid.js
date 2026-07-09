(async function () {
  const gid = window.GUILD_ID;
  try {
    const config = await api(`/api/servers/${gid}/config`);

    await populateRoleSelect(document.getElementById('autorole_id'), gid, config.autorole_id);

    document.getElementById('antiraid_enabled').checked = !!config.antiraid_enabled;
    document.getElementById('antiraid_join_threshold').value = config.antiraid_join_threshold;
    document.getElementById('antiraid_join_window').value = config.antiraid_join_window;
    document.getElementById('antiraid_action').value = config.antiraid_action;
    document.getElementById('antiraid_min_account_age_days').value = config.antiraid_min_account_age_days;

    document.getElementById('save-autorole').addEventListener('click', async () => {
      try {
        await api(`/api/servers/${gid}/config`, { method: 'POST', body: { autorole_id: document.getElementById('autorole_id').value || null } });
        toast('Auto-role saved.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    document.getElementById('save-antiraid').addEventListener('click', async () => {
      try {
        await api(`/api/servers/${gid}/config`, {
          method: 'POST',
          body: {
            antiraid_enabled: document.getElementById('antiraid_enabled').checked,
            antiraid_join_threshold: Number(document.getElementById('antiraid_join_threshold').value),
            antiraid_join_window: Number(document.getElementById('antiraid_join_window').value),
            antiraid_action: document.getElementById('antiraid_action').value,
            antiraid_min_account_age_days: Number(document.getElementById('antiraid_min_account_age_days').value),
          },
        });
        toast('Anti-raid settings saved.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  } catch (err) {
    toast(err.message, 'error');
  }
})();
