(async function () {
  const gid = window.GUILD_ID;
  const badgeClass = { pending: 'badge-yellow', approved: 'badge-green', denied: 'badge-red' };

  async function loadSuggestions() {
    const rows = await api(`/api/servers/${gid}/suggestions`);
    const list = document.getElementById('sg-list');
    list.innerHTML = '';
    document.getElementById('sg-empty').style.display = rows.length ? 'none' : 'block';

    for (const s of rows) {
      const card = el('div', { class: 'card', style: 'margin-bottom:12px;' }, [
        el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:12px;' }, [
          el('div', {}, [
            el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:6px;' }, `by ${s.user_id} • ${new Date(s.created_at.replace(' ', 'T') + 'Z').toLocaleString()}`),
            el('div', {}, s.content),
          ]),
          el('span', { class: `badge ${badgeClass[s.status] || 'badge-brand'}` }, s.status),
        ]),
        el('div', { style: 'display:flex;gap:8px;margin-top:14px;' }, [
          el('button', { class: 'btn btn-sm', onclick: () => setStatus(s.id, 'approved') }, '✅ Approve'),
          el('button', { class: 'btn btn-sm btn-danger', onclick: () => setStatus(s.id, 'denied') }, '❌ Deny'),
          el('button', { class: 'btn btn-sm', onclick: () => setStatus(s.id, 'pending') }, '↩️ Reset'),
        ]),
      ]);
      list.appendChild(card);
    }
  }

  async function setStatus(id, status) {
    try {
      await api(`/api/servers/${gid}/suggestions/${id}/status`, { method: 'POST', body: { status } });
      toast(`Suggestion marked ${status}.`);
      loadSuggestions();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const config = await api(`/api/servers/${gid}/config`);
  await populateChannelSelect(document.getElementById('suggestions_channel'), gid, config.suggestions_channel);
  document.getElementById('save-channel').addEventListener('click', async () => {
    try {
      await api(`/api/servers/${gid}/config`, { method: 'POST', body: { suggestions_channel: document.getElementById('suggestions_channel').value || null } });
      toast('Suggestions channel saved.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  loadSuggestions().catch((err) => toast(err.message, 'error'));
})();
