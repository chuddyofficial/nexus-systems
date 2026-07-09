(function () {
  const gid = window.GUILD_ID;
  const box = document.getElementById('console-box');
  const dot = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');

  const socket = io();

  socket.on('connect', () => {
    socket.emit('subscribe', gid);
    dot.classList.add('live');
    text.textContent = 'Live';
  });

  socket.on('disconnect', () => {
    dot.classList.remove('live');
    text.textContent = 'Disconnected';
  });

  socket.on('console', (payload) => {
    const time = new Date(payload.at).toLocaleTimeString();
    const line = el('div', { class: `console-line ${payload.level}` }, [
      el('span', { class: 'ts' }, time),
      el('span', { class: 'tag' }, `[${payload.level.toUpperCase()}]`),
      el('span', {}, payload.message),
    ]);
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
    while (box.children.length > 500) box.removeChild(box.firstChild);
  });
})();
