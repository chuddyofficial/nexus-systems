(async function () {
  const gid = window.GUILD_ID;
  let bannedWords = [];
  let ignoredChannels = [];
  let channelMap = {};

  const boolFields = [
    'automod_enabled',
    'automod_anti_invite',
    'automod_anti_spam',
    'automod_anti_mass_mention',
    'automod_caps_filter',
  ];
  const numberFields = [
    'automod_spam_threshold',
    'automod_spam_interval',
    'automod_max_mentions',
    'automod_caps_percent',
    'automod_caps_min_len',
  ];

  function renderBannedWords() {
    const list = document.getElementById('banned-words-list');
    list.innerHTML = '';
    for (const w of bannedWords) {
      list.appendChild(
        el('div', { class: 'tag-chip' }, [
          document.createTextNode(w),
          el('button', { onclick: () => { bannedWords = bannedWords.filter((x) => x !== w); renderBannedWords(); } }, '✕'),
        ])
      );
    }
  }

  function renderIgnoredChannels() {
    const list = document.getElementById('ignored-channels-list');
    list.innerHTML = '';
    for (const id of ignoredChannels) {
      list.appendChild(
        el('div', { class: 'tag-chip' }, [
          document.createTextNode('#' + (channelMap[id] || id)),
          el('button', { onclick: () => { ignoredChannels = ignoredChannels.filter((x) => x !== id); renderIgnoredChannels(); } }, '✕'),
        ])
      );
    }
  }

  try {
    const [config, channels] = await Promise.all([api(`/api/servers/${gid}/config`), api(`/api/servers/${gid}/channels`)]);
    channelMap = Object.fromEntries(channels.map((c) => [c.id, c.name]));

    for (const f of boolFields) document.getElementById(f).checked = !!config[f];
    for (const f of numberFields) document.getElementById(f).value = config[f];

    bannedWords = [...(config.automod_banned_words || [])];
    ignoredChannels = [...(config.automod_ignored_channels || [])];
    renderBannedWords();
    renderIgnoredChannels();

    await populateChannelSelect(document.getElementById('ignored-channel-select'), gid, null, false);

    document.getElementById('add-banned-word').addEventListener('click', () => {
      const input = document.getElementById('banned-word-input');
      const val = input.value.trim();
      if (val && !bannedWords.includes(val)) {
        bannedWords.push(val);
        renderBannedWords();
      }
      input.value = '';
    });

    document.getElementById('add-ignored-channel').addEventListener('click', () => {
      const select = document.getElementById('ignored-channel-select');
      if (select.value && !ignoredChannels.includes(select.value)) {
        ignoredChannels.push(select.value);
        renderIgnoredChannels();
      }
    });

    document.getElementById('save-btn').addEventListener('click', async () => {
      const patch = {};
      for (const f of boolFields) patch[f] = document.getElementById(f).checked;
      for (const f of numberFields) patch[f] = Number(document.getElementById(f).value);
      patch.automod_banned_words = bannedWords;
      patch.automod_ignored_channels = ignoredChannels;
      try {
        await api(`/api/servers/${gid}/config`, { method: 'POST', body: patch });
        toast('AutoMod settings saved.');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  } catch (err) {
    toast(err.message, 'error');
  }
})();
