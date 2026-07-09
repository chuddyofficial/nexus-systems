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
