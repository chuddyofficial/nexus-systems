(async function () {
  async function loadStats() {
    try {
      const stats = await api('/api/admin/stats');
      document.getElementById('stat-guilds').textContent = stats.guildCount;
      document.getElementById('stat-members').textContent = stats.totalMembers.toLocaleString();
      document.getElementById('stat-ping').textContent = `${stats.ping}ms`;

      const servers = await api('/api/admin/servers');
      const body = document.getElementById('top-servers-body');
      body.innerHTML = '';
      for (const s of servers.slice(0, 10)) {
        body.appendChild(
          el('tr', {}, [
            el('td', {}, s.name),
            el('td', {}, String(s.memberCount ?? '—')),
            el('td', {}, el('a', { class: 'btn btn-sm', href: `/servers/${s.id}` }, 'Open')),
          ])
        );
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  loadStats();
  setInterval(loadStats, 30_000);

  document.getElementById('lookup-btn').addEventListener('click', async () => {
    const userId = document.getElementById('lookup-input').value.trim();
    if (!/^\d{15,21}$/.test(userId)) return toast('Enter a valid Discord user ID.', 'error');
    try {
      const result = await api(`/api/admin/lookup/${userId}`);
      document.getElementById('lookup-results').style.display = 'block';

      const warningsBody = document.getElementById('lookup-warnings');
      warningsBody.innerHTML = '';
      for (const w of result.warnings) {
        warningsBody.appendChild(el('tr', {}, [el('td', {}, w.guildName), el('td', {}, w.reason || '—'), el('td', { class: 'muted' }, new Date(w.created_at.replace(' ', 'T') + 'Z').toLocaleDateString())]));
      }
      if (!result.warnings.length) warningsBody.appendChild(el('tr', {}, el('td', { colspan: '3', class: 'muted' }, 'None')));

      const notesBody = document.getElementById('lookup-notes');
      notesBody.innerHTML = '';
      for (const n of result.notes) {
        notesBody.appendChild(el('tr', {}, [el('td', {}, n.guildName), el('td', {}, n.note || '—'), el('td', { class: 'muted' }, new Date(n.created_at.replace(' ', 'T') + 'Z').toLocaleDateString())]));
      }
      if (!result.notes.length) notesBody.appendChild(el('tr', {}, el('td', { colspan: '3', class: 'muted' }, 'None')));

      const actionsBody = document.getElementById('lookup-actions');
      actionsBody.innerHTML = '';
      for (const a of result.modActions) {
        actionsBody.appendChild(el('tr', {}, [el('td', {}, a.guildName), el('td', {}, a.action_type), el('td', { class: 'muted' }, new Date(a.created_at.replace(' ', 'T') + 'Z').toLocaleDateString())]));
      }
      if (!result.modActions.length) actionsBody.appendChild(el('tr', {}, el('td', { colspan: '3', class: 'muted' }, 'None')));
    } catch (err) {
      toast(err.message, 'error');
    }
  });
})();
