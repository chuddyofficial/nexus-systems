(function () {
  const gid = window.GUILD_ID;
  const box = document.getElementById('console-box');
  const dot = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');

  function setStatus(state, message) {
    dot.classList.toggle('live', state === 'live');
    text.textContent = message;
  }

  function addSystemLine(message) {
    box.appendChild(
      el('div', { class: 'console-line system' }, [
        el('span', { class: 'ts' }, new Date().toLocaleTimeString()),
        el('span', { class: 'tag' }, '[SYSTEM]'),
        el('span', {}, message),
      ])
    );
    box.scrollTop = box.scrollHeight;
  }

  if (typeof io === 'undefined') {
    setStatus('error', 'Failed to load the realtime client — check your connection and refresh.');
    return;
  }

  const socket = io({ reconnectionAttempts: 20 });

  setStatus('connecting', 'Connecting...');

  socket.on('connect', () => {
    socket.emit('subscribe', gid);
    setStatus('live', 'Live');
  });

  socket.on('disconnect', (reason) => {
    setStatus('error', `Disconnected (${reason}) — reconnecting...`);
  });

  socket.on('connect_error', (err) => {
    setStatus('error', `Connection failed: ${err.message}`);
  });

  socket.on('reconnect_attempt', () => {
    setStatus('connecting', 'Reconnecting...');
  });

  socket.on('reconnect_failed', () => {
    setStatus('error', 'Could not reconnect. Refresh the page to try again.');
  });

  socket.on('auth_error', (message) => {
    setStatus('error', message);
    addSystemLine(message);
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
