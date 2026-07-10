(async function () {
  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso.replace(' ', 'T') + 'Z').toLocaleDateString();
  }

  async function loadStats() {
    try {
      const stats = await api('/api/admin/vip/stats');
      document.getElementById('stat-total-codes').textContent = stats.totalCodes;
      document.getElementById('stat-redeemed-codes').textContent = stats.redeemedCodes;
      document.getElementById('stat-active-vip').textContent = stats.activeVipServers;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadServers() {
    const select = document.getElementById('grant-server');
    try {
      const servers = await api('/api/admin/servers');
      select.innerHTML = '';
      for (const s of servers) select.appendChild(el('option', { value: s.id }, s.name));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadVipServers() {
    const body = document.getElementById('vip-servers-body');
    const emptyState = document.getElementById('vip-servers-empty');
    try {
      const servers = await api('/api/admin/vip/servers');
      const active = servers.filter((s) => s.active);
      body.innerHTML = '';
      emptyState.style.display = active.length ? 'none' : 'block';
      for (const s of active) {
        body.appendChild(
          el('tr', {}, [
            el('td', {}, s.name),
            el('td', {}, { lifetime: '💎 Lifetime', year: '⭐ Year', month: '🌙 Month' }[s.tier] || s.tier),
            el('td', { class: 'muted' }, s.tier === 'lifetime' ? '—' : formatDate(s.expiresAt)),
          ])
        );
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadCodes() {
    const body = document.getElementById('codes-body');
    try {
      const codes = await api('/api/admin/vip/codes');
      body.innerHTML = '';
      for (const c of codes) {
        const status = c.redeemed_guild_id
          ? `Redeemed ${formatDate(c.redeemed_at)}`
          : 'Unused';
        body.appendChild(
          el('tr', {}, [
            el('td', { class: 'mono' }, c.code),
            el('td', {}, { lifetime: 'Lifetime', year: '1 Year', month: '1 Month' }[c.duration] || c.duration),
            el('td', {}, el('span', { class: `badge ${c.redeemed_guild_id ? 'badge-red' : 'badge-green'}` }, status)),
            el('td', { class: 'muted' }, c.note || '—'),
            el('td', {}, c.redeemed_guild_id ? null : el('button', {
              class: 'btn btn-sm btn-danger',
              onclick: async () => {
                if (!(await confirmDialog(`Delete unused code ${c.code}?`))) return;
                await api(`/api/admin/vip/codes/${c.id}`, { method: 'DELETE' });
                toast('Code deleted.');
                loadCodes();
                loadStats();
              },
            }, 'Delete')),
          ])
        );
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('gen-btn').addEventListener('click', async () => {
    const duration = document.getElementById('gen-duration').value;
    const quantity = Number(document.getElementById('gen-quantity').value) || 1;
    const note = document.getElementById('gen-note').value.trim();
    try {
      const result = await api('/api/admin/vip/codes', { method: 'POST', body: { duration, quantity, note } });
      document.getElementById('gen-output').style.display = 'block';
      document.getElementById('gen-codes').textContent = result.codes.join('\n');
      toast(`Generated ${result.codes.length} code(s).`);
      loadCodes();
      loadStats();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('grant-btn').addEventListener('click', async () => {
    try {
      await api('/api/admin/vip/grant', { method: 'POST', body: { guildId: document.getElementById('grant-server').value, tier: document.getElementById('grant-tier').value } });
      toast('VIP granted.');
      loadVipServers();
      loadStats();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('revoke-btn').addEventListener('click', async () => {
    if (!(await confirmDialog('Revoke VIP from this server?'))) return;
    try {
      await api('/api/admin/vip/revoke', { method: 'POST', body: { guildId: document.getElementById('grant-server').value } });
      toast('VIP revoked.');
      loadVipServers();
      loadStats();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  loadStats();
  loadServers();
  loadVipServers();
  loadCodes();
})();
