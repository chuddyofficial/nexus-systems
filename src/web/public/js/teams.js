(async function () {
  const gid = window.GUILD_ID;
  const listEl = document.getElementById('teams-list');

  const PERMISSION_LABELS = {
    manage_config: 'General Settings (logs, welcome, leveling, starboard, verify, anti-raid)',
    manage_automod: 'AutoMod',
    manage_antiraid: 'Anti-Raid',
    manage_moderation: 'Moderation Actions (ban / kick / warn / timeout / notes)',
    manage_tickets: 'Tickets',
    manage_embeds: 'Custom Embeds',
    manage_giveaways: 'Giveaways',
    manage_suggestions: 'Suggestions',
    manage_reactionroles: 'Reaction Roles',
    manage_customcommands: 'Custom Commands',
    manage_commands: 'Command Toggles',
    view_dashboard: 'View Dashboard (basic access)',
  };

  let allPermissions = [];

  async function load() {
    listEl.innerHTML = '';
    listEl.appendChild(skeletonBlock(4));
    try {
      const data = await api(`/api/servers/${gid}/teams`);
      allPermissions = data.allPermissions;
      listEl.innerHTML = '';

      if (!data.teams.length) {
        listEl.appendChild(el('div', { class: 'card' }, el('div', { class: 'empty-state' }, 'No teams yet — create one above.')));
        return;
      }

      for (const team of data.teams) {
        listEl.appendChild(renderTeamCard(team));
      }
    } catch (err) {
      listEl.innerHTML = '';
      toast(err.message, 'error');
    }
  }

  function renderTeamCard(team) {
    const card = el('div', { class: 'card' }, [
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;' }, [
        el('div', { style: 'display:flex;align-items:center;gap:10px;' }, [
          el('span', { style: `width:14px;height:14px;border-radius:50%;background:${team.color};display:inline-block;` }),
          el('h2', { style: 'margin:0;' }, team.name),
        ]),
        el('button', { class: 'btn btn-sm btn-danger', onclick: () => deleteTeam(team) }, 'Delete Team'),
      ]),
    ]);

    const permsWrap = el('div', { class: 'tag-list', style: 'flex-direction:column;align-items:stretch;gap:0;' });
    const checkboxes = {};
    for (const perm of allPermissions) {
      const cb = el('input', { type: 'checkbox', style: 'width:auto;', ...(team.permissions.includes(perm) ? { checked: 'checked' } : {}) });
      checkboxes[perm] = cb;
      permsWrap.appendChild(
        el('label', { class: 'toggle-row', style: 'cursor:pointer;' }, [
          el('span', { class: 'toggle-label', style: 'font-weight:400;font-size:14px;' }, PERMISSION_LABELS[perm] || perm),
          cb,
        ])
      );
    }
    card.appendChild(el('h3', { style: 'font-size:13px;color:var(--text-muted);margin:14px 0 6px 0;' }, 'Permissions'));
    card.appendChild(permsWrap);
    card.appendChild(
      el('button', {
        class: 'btn btn-sm',
        style: 'margin-top:10px;',
        onclick: async () => {
          const permissions = allPermissions.filter((p) => checkboxes[p].checked);
          try {
            await api(`/api/servers/${gid}/teams/${team.id}/permissions`, { method: 'POST', body: { permissions } });
            toast('Permissions saved.');
          } catch (err) {
            toast(err.message, 'error');
          }
        },
      }, 'Save Permissions')
    );

    card.appendChild(el('h3', { style: 'font-size:13px;color:var(--text-muted);margin:20px 0 6px 0;' }, 'Members'));
    const membersWrap = el('div', { class: 'tag-list' });
    for (const m of team.members || []) {
      membersWrap.appendChild(
        el('div', { class: 'tag-chip' }, [
          document.createTextNode(`${m.member_type === 'role' ? '@&' : '@'}${m.discord_id}`),
          el('button', {
            onclick: async () => {
              await api(`/api/servers/${gid}/teams/${team.id}/members/${m.discord_id}`, { method: 'DELETE' });
              load();
            },
          }, '✕'),
        ])
      );
    }
    card.appendChild(membersWrap);

    const addRow = el('div', { class: 'row', style: 'margin-top:10px;' }, [
      el('input', { type: 'text', id: `add-member-${team.id}`, placeholder: 'Discord user or role ID' }),
      el('select', { id: `add-member-type-${team.id}`, style: 'flex:0 0 110px;' }, [
        el('option', { value: 'user' }, 'User'),
        el('option', { value: 'role' }, 'Role'),
      ]),
      el('button', {
        class: 'btn btn-sm',
        style: 'flex:0 0 auto;',
        onclick: async () => {
          const input = document.getElementById(`add-member-${team.id}`);
          const typeSelect = document.getElementById(`add-member-type-${team.id}`);
          const discordId = input.value.trim();
          if (!/^\d{15,21}$/.test(discordId)) return toast('Enter a valid Discord ID.', 'error');
          try {
            await api(`/api/servers/${gid}/teams/${team.id}/members`, { method: 'POST', body: { discordId, memberType: typeSelect.value } });
            toast('Member added.');
            load();
          } catch (err) {
            toast(err.message, 'error');
          }
        },
      }, 'Add'),
    ]);
    card.appendChild(addRow);

    return card;
  }

  async function deleteTeam(team) {
    if (!(await confirmDialog(`Delete team "${team.name}"? Members will lose any access it granted.`))) return;
    await api(`/api/servers/${gid}/teams/${team.id}`, { method: 'DELETE' });
    toast('Team deleted.');
    load();
  }

  document.getElementById('team-create').addEventListener('click', async () => {
    const name = document.getElementById('team-name').value.trim();
    const color = document.getElementById('team-color').value;
    if (!name) return toast('Give the team a name.', 'error');
    try {
      await api(`/api/servers/${gid}/teams`, { method: 'POST', body: { name, color } });
      document.getElementById('team-name').value = '';
      toast('Team created.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  load();
})();
