(async function () {
  const gid = window.GUILD_ID;

  async function load() {
    const body = document.getElementById('cc-body');
    body.innerHTML = '';
    const cmds = await api(`/api/servers/${gid}/customcommands`);
    document.getElementById('cc-empty').style.display = cmds.length ? 'none' : 'block';
    for (const c of cmds) {
      body.appendChild(
        el('tr', {}, [
          el('td', { class: 'mono' }, `!${c.trigger}`),
          el('td', {}, c.response || ''),
          el('td', { class: 'muted' }, c.cooldown_seconds ? `${c.cooldown_seconds}s` : '—'),
          el('td', {}, el('button', {
            class: 'btn btn-sm btn-danger',
            onclick: async () => { await api(`/api/servers/${gid}/customcommands/${c.id}`, { method: 'DELETE' }); load(); },
          }, 'Delete')),
        ])
      );
    }
  }

  document.getElementById('cc-add').addEventListener('click', async () => {
    const trigger = document.getElementById('cc-trigger').value.trim();
    const response = document.getElementById('cc-response').value.trim();
    const cooldownSeconds = Number(document.getElementById('cc-cooldown').value) || 0;
    if (!trigger || !response) return toast('Trigger and response are required.', 'error');
    try {
      await api(`/api/servers/${gid}/customcommands`, { method: 'POST', body: { trigger, response, cooldownSeconds } });
      document.getElementById('cc-trigger').value = '';
      document.getElementById('cc-response').value = '';
      document.getElementById('cc-cooldown').value = '0';
      toast('Command added.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  load().catch((err) => toast(err.message, 'error'));
})();
