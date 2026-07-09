(async function () {
  const gid = window.GUILD_ID;

  async function loadNotes() {
    const notes = await api(`/api/servers/${gid}/notes`);
    const body = document.getElementById('notes-body');
    body.innerHTML = '';
    document.getElementById('notes-empty').style.display = notes.length ? 'none' : 'block';
    for (const n of notes) {
      body.appendChild(
        el('tr', {}, [
          el('td', { class: 'mono' }, n.user_id),
          el('td', {}, n.note),
          el('td', { class: 'mono' }, n.moderator_id),
          el('td', { class: 'muted' }, new Date(n.created_at.replace(' ', 'T') + 'Z').toLocaleString()),
          el('td', {}, el('button', {
            class: 'btn btn-sm btn-danger',
            onclick: async () => {
              if (!(await confirmDialog('Delete this note?'))) return;
              await api(`/api/servers/${gid}/notes/${n.id}`, { method: 'DELETE' });
              loadNotes();
            },
          }, 'Delete')),
        ])
      );
    }
  }

  document.getElementById('note-add').addEventListener('click', async () => {
    const userId = document.getElementById('note-userid').value.trim();
    const note = document.getElementById('note-content').value.trim();
    if (!/^\d{15,25}$/.test(userId) || !note) return toast('Enter a valid user ID and note.', 'error');
    try {
      await api(`/api/servers/${gid}/notes`, { method: 'POST', body: { userId, note } });
      toast('Note added.');
      document.getElementById('note-userid').value = '';
      document.getElementById('note-content').value = '';
      loadNotes();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  loadNotes().catch((err) => toast(err.message, 'error'));
})();
