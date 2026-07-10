(async function () {
  function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  }
  function formatBytes(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  async function load() {
    try {
      const stats = await api('/api/admin/stats');
      document.getElementById('stat-uptime').textContent = formatUptime(stats.uptimeMs);
      document.getElementById('stat-memory').textContent = formatBytes(stats.memory.rss);
      document.getElementById('stat-node').textContent = stats.nodeVersion;
      document.getElementById('version-info').textContent = `Nexus Systems v${stats.botVersion} — Node ${stats.nodeVersion} — PID ${stats.pid}`;

      const maintenance = await api('/api/admin/maintenance');
      document.getElementById('maintenance-enabled').checked = maintenance.enabled;
      document.getElementById('maintenance-message').value = maintenance.message;
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  document.getElementById('save-maintenance').addEventListener('click', async () => {
    try {
      await api('/api/admin/maintenance', {
        method: 'POST',
        body: {
          enabled: document.getElementById('maintenance-enabled').checked,
          message: document.getElementById('maintenance-message').value,
        },
      });
      toast('Maintenance settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('redeploy-btn').addEventListener('click', async () => {
    const btn = document.getElementById('redeploy-btn');
    const output = document.getElementById('redeploy-output');
    btn.disabled = true;
    btn.textContent = 'Deploying...';
    try {
      const result = await api('/api/admin/redeploy-commands', { method: 'POST' });
      output.style.display = 'block';
      output.textContent = result.output || 'Done.';
      toast('Slash commands re-deployed.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔁 Re-deploy Commands';
    }
  });

  document.getElementById('restart-btn').addEventListener('click', async () => {
    if (!(await confirmDialog('Restart the entire bot process? It will be back in a few seconds.', { confirmText: 'Restart' }))) return;
    try {
      await api('/api/admin/restart', { method: 'POST' });
      toast('Restarting... this page will stop responding for a few seconds.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  load();
  setInterval(load, 30_000);
})();
