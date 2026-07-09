(function () {
  const gid = window.GUILD_ID;

  document.getElementById('export-btn').addEventListener('click', async () => {
    try {
      const data = await api(`/api/servers/${gid}/backup`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `modbot-backup-${gid}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Backup downloaded.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('restore-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('restore-file');
    const file = fileInput.files[0];
    if (!file) return toast('Choose a backup file first.', 'error');

    if (!(await confirmDialog('This will overwrite current settings for this server. Continue?'))) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await api(`/api/servers/${gid}/restore`, { method: 'POST', body: { config: parsed.config || parsed } });
      toast('Settings restored.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
})();
