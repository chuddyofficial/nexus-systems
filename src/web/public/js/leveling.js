(async function () {
  const gid = window.GUILD_ID;
  try {
    const config = await api(`/api/servers/${gid}/config`);
    document.getElementById('leveling_enabled').checked = !!config.leveling_enabled;
    document.getElementById('leveling_announce_message').value = config.leveling_announce_message || '';
    await populateChannelSelect(document.getElementById('leveling_announce_channel'), gid, config.leveling_announce_channel);

    document.getElementById('save-btn').addEventListener('click', async () => {
      try {
        await api(`/api/servers/${gid}/config`, {
          method: 'POST',
          body: {
            leveling_enabled: document.getElementById('leveling_enabled').checked,
            leveling_announce_channel: document.getElementById('leveling_announce_channel').value || null,
            leveling_announce_message: document.getElementById('leveling_announce_message').value,
          },
        });
        toast('Leveling settings saved.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    await populateRoleSelect(document.getElementById('lr-role'), gid, null, false);

    async function loadLevelRoles() {
      const body = document.getElementById('lr-body');
      body.innerHTML = '';
      const rows = await api(`/api/servers/${gid}/levelroles`);
      document.getElementById('lr-empty').style.display = rows.length ? 'none' : 'block';
      for (const r of rows) {
        body.appendChild(
          el('tr', {}, [
            el('td', {}, el('span', { class: 'badge badge-brand' }, `Lv. ${r.level}`)),
            el('td', { class: 'mono' }, `@${r.role_id}`),
            el('td', {}, el('button', {
              class: 'btn btn-sm btn-danger',
              onclick: async () => {
                await api(`/api/servers/${gid}/levelroles/${r.id}`, { method: 'DELETE' });
                loadLevelRoles();
              },
            }, 'Remove')),
          ])
        );
      }
    }

    document.getElementById('lr-add').addEventListener('click', async () => {
      const level = document.getElementById('lr-level').value;
      const roleId = document.getElementById('lr-role').value;
      if (!level || !roleId) return toast('Pick a level and a role.', 'error');
      try {
        await api(`/api/servers/${gid}/levelroles`, { method: 'POST', body: { level, roleId } });
        document.getElementById('lr-level').value = '';
        toast('Level role added.');
        loadLevelRoles();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    loadLevelRoles();

    const leaderboard = await api(`/api/servers/${gid}/leaderboard`);
    const body = document.getElementById('lb-body');
    if (!leaderboard.length) {
      document.getElementById('lb-empty').style.display = 'block';
    } else {
      leaderboard.forEach((row, i) => {
        body.appendChild(
          el('tr', {}, [
            el('td', {}, `#${i + 1}`),
            el('td', { class: 'mono' }, row.user_id),
            el('td', {}, el('span', { class: 'badge badge-brand' }, `Lv. ${row.level}`)),
            el('td', {}, String(row.xp)),
          ])
        );
      });
    }
  } catch (err) {
    toast(err.message, 'error');
  }
})();
