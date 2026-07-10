(async function () {
  const gid = window.GUILD_ID;
  let noXpChannels = [];
  try {
    const config = await api(`/api/servers/${gid}/config`);
    document.getElementById('leveling_enabled').checked = !!config.leveling_enabled;
    document.getElementById('leveling_announce_message').value = config.leveling_announce_message || '';
    document.getElementById('leveling_xp_multiplier').value = config.leveling_xp_multiplier;
    document.getElementById('vip-multiplier-note').style.display = config.vip_active ? 'inline' : 'none';
    await populateChannelSelect(document.getElementById('leveling_announce_channel'), gid, config.leveling_announce_channel);

    const channels = await api(`/api/servers/${gid}/channels`);
    const channelMap = Object.fromEntries(channels.map((c) => [c.id, c.name]));
    noXpChannels = [...(config.leveling_no_xp_channels || [])];

    function renderNoXpChannels() {
      const list = document.getElementById('noxp-channels-list');
      list.innerHTML = '';
      for (const id of noXpChannels) {
        list.appendChild(
          el('div', { class: 'tag-chip' }, [
            document.createTextNode('#' + (channelMap[id] || id)),
            el('button', { onclick: () => { noXpChannels = noXpChannels.filter((x) => x !== id); renderNoXpChannels(); } }, '✕'),
          ])
        );
      }
    }
    renderNoXpChannels();
    await populateChannelSelect(document.getElementById('noxp-channel-select'), gid, null, false);

    document.getElementById('add-noxp-channel').addEventListener('click', () => {
      const select = document.getElementById('noxp-channel-select');
      if (select.value && !noXpChannels.includes(select.value)) {
        noXpChannels.push(select.value);
        renderNoXpChannels();
      }
    });

    document.getElementById('save-btn').addEventListener('click', async () => {
      try {
        await api(`/api/servers/${gid}/config`, {
          method: 'POST',
          body: {
            leveling_enabled: document.getElementById('leveling_enabled').checked,
            leveling_announce_channel: document.getElementById('leveling_announce_channel').value || null,
            leveling_announce_message: document.getElementById('leveling_announce_message').value,
            leveling_xp_multiplier: Number(document.getElementById('leveling_xp_multiplier').value) || 100,
            leveling_no_xp_channels: noXpChannels,
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
            el('td', {}, el('button', {
              class: 'btn btn-sm btn-danger',
              onclick: async () => {
                if (!(await confirmDialog(`Reset XP for ${row.user_id}?`))) return;
                await api(`/api/servers/${gid}/leaderboard/${row.user_id}/reset`, { method: 'POST' });
                toast('XP reset.');
                document.querySelector(`#lb-body tr:nth-child(${i + 1})`)?.remove();
              },
            }, 'Reset')),
          ])
        );
      });
    }
  } catch (err) {
    toast(err.message, 'error');
  }
})();
