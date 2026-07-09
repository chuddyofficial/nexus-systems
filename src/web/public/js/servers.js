(async function () {
  const grid = document.getElementById('server-grid');
  try {
    const servers = await api('/api/servers');
    if (!servers.length) {
      grid.appendChild(el('div', { class: 'empty-state' }, 'No manageable servers found on your account.'));
      return;
    }
    for (const s of servers.sort((a, b) => (b.botPresent - a.botPresent))) {
      const initials = s.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
      const iconNode = s.icon
        ? el('img', { src: s.icon, alt: '' })
        : el('div', { class: 'icon-fallback' }, initials);

      const meta = el('div', { class: 'server-meta' }, s.botPresent ? `${s.memberCount ?? '?'} members` : 'Bot not in this server');
      const nameBlock = el('div', {}, [el('div', { class: 'server-name' }, s.name), meta]);

      let tile;
      if (s.botPresent) {
        tile = el('a', { class: 'server-tile clickable', href: `/servers/${s.id}` }, [iconNode, nameBlock]);
      } else {
        tile = el('a', { class: 'server-tile clickable', href: window.INVITE_BASE + s.id, target: '_blank', rel: 'noopener' }, [iconNode, nameBlock, el('span', { class: 'badge badge-brand' }, 'Invite')]);
      }
      grid.appendChild(tile);
    }
  } catch (err) {
    toast(err.message, 'error');
  }
})();
