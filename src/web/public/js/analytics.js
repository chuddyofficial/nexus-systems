(async function () {
  const gid = window.GUILD_ID;
  try {
    const data = await api(`/api/servers/${gid}/analytics`);

    document.getElementById('stat-total-actions').textContent = data.totalActions;
    document.getElementById('stat-total-warnings').textContent = data.totalWarnings;
    document.getElementById('stat-active-mods').textContent = data.byModerator.length;

    renderBarChart(document.getElementById('daily-chart'), data.byDay, 'total', 'day');

    const typeBadges = document.getElementById('type-badges');
    if (!data.byType.length) {
      typeBadges.appendChild(el('div', { class: 'empty-state' }, 'No moderation actions yet.'));
    } else {
      for (const t of data.byType) {
        typeBadges.appendChild(el('span', { class: 'badge badge-brand' }, `${t.type}: ${t.count}`));
      }
    }

    const modBody = document.getElementById('mod-body');
    if (!data.byModerator.length) {
      modBody.appendChild(el('tr', {}, el('td', { colspan: '2', class: 'empty-state' }, 'No data yet.')));
    } else {
      for (const m of data.byModerator) {
        modBody.appendChild(el('tr', {}, [el('td', { class: 'mono' }, m.id), el('td', {}, String(m.count))]));
      }
    }
  } catch (err) {
    toast(err.message, 'error');
  }
})();
