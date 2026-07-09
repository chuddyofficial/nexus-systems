(async function () {
  const serverSelect = document.getElementById('target-server');
  const channelSelect = document.getElementById('target-channel');

  try {
    const servers = await api('/api/admin/servers');
    serverSelect.innerHTML = '';
    for (const s of servers) {
      serverSelect.appendChild(el('option', { value: s.id }, s.name));
    }
    if (servers.length) await populateChannelSelect(channelSelect, servers[0].id, null, false);
  } catch (err) {
    toast(err.message, 'error');
  }

  serverSelect.addEventListener('change', async () => {
    if (serverSelect.value) await populateChannelSelect(channelSelect, serverSelect.value, null, false);
  });

  document.getElementById('send-single').addEventListener('click', async () => {
    if (!serverSelect.value || !channelSelect.value) return toast('Pick a server and channel.', 'error');
    try {
      await api('/api/admin/broadcast', {
        method: 'POST',
        body: {
          guildId: serverSelect.value,
          channelId: channelSelect.value,
          content: document.getElementById('single-content').value,
          embedTitle: document.getElementById('single-embed-title').value,
          embedDescription: document.getElementById('single-embed-desc').value,
          embedColor: document.getElementById('single-embed-color').value,
        },
      });
      toast('Sent!');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('send-all').addEventListener('click', async () => {
    const desc = document.getElementById('all-embed-desc').value.trim();
    const content = document.getElementById('all-content').value.trim();
    if (!desc && !content) return toast('Write a message or embed description first.', 'error');
    if (!(await confirmDialog("Send this to every server's mod log channel? This cannot be undone.", { confirmText: 'Broadcast to All' }))) return;
    try {
      const result = await api('/api/admin/broadcast-all', {
        method: 'POST',
        body: {
          content,
          embedTitle: document.getElementById('all-embed-title').value,
          embedDescription: desc,
          embedColor: document.getElementById('all-embed-color').value,
        },
      });
      toast(`Sent to ${result.sent} server(s), skipped ${result.skipped}.`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
})();
