(function () {
  const gid = window.GUILD_ID;

  function parseDuration(input) {
    const match = /^(\d+)\s*(m|min|h|hr|hour|d|day)s?$/i.exec(input.trim());
    if (!match) return null;
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const multipliers = { m: 60000, min: 60000, h: 3600000, hr: 3600000, hour: 3600000, d: 86400000, day: 86400000 };
    return amount * multipliers[unit];
  }

  async function loadGiveaways() {
    const rows = await api(`/api/servers/${gid}/giveaways`);
    const body = document.getElementById('gw-body');
    body.innerHTML = '';
    document.getElementById('gw-empty').style.display = rows.length ? 'none' : 'block';
    for (const g of rows) {
      body.appendChild(
        el('tr', {}, [
          el('td', {}, g.prize),
          el('td', { class: 'mono' }, `#${g.channel_id}`),
          el('td', {}, String(g.winner_count)),
          el('td', {}, el('span', { class: `badge ${g.ended ? 'badge-red' : 'badge-green'}` }, g.ended ? 'Ended' : 'Active')),
          el('td', { class: 'muted' }, new Date(g.ends_at.replace(' ', 'T') + 'Z').toLocaleString()),
          el('td', {}, g.ended ? '' : el('button', {
            class: 'btn btn-sm',
            onclick: async () => {
              if (!(await confirmDialog(`End "${g.prize}" now and pick winner(s)?`, { danger: false, confirmText: 'End Now' }))) return;
              try {
                await api(`/api/servers/${gid}/giveaways/${g.id}/end`, { method: 'POST' });
                toast('Giveaway ended.');
                loadGiveaways();
              } catch (err) {
                toast(err.message, 'error');
              }
            },
          }, '🎉 End Now')),
        ])
      );
    }
  }

  document.getElementById('gw-start').addEventListener('click', async () => {
    const channelId = document.getElementById('gw-channel').value;
    const prize = document.getElementById('gw-prize').value.trim();
    const durationInput = document.getElementById('gw-duration').value;
    const winnerCount = Number(document.getElementById('gw-winners').value) || 1;
    if (!channelId || !prize) return toast('Pick a channel and enter a prize.', 'error');
    const durationMs = parseDuration(durationInput);
    if (!durationMs) return toast('Invalid duration — use formats like 30m, 2h, 1d.', 'error');

    try {
      await api(`/api/servers/${gid}/giveaways`, { method: 'POST', body: { channelId, prize, winnerCount, durationMs } });
      toast('Giveaway started!');
      document.getElementById('gw-prize').value = '';
      document.getElementById('gw-duration').value = '';
      loadGiveaways();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  populateChannelSelect(document.getElementById('gw-channel'), gid, null, false);
  loadGiveaways().catch((err) => toast(err.message, 'error'));
})();
