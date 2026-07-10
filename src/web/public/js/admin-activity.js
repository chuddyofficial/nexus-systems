(async function () {
  const ACTION_LABELS = {
    leave_server: '🚪 Left Server',
    broadcast: '📢 Broadcast',
    broadcast_all: '📢 Broadcast to All',
    redeploy_commands: '🔁 Re-deployed Commands',
    restart: '♻️ Restarted Bot',
    generate_vip_codes: '💎 Generated VIP Codes',
    grant_vip: '💎 Granted VIP',
    revoke_vip: '💎 Revoked VIP',
    maintenance_mode: '🔧 Maintenance Mode',
  };

  let entries = [];

  try {
    entries = await api('/api/admin/activity');
    const body = document.getElementById('activity-body');
    const emptyState = document.getElementById('activity-empty');
    body.innerHTML = '';
    emptyState.style.display = entries.length ? 'none' : 'block';
    for (const entry of entries) {
      body.appendChild(
        el('tr', {}, [
          el('td', { class: 'muted' }, new Date(entry.created_at.replace(' ', 'T') + 'Z').toLocaleString()),
          el('td', {}, ACTION_LABELS[entry.action] || entry.action),
          el('td', { class: 'muted' }, entry.detail || '—'),
        ])
      );
    }
  } catch (err) {
    toast(err.message, 'error');
  }

  document.getElementById('export-csv-btn').addEventListener('click', () => {
    if (!entries.length) return toast('Nothing to export.', 'error');
    downloadCsv('admin-activity.csv', entries, [
      { key: 'created_at', label: 'When' },
      { key: 'actor_id', label: 'Actor' },
      { key: 'action', label: 'Action' },
      { key: 'detail', label: 'Detail' },
    ]);
  });
})();
