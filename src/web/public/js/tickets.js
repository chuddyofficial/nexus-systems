(async function () {
  const gid = window.GUILD_ID;
  const panelsList = document.getElementById('panels-list');
  let channelNameCache = null;

  async function getChannelName(id) {
    if (!id) return null;
    if (!channelNameCache) channelNameCache = await api(`/api/servers/${gid}/channels`);
    return channelNameCache.find((c) => c.id === id)?.name || id;
  }

  async function loadTickets() {
    const tickets = await api(`/api/servers/${gid}/tickets`);
    const openBody = document.getElementById('open-body');
    const historyBody = document.getElementById('history-body');
    openBody.innerHTML = '';
    historyBody.innerHTML = '';

    const open = tickets.filter((t) => t.status === 'open');
    document.getElementById('open-empty').style.display = open.length ? 'none' : 'block';

    for (const t of open) {
      openBody.appendChild(
        el('tr', {}, [
          el('td', { class: 'mono' }, `#${t.channel_id}`),
          el('td', { class: 'mono' }, t.user_id),
          el('td', {}, t.category || '—'),
          el('td', { class: 'mono' }, t.claimed_by ? `@${t.claimed_by}` : '—'),
          el('td', { class: 'muted' }, new Date(t.created_at.replace(' ', 'T') + 'Z').toLocaleString()),
          el('td', {}, el('button', {
            class: 'btn btn-sm btn-danger',
            onclick: async () => {
              if (!(await confirmDialog('Close and delete this ticket channel?'))) return;
              await api(`/api/servers/${gid}/tickets/${t.id}/close`, { method: 'POST' });
              toast('Ticket closed.');
              loadTickets();
            },
          }, 'Close')),
        ])
      );
    }

    for (const t of tickets.slice(0, 30)) {
      historyBody.appendChild(
        el('tr', {}, [
          el('td', { class: 'mono' }, `#${t.channel_id}`),
          el('td', { class: 'mono' }, t.user_id),
          el('td', {}, t.category || '—'),
          el('td', {}, el('span', { class: `badge ${t.status === 'open' ? 'badge-green' : 'badge-red'}` }, t.status)),
          el('td', { class: 'muted' }, new Date(t.created_at.replace(' ', 'T') + 'Z').toLocaleString()),
        ])
      );
    }
  }

  async function loadPanels() {
    panelsList.innerHTML = '';
    panelsList.appendChild(skeletonBlock(4));
    try {
      const panels = await api(`/api/servers/${gid}/tickets/panels`);
      panelsList.innerHTML = '';
      if (!panels.length) {
        panelsList.appendChild(el('div', { class: 'card' }, el('div', { class: 'empty-state' }, 'No ticket panels yet — create one above.')));
        return;
      }
      for (const panel of panels) {
        panelsList.appendChild(await renderPanelCard(panel));
      }
    } catch (err) {
      panelsList.innerHTML = '';
      toast(err.message, 'error');
    }
  }

  async function renderPanelCard(panel) {
    const card = el('div', { class: 'card' }, [
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;' }, [
        el('h2', { style: 'margin:0;' }, `🎫 ${panel.name}`),
        el('button', { class: 'btn btn-sm btn-danger', onclick: () => deletePanel(panel) }, 'Delete Panel'),
      ]),
    ]);

    if (panel.panel_channel_id) {
      const chName = await getChannelName(panel.panel_channel_id);
      card.appendChild(el('div', { class: 'status-pill', style: 'margin-bottom:14px;' }, [
        el('span', { class: 'dot live' }),
        ` Posted in #${chName}`,
      ]));
    }

    const embedTitle = el('input', { type: 'text', value: panel.embed_title });
    const embedDesc = el('textarea', { rows: 2 }, panel.embed_description);
    const embedColor = el('input', { type: 'color', value: /^#([0-9a-f]{6})$/i.test(panel.embed_color) ? panel.embed_color : '#5865f2', style: 'height:42px;' });
    const buttonLabel = el('input', { type: 'text', value: panel.button_label });
    const buttonEmoji = el('input', { type: 'text', value: panel.button_emoji || '🎫', style: 'max-width:80px;' });
    const categorySelect = el('select', {});
    const roleSelect = el('select', {});
    const transcriptSelect = el('select', {});

    card.appendChild(el('div', { class: 'row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Embed Title'), embedTitle]),
      el('div', { class: 'field' }, [el('label', {}, 'Embed Color'), embedColor]),
    ]));
    card.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Embed Description'), embedDesc]));
    card.appendChild(el('div', { class: 'row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Button Label'), buttonLabel]),
      el('div', { class: 'field' }, [el('label', {}, 'Button Emoji'), buttonEmoji]),
    ]));
    card.appendChild(el('div', { class: 'row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Ticket Category (Discord channel category)'), categorySelect]),
      el('div', { class: 'field' }, [el('label', {}, 'Support Role'), roleSelect]),
      el('div', { class: 'field' }, [el('label', {}, 'Transcript Channel'), transcriptSelect]),
    ]));

    await Promise.all([
      populateCategorySelect(categorySelect, gid, panel.category_channel_id, false),
      populateRoleSelect(roleSelect, gid, panel.support_role_id, false),
      populateChannelSelect(transcriptSelect, gid, panel.transcript_channel_id),
    ]);

    card.appendChild(el('button', {
      class: 'btn btn-sm',
      onclick: async () => {
        try {
          await api(`/api/servers/${gid}/tickets/panels/${panel.id}`, {
            method: 'POST',
            body: {
              embed_title: embedTitle.value.trim() || '🎫 Support Tickets',
              embed_description: embedDesc.value.trim(),
              embed_color: embedColor.value,
              button_label: buttonLabel.value.trim() || 'Open a Ticket',
              button_emoji: buttonEmoji.value.trim() || '🎫',
              category_channel_id: categorySelect.value || null,
              support_role_id: roleSelect.value || null,
              transcript_channel_id: transcriptSelect.value || null,
            },
          });
          toast('Panel saved.');
        } catch (err) {
          toast(err.message, 'error');
        }
      },
    }, 'Save Panel Settings'));

    card.appendChild(el('h3', { style: 'font-size:13px;color:var(--text-muted);margin:20px 0 6px 0;' }, 'Categories (dropdown members pick from — leave empty to skip straight to a ticket)'));
    const optionsWrap = el('div', { class: 'tag-list' });
    for (const opt of panel.options || []) {
      optionsWrap.appendChild(
        el('div', { class: 'tag-chip' }, [
          document.createTextNode(`${opt.emoji ? opt.emoji + ' ' : ''}${opt.label}`),
          el('button', {
            onclick: async () => {
              await api(`/api/servers/${gid}/tickets/panels/${panel.id}/options/${opt.id}`, { method: 'DELETE' });
              loadPanels();
            },
          }, '✕'),
        ])
      );
    }
    card.appendChild(optionsWrap);

    const optLabel = el('input', { type: 'text', placeholder: 'Label (e.g. Billing)' });
    const optEmoji = el('input', { type: 'text', placeholder: 'Emoji', style: 'max-width:80px;' });
    const optDesc = el('input', { type: 'text', placeholder: 'Description (optional)' });
    card.appendChild(el('div', { class: 'row', style: 'margin-top:10px;' }, [
      optLabel,
      optEmoji,
      optDesc,
      el('button', {
        class: 'btn btn-sm',
        style: 'flex:0 0 auto;',
        onclick: async () => {
          const label = optLabel.value.trim();
          if (!label) return toast('Give the category a label.', 'error');
          try {
            await api(`/api/servers/${gid}/tickets/panels/${panel.id}/options`, {
              method: 'POST',
              body: { label, emoji: optEmoji.value.trim() || null, description: optDesc.value.trim() || null },
            });
            toast('Category added.');
            loadPanels();
          } catch (err) {
            toast(err.message, 'error');
          }
        },
      }, 'Add Category'),
    ]));

    card.appendChild(el('h3', { style: 'font-size:13px;color:var(--text-muted);margin:20px 0 6px 0;' }, 'Post This Panel'));
    const postChannelSelect = el('select', {});
    await populateChannelSelect(postChannelSelect, gid, panel.panel_channel_id, false);
    card.appendChild(el('div', { class: 'row' }, [
      el('div', { class: 'field', style: 'flex:1;' }, postChannelSelect),
      el('button', {
        class: 'btn btn-primary',
        style: 'flex:0 0 auto;',
        onclick: async () => {
          try {
            await api(`/api/servers/${gid}/tickets/panels/${panel.id}/post`, { method: 'POST', body: { channelId: postChannelSelect.value } });
            toast('Ticket panel posted!');
            channelNameCache = null;
            loadPanels();
          } catch (err) {
            toast(err.message, 'error');
          }
        },
      }, '🎫 Post Panel'),
    ]));

    return card;
  }

  async function deletePanel(panel) {
    if (!(await confirmDialog(`Delete the "${panel.name}" ticket panel? Open tickets from it will keep working, but the panel button will stop.`))) return;
    await api(`/api/servers/${gid}/tickets/panels/${panel.id}`, { method: 'DELETE' });
    toast('Panel deleted.');
    loadPanels();
  }

  document.getElementById('panel-create').addEventListener('click', async () => {
    const name = document.getElementById('panel-name').value.trim();
    if (!name) return toast('Give the panel a name.', 'error');
    try {
      await api(`/api/servers/${gid}/tickets/panels`, { method: 'POST', body: { name } });
      document.getElementById('panel-name').value = '';
      toast('Panel created.');
      loadPanels();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  const config = await api(`/api/servers/${gid}/config`);
  document.getElementById('auto_close_hours').value = config.ticket_auto_close_hours || 0;
  await populateChannelSelect(document.getElementById('default_transcript_channel'), gid, config.ticket_transcript_channel);

  document.getElementById('save-ticket-settings').addEventListener('click', async () => {
    try {
      await api(`/api/servers/${gid}/config`, {
        method: 'POST',
        body: {
          ticket_transcript_channel: document.getElementById('default_transcript_channel').value || null,
          ticket_auto_close_hours: Number(document.getElementById('auto_close_hours').value) || 0,
        },
      });
      toast('Ticket settings saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  loadPanels();
  loadTickets().catch((err) => toast(err.message, 'error'));
})();
