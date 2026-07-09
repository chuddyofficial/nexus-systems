(async function () {
  const gid = window.GUILD_ID;

  function formatExpiry(iso) {
    if (!iso) return '';
    return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString();
  }

  async function load() {
    try {
      const status = await api(`/api/servers/${gid}/vip`);

      const titleEl = document.getElementById('status-title');
      const descEl = document.getElementById('status-desc');
      const statusCard = document.getElementById('status-card');

      if (status.active) {
        statusCard.style.borderColor = 'var(--brand)';
        titleEl.textContent = status.tier === 'lifetime' ? '💎 VIP — Lifetime' : '💎 VIP — Annual';
        descEl.textContent = status.tier === 'lifetime'
          ? 'This server has lifetime VIP. Thank you for the support!'
          : `This server's VIP is active until ${formatExpiry(status.expiresAt)}.`;
        document.getElementById('redeem-card').style.display = 'none';
        document.getElementById('nickname-lock').style.display = 'none';
        document.getElementById('nickname-input').disabled = false;
        document.getElementById('nickname-btn').disabled = false;
        if (status.nickname) document.getElementById('nickname-input').value = status.nickname;
      } else {
        titleEl.textContent = 'Not VIP';
        descEl.textContent = 'This server is on the free tier. Redeem a code below to unlock VIP perks.';
        document.getElementById('redeem-card').style.display = 'block';
        document.getElementById('nickname-input').disabled = true;
        document.getElementById('nickname-btn').disabled = true;
      }

      const perksBody = document.getElementById('perks-body');
      perksBody.innerHTML = '';
      const rows = [
        ['Ticket Panels', status.limits.ticketPanels, 'Unlimited'],
        ['Custom Commands', status.limits.customCommands, 'Unlimited'],
        ['Saved Embeds', status.limits.savedEmbeds, 'Unlimited'],
        ['Level Roles', status.limits.levelRoles, 'Unlimited'],
        ['Reaction Roles', status.limits.reactionRoles, 'Unlimited'],
        ['Priority-Tagged Tickets', '—', '⭐ Yes'],
        ['Custom Bot Nickname', '—', '✅ Yes'],
      ];
      for (const [feature, free, vip] of rows) {
        perksBody.appendChild(el('tr', {}, [el('td', {}, feature), el('td', {}, String(free)), el('td', {}, String(vip))]));
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('redeem-btn').addEventListener('click', async () => {
    const code = document.getElementById('redeem-code').value.trim();
    if (!code) return toast('Enter a code.', 'error');
    try {
      await api(`/api/servers/${gid}/vip/redeem`, { method: 'POST', body: { code } });
      toast('VIP activated! 💎');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('nickname-btn').addEventListener('click', async () => {
    try {
      await api(`/api/servers/${gid}/vip/nickname`, { method: 'POST', body: { nickname: document.getElementById('nickname-input').value } });
      toast('Nickname updated.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  load();
})();
