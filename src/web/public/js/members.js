(function () {
  const gid = window.GUILD_ID;
  const listEl = document.getElementById('members-list');
  let debounceTimer;

  async function doAction(kind, member) {
    const reason = window.prompt(`Reason for ${kind}ning ${member.tag}:`, '') ?? '';
    if (!(await confirmDialog(`${kind[0].toUpperCase()}${kind.slice(1)} ${member.tag}?`))) return;
    try {
      await api(`/api/servers/${gid}/moderation/${kind}`, { method: 'POST', body: { userId: member.id, reason, minutes: 10 } });
      toast(`${member.tag} ${kind}ed.`);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function load() {
    listEl.innerHTML = '';
    listEl.appendChild(skeletonBlock(5));
    const q = document.getElementById('search-input').value.trim();
    try {
      const members = await api(`/api/servers/${gid}/members${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      listEl.innerHTML = '';
      document.getElementById('members-empty').style.display = members.length ? 'none' : 'block';
      for (const m of members) {
        listEl.appendChild(
          el('div', { class: 'member-row', style: 'border-bottom:1px solid var(--border);' }, [
            el('img', { src: m.avatar, alt: '' }),
            el('div', { style: 'flex:1;' }, [
              el('div', { class: 'name' }, m.tag + (m.bot ? ' 🤖' : '')),
              el('div', { class: 'sub' }, `${m.id} • joined ${m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : 'unknown'}`),
            ]),
            el('div', { style: 'display:flex;gap:6px;' }, [
              el('button', { class: 'btn btn-sm', onclick: () => doAction('warn', m) }, 'Warn'),
              el('button', { class: 'btn btn-sm', onclick: () => doAction('kick', m) }, 'Kick'),
              el('button', { class: 'btn btn-sm btn-danger', onclick: () => doAction('ban', m) }, 'Ban'),
            ]),
          ])
        );
      }
    } catch (err) {
      listEl.innerHTML = '';
      toast(err.message, 'error');
    }
  }

  document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(load, 300);
  });

  load();
})();
