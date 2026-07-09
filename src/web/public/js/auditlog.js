(async function () {
  const gid = window.GUILD_ID;
  const ACTION_NAMES = {
    1: 'Guild Updated', 10: 'Channel Created', 11: 'Channel Updated', 12: 'Channel Deleted',
    13: 'Channel Overwrite Created', 14: 'Channel Overwrite Updated', 15: 'Channel Overwrite Deleted',
    20: 'Member Kicked', 21: 'Member Pruned', 22: 'Member Banned', 23: 'Member Unbanned',
    24: 'Member Updated', 25: 'Member Roles Updated', 26: 'Member Moved', 27: 'Member Disconnected',
    30: 'Role Created', 31: 'Role Updated', 32: 'Role Deleted',
    40: 'Invite Created', 41: 'Invite Updated', 42: 'Invite Deleted',
    50: 'Webhook Created', 51: 'Webhook Updated', 52: 'Webhook Deleted',
    60: 'Emoji Created', 61: 'Emoji Updated', 62: 'Emoji Deleted',
    72: 'Message Deleted', 73: 'Messages Bulk Deleted', 74: 'Message Pinned', 75: 'Message Unpinned',
    80: 'Integration Created', 81: 'Integration Updated', 82: 'Integration Deleted',
    83: 'Stage Instance Created', 90: 'Sticker Created',
    100: 'Event Created', 101: 'Event Updated', 102: 'Event Cancelled',
    110: 'Thread Created', 111: 'Thread Updated', 112: 'Thread Deleted',
    121: 'AutoMod Rule Updated', 143: 'AutoMod Message Blocked',
  };

  try {
    const entries = await api(`/api/servers/${gid}/auditlog`);
    const body = document.getElementById('al-body');
    if (!entries.length) {
      document.getElementById('al-empty').style.display = 'block';
      return;
    }
    for (const e of entries) {
      body.appendChild(
        el('tr', {}, [
          el('td', {}, ACTION_NAMES[e.action] || `Action #${e.action}`),
          el('td', { class: 'mono' }, e.executor ? e.executor.tag : '—'),
          el('td', { class: 'mono' }, e.target ? e.target.id : '—'),
          el('td', {}, e.reason || ''),
          el('td', { class: 'muted' }, new Date(e.createdAt).toLocaleString()),
        ])
      );
    }
  } catch (err) {
    toast(err.message, 'error');
  }
})();
