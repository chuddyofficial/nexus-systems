const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { sendModLog } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Lock or unlock every text channel in the server at once')
    .addSubcommand((sc) => sc.setName('on').setDescription('Lock all text channels').addStringOption((o) => o.setName('reason').setDescription('Reason')))
    .addSubcommand((sc) => sc.setName('off').setDescription('Unlock all text channels'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const locking = sub === 'on';
    const reason = locking ? interaction.options.getString('reason') || 'Server lockdown' : 'Lockdown lifted';

    await interaction.deferReply();

    const textChannels = interaction.guild.channels.cache.filter((c) => c.type === ChannelType.GuildText);
    let count = 0;
    for (const channel of textChannels.values()) {
      const ok = await channel.permissionOverwrites
        .edit(interaction.guild.roles.everyone, { SendMessages: locking ? false : null }, { reason })
        .then(() => true)
        .catch(() => false);
      if (ok) count++;
    }

    await sendModLog(interaction.guild, {
      action: locking ? 'Server Lockdown Enabled' : 'Server Lockdown Lifted',
      target: { id: interaction.guild.id, tag: interaction.guild.name },
      moderator: interaction.user,
      reason,
      color: locking ? 0xed4245 : 0x57f287,
    });

    await interaction.editReply(`${locking ? '🔒 Locked' : '🔓 Unlocked'} ${count} text channel(s).`);
  },
};
