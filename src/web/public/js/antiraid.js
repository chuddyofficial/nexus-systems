(async function () {
  const gid = window.GUILD_ID;
  let antinukeBypass = [];

  function renderAntinukeBypass() {
    const list = document.getElementById('antinuke-bypass-list');
    list.innerHTML = '';
    for (const id of antinukeBypass) {
      list.appendChild(
        el('div', { class: 'tag-chip' }, [
          document.createTextNode(id),
          el('button', { onclick: () => { antinukeBypass = antinukeBypass.filter((x) => x !== id); renderAntinukeBypass(); } }, '✕'),
        ])
      );
    }
  }

  try {
    const config = await api(`/api/servers/${gid}/config`);

    await populateRoleSelect(document.getElementById('autorole_id'), gid, config.autorole_id);
    await populateChannelSelect(document.getElementById('antiraid_alert_channel'), gid, config.antiraid_alert_channel);

    document.getElementById('antiraid_lockdown_active').checked = !!config.antiraid_lockdown_active;
    document.getElementById('antiraid_enabled').checked = !!config.antiraid_enabled;
    document.getElementById('antiraid_join_threshold').value = config.antiraid_join_threshold;
    document.getElementById('antiraid_join_window').value = config.antiraid_join_window;
    document.getElementById('antiraid_action').value = config.antiraid_action;
    document.getElementById('antiraid_min_account_age_days').value = config.antiraid_min_account_age_days;
    document.getElementById('antinuke_enabled').checked = !!config.antinuke_enabled;
    document.getElementById('antinuke_threshold').value = config.antinuke_threshold;
    document.getElementById('antinuke_window').value = config.antinuke_window;
    document.getElementById('antinuke_punishment').value = config.antinuke_punishment;
    antinukeBypass = [...(config.antinuke_bypass_ids || [])];
    renderAntinukeBypass();

    document.getElementById('add-antinuke-bypass').addEventListener('click', () => {
      const input = document.getElementById('antinuke-bypass-input');
      const val = input.value.trim();
      if (/^\d{15,21}$/.test(val) && !antinukeBypass.includes(val)) {
        antinukeBypass.push(val);
        renderAntinukeBypass();
      } else if (val) {
        toast('Enter a valid Discord role or user ID.', 'error');
      }
      input.value = '';
    });

    document.getElementById('save-autorole').addEventListener('click', async () => {
      try {
        await api(`/api/servers/${gid}/config`, { method: 'POST', body: { autorole_id: document.getElementById('autorole_id').value || null } });
        toast('Auto-role saved.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    document.getElementById('antiraid_lockdown_active').addEventListener('change', async (e) => {
      try {
        await api(`/api/servers/${gid}/config`, { method: 'POST', body: { antiraid_lockdown_active: e.target.checked } });
        toast(e.target.checked ? '🔒 Emergency lockdown is ON — new joins will be removed.' : 'Lockdown lifted.');
      } catch (err) {
        e.target.checked = !e.target.checked;
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
            antiraid_alert_channel: document.getElementById('antiraid_alert_channel').value || null,
          },
        });
        toast('Anti-raid settings saved.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    document.getElementById('save-antinuke').addEventListener('click', async () => {
      try {
        await api(`/api/servers/${gid}/config`, {
          method: 'POST',
          body: {
            antinuke_enabled: document.getElementById('antinuke_enabled').checked,
            antinuke_threshold: Number(document.getElementById('antinuke_threshold').value),
            antinuke_window: Number(document.getElementById('antinuke_window').value),
            antinuke_punishment: document.getElementById('antinuke_punishment').value,
            antinuke_bypass_ids: antinukeBypass,
          },
        });
        toast('Anti-nuke settings saved.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  } catch (err) {
    toast(err.message, 'error');
  }
})();
