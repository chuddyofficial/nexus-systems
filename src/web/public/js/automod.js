(async function () {
  const gid = window.GUILD_ID;
  let bannedWords = [];
  let ignoredChannels = [];
  let regexPatterns = [];
  let linkWhitelist = [];
  let channelMap = {};

  const boolFields = [
    'automod_enabled',
    'automod_anti_invite',
    'automod_anti_spam',
    'automod_anti_mass_mention',
    'automod_caps_filter',
    'automod_anti_link',
    'automod_repeated_chars',
    'automod_emoji_spam',
  ];
  const numberFields = [
    'automod_spam_threshold',
    'automod_spam_interval',
    'automod_max_mentions',
    'automod_caps_percent',
    'automod_caps_min_len',
    'automod_repeated_chars_max',
    'automod_emoji_spam_max',
  ];

  function renderTagList(elementId, items, onRemove) {
    const list = document.getElementById(elementId);
    list.innerHTML = '';
    for (const item of items) {
      list.appendChild(
        el('div', { class: 'tag-chip' }, [document.createTextNode(item), el('button', { onclick: () => onRemove(item) }, '✕')])
      );
    }
  }

  function renderBannedWords() {
    renderTagList('banned-words-list', bannedWords, (w) => {
      bannedWords = bannedWords.filter((x) => x !== w);
      renderBannedWords();
    });
  }

  function renderRegexPatterns() {
    renderTagList('regex-patterns-list', regexPatterns, (p) => {
      regexPatterns = regexPatterns.filter((x) => x !== p);
      renderRegexPatterns();
    });
  }

  function renderLinkWhitelist() {
    renderTagList('link-whitelist-list', linkWhitelist, (d) => {
      linkWhitelist = linkWhitelist.filter((x) => x !== d);
      renderLinkWhitelist();
    });
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
    regexPatterns = [...(config.automod_word_regex_patterns || [])];
    linkWhitelist = [...(config.automod_link_whitelist || [])];
    renderBannedWords();
    renderIgnoredChannels();
    renderRegexPatterns();
    renderLinkWhitelist();

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

    document.getElementById('add-regex-pattern').addEventListener('click', () => {
      const input = document.getElementById('regex-pattern-input');
      const val = input.value.trim();
      if (!val) return;
      try {
        new RegExp(val);
      } catch {
        return toast('That is not a valid regular expression.', 'error');
      }
      if (!regexPatterns.includes(val)) {
        regexPatterns.push(val);
        renderRegexPatterns();
      }
      input.value = '';
    });

    document.getElementById('add-link-whitelist').addEventListener('click', () => {
      const input = document.getElementById('link-whitelist-input');
      const val = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (val && !linkWhitelist.includes(val)) {
        linkWhitelist.push(val);
        renderLinkWhitelist();
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
      patch.automod_word_regex_patterns = regexPatterns;
      patch.automod_link_whitelist = linkWhitelist;
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
