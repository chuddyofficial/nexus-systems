(async function () {
  const gid = window.GUILD_ID;

  async function doAction(kind) {
    const userId = document.getElementById('mod-userid').value.trim();
    const reason = document.getElementById('mod-reason').value.trim();
    if (!/^\d{15,25}$/.test(userId)) return toast('Enter a valid user ID.', 'error');

    const body = { userId, reason };
    if (kind === 'timeout') body.minutes = document.getElementById('mod-minutes').value;

    if (!confirm(`Are you sure you want to ${kind} this user?`)) return;

    try {
      await api(`/api/servers/${gid}/moderation/${kind}`, { method: 'POST', body });
      toast(`${kind[0].toUpperCase()}${kind.slice(1)} applied.`);
      document.getElementById('mod-userid').value = '';
      document.getElementById('mod-reason').value = '';
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('act-warn').addEventListener('click', () => doAction('warn'));
  document.getElementById('act-kick').addEventListener('click', () => doAction('kick'));
  document.getElementById('act-ban').addEventListener('click', () => doAction('ban'));
  document.getElementById('act-timeout').addEventListener('click', () => doAction('timeout'));
})();
