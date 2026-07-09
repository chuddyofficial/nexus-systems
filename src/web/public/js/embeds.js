(async function () {
  const gid = window.GUILD_ID;
  let fields = [];

  function collectEmbedData() {
    return {
      title: document.getElementById('f-title').value || undefined,
      description: document.getElementById('f-description').value || undefined,
      color: document.getElementById('f-color').value,
      url: document.getElementById('f-url').value || undefined,
      author: {
        name: document.getElementById('f-author-name').value || undefined,
        iconUrl: document.getElementById('f-author-icon').value || undefined,
      },
      thumbnail: document.getElementById('f-thumbnail').value || undefined,
      image: document.getElementById('f-image').value || undefined,
      footer: {
        text: document.getElementById('f-footer-text').value || undefined,
        iconUrl: document.getElementById('f-footer-icon').value || undefined,
      },
      timestamp: document.getElementById('f-timestamp').checked || undefined,
      fields: fields.filter((f) => f.name && f.value),
      content: document.getElementById('f-content').value || undefined,
    };
  }

  function renderFields() {
    const list = document.getElementById('fields-list');
    list.innerHTML = '';
    fields.forEach((f, i) => {
      const row = el('div', { class: 'card', style: 'padding:14px;margin-bottom:10px;background:var(--bg-elevated);' }, [
        el('div', { class: 'row' }, [
          el('input', { type: 'text', placeholder: 'Field name', value: f.name, oninput: (e) => { f.name = e.target.value; renderPreview(); } }),
          el('input', { type: 'text', placeholder: 'Field value', value: f.value, oninput: (e) => { f.value = e.target.value; renderPreview(); } }),
        ]),
        el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-top:8px;' }, [
          el('label', { style: 'display:flex;align-items:center;gap:8px;margin:0;font-weight:400;font-size:13px;' }, [
            el('input', { type: 'checkbox', style: 'width:auto;', ...(f.inline ? { checked: 'checked' } : {}), onchange: (e) => { f.inline = e.target.checked; renderPreview(); } }),
            'Inline',
          ]),
          el('button', { class: 'btn btn-sm btn-danger', onclick: () => { fields.splice(i, 1); renderFields(); renderPreview(); } }, 'Remove'),
        ]),
      ]);
      list.appendChild(row);
    });
  }

  function renderPreview() {
    const data = collectEmbedData();
    document.getElementById('preview-content').textContent = data.content || '';
    document.getElementById('preview-embed').style.borderLeftColor = data.color || '#5865f2';

    const authorEl = document.getElementById('preview-author');
    if (data.author?.name) {
      authorEl.style.display = 'flex';
      authorEl.innerHTML = (data.author.iconUrl ? `<img src="${escapeHtml(data.author.iconUrl)}" onerror="this.style.display='none'"/>` : '') + escapeHtml(data.author.name);
    } else authorEl.style.display = 'none';

    const titleEl = document.getElementById('preview-title');
    if (data.title) { titleEl.style.display = 'block'; titleEl.textContent = data.title; } else titleEl.style.display = 'none';

    document.getElementById('preview-desc').textContent = data.description || '';

    const fieldsEl = document.getElementById('preview-fields');
    fieldsEl.innerHTML = '';
    for (const f of data.fields) {
      fieldsEl.appendChild(el('div', { class: 'preview-field', style: f.inline ? '' : 'grid-column:1/-1;' }, [
        el('div', { class: 'fname' }, f.name),
        el('div', {}, f.value),
      ]));
    }

    const imageEl = document.getElementById('preview-image');
    if (data.image) { imageEl.style.display = 'block'; imageEl.src = data.image; } else imageEl.style.display = 'none';

    const thumbEl = document.getElementById('preview-thumb');
    if (data.thumbnail) { thumbEl.style.display = 'block'; thumbEl.src = data.thumbnail; } else thumbEl.style.display = 'none';

    const footerEl = document.getElementById('preview-footer');
    if (data.footer?.text || data.timestamp) {
      footerEl.style.display = 'flex';
      const parts = [];
      if (data.footer?.iconUrl) parts.push(`<img src="${escapeHtml(data.footer.iconUrl)}" onerror="this.style.display='none'"/>`);
      const textParts = [data.footer?.text, data.timestamp ? new Date().toLocaleString() : null].filter(Boolean);
      footerEl.innerHTML = parts.join('') + escapeHtml(textParts.join(' • '));
    } else footerEl.style.display = 'none';
  }

  document.querySelectorAll('#f-content, #f-title, #f-description, #f-color, #f-url, #f-author-name, #f-author-icon, #f-thumbnail, #f-image, #f-footer-text, #f-footer-icon, #f-timestamp').forEach((elm) => {
    elm.addEventListener('input', renderPreview);
    elm.addEventListener('change', renderPreview);
  });

  document.getElementById('add-field').addEventListener('click', () => {
    fields.push({ name: '', value: '', inline: false });
    renderFields();
    renderPreview();
  });

  async function loadSavedEmbeds() {
    const list = document.getElementById('saved-list');
    list.innerHTML = '';
    const saved = await api(`/api/servers/${gid}/embeds`);
    if (!saved.length) {
      list.appendChild(el('div', { class: 'empty-state' }, 'No saved embeds yet.'));
      return;
    }
    for (const s of saved) {
      list.appendChild(
        el('div', { class: 'saved-embed-item' }, [
          el('span', {}, s.name),
          el('div', { style: 'display:flex;gap:8px;' }, [
            el('button', { class: 'btn btn-sm', onclick: () => loadIntoBuilder(s) }, 'Load'),
            el('button', {
              class: 'btn btn-sm',
              onclick: async () => {
                try {
                  await api(`/api/servers/${gid}/embeds/send`, { method: 'POST', body: { channelId: document.getElementById('f-channel').value, embed: JSON.parse(s.embed_json) } });
                  toast(`Sent "${s.name}".`);
                } catch (err) { toast(err.message, 'error'); }
              },
            }, 'Send'),
            el('button', {
              class: 'btn btn-sm btn-danger',
              onclick: async () => {
                await api(`/api/servers/${gid}/embeds/${s.id}`, { method: 'DELETE' });
                loadSavedEmbeds();
              },
            }, 'Delete'),
          ]),
        ])
      );
    }
  }

  function loadIntoBuilder(saved) {
    const data = JSON.parse(saved.embed_json);
    document.getElementById('f-content').value = data.content || '';
    document.getElementById('f-title').value = data.title || '';
    document.getElementById('f-description').value = data.description || '';
    document.getElementById('f-color').value = data.color || '#5865f2';
    document.getElementById('f-url').value = data.url || '';
    document.getElementById('f-author-name').value = data.author?.name || '';
    document.getElementById('f-author-icon').value = data.author?.iconUrl || '';
    document.getElementById('f-thumbnail').value = data.thumbnail || '';
    document.getElementById('f-image').value = data.image || '';
    document.getElementById('f-footer-text').value = data.footer?.text || '';
    document.getElementById('f-footer-icon').value = data.footer?.iconUrl || '';
    document.getElementById('f-timestamp').checked = !!data.timestamp;
    document.getElementById('f-save-name').value = saved.name;
    fields = data.fields ? data.fields.map((f) => ({ ...f })) : [];
    renderFields();
    renderPreview();
  }

  document.getElementById('btn-send').addEventListener('click', async () => {
    const channelId = document.getElementById('f-channel').value;
    if (!channelId) return toast('Pick a channel first.', 'error');
    try {
      await api(`/api/servers/${gid}/embeds/send`, { method: 'POST', body: { channelId, embed: collectEmbedData() } });
      toast('Embed sent!');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('btn-save').addEventListener('click', async () => {
    const name = document.getElementById('f-save-name').value.trim();
    if (!name) return toast('Give the embed a name to save it.', 'error');
    try {
      await api(`/api/servers/${gid}/embeds`, { method: 'POST', body: { name, embed: collectEmbedData() } });
      toast('Embed saved.');
      loadSavedEmbeds();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  await populateChannelSelect(document.getElementById('f-channel'), gid, null, false);
  renderPreview();
  loadSavedEmbeds();
})();
