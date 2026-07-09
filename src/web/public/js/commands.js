(async function () {
  const gid = window.GUILD_ID;
  const container = document.getElementById('command-groups');

  async function load() {
    container.innerHTML = '';
    container.appendChild(skeletonBlock(6));
    try {
      const commands = await api(`/api/servers/${gid}/commands`);
      container.innerHTML = '';

      const byCategory = {};
      for (const c of commands) {
        byCategory[c.category] = byCategory[c.category] || [];
        byCategory[c.category].push(c);
      }

      for (const [category, cmds] of Object.entries(byCategory)) {
        const card = el('div', { class: 'card' }, [
          el('h2', { style: 'text-transform:capitalize;' }, category),
        ]);
        for (const c of cmds) {
          const row = el('div', { class: 'toggle-row' }, [
            el('div', {}, [
              el('div', { class: 'toggle-label' }, `/${c.name}`),
              el('div', { class: 'toggle-desc' }, c.description),
            ]),
          ]);
          const label = el('label', { class: 'switch' }, [
            el('input', {
              type: 'checkbox',
              ...(c.enabled ? { checked: 'checked' } : {}),
              onchange: async (e) => {
                try {
                  await api(`/api/servers/${gid}/commands/${c.name}/toggle`, { method: 'POST', body: { enabled: e.target.checked } });
                  toast(`/${c.name} ${e.target.checked ? 'enabled' : 'disabled'}.`);
                } catch (err) {
                  toast(err.message, 'error');
                  e.target.checked = !e.target.checked;
                }
              },
            }),
            el('span', { class: 'slider' }),
          ]);
          row.appendChild(label);
          card.appendChild(row);
        }
        container.appendChild(card);
      }
    } catch (err) {
      container.innerHTML = '';
      toast(err.message, 'error');
    }
  }

  load();
})();
