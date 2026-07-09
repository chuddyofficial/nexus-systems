const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../../database/db');
const config = require('../../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Manage dashboard permission Teams (Admin/Mod/Support-style role groups)')
    .addSubcommand((sc) => sc.setName('list').setDescription('List all teams and their permissions'))
    .addSubcommand((sc) =>
      sc.setName('create').setDescription('Create a new team').addStringOption((o) => o.setName('name').setDescription('Team name').setRequired(true))
    )
    .addSubcommand((sc) => sc.setName('delete').setDescription('Delete a team').addStringOption((o) => o.setName('name').setDescription('Team name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((sc) =>
      sc
        .setName('addmember')
        .setDescription('Add a user or role to a team by ID')
        .addStringOption((o) => o.setName('team').setDescription('Team name').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('discord_id').setDescription('User ID or Role ID').setRequired(true))
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Is this a user ID or a role ID?')
            .setRequired(true)
            .addChoices({ name: 'User', value: 'user' }, { name: 'Role', value: 'role' })
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('removemember')
        .setDescription('Remove a user or role from a team')
        .addStringOption((o) => o.setName('team').setDescription('Team name').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('discord_id').setDescription('User ID or Role ID').setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName('permission')
        .setDescription('Grant or revoke a permission on a team')
        .addStringOption((o) => o.setName('team').setDescription('Team name').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('permission').setDescription('Permission key').setRequired(true).setAutocomplete(true))
        .addStringOption((o) =>
          o
            .setName('action')
            .setDescription('Grant or revoke')
            .setRequired(true)
            .addChoices({ name: 'Grant', value: 'grant' }, { name: 'Revoke', value: 'revoke' })
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'team') {
      const teams = await db.getTeams(interaction.guild.id);
      const filtered = teams.filter((t) => t.name.toLowerCase().includes(focused.value.toLowerCase())).slice(0, 25);
      return interaction.respond(filtered.map((t) => ({ name: t.name, value: t.name })));
    }
    if (focused.name === 'permission') {
      const filtered = db.ALL_TEAM_PERMISSIONS.filter((p) => p.includes(focused.value.toLowerCase())).slice(0, 25);
      return interaction.respond(filtered.map((p) => ({ name: p, value: p })));
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const teams = await db.getTeams(interaction.guild.id);
      if (!teams.length) return interaction.reply({ content: 'No teams yet — create one with `/team create`.', flags: MessageFlags.Ephemeral });
      const embed = new EmbedBuilder()
        .setTitle('Teams')
        .setColor(config.brandColor)
        .setDescription(teams.map((t) => `**${t.name}** — ${t.permissions.length ? t.permissions.join(', ') : '*no permissions set*'}`).join('\n\n'));
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'create') {
      const name = interaction.options.getString('name', true);
      try {
        await db.createTeam(interaction.guild.id, name);
        return interaction.reply({ content: `Team **${name}** created. Use \`/team permission\` to grant it access.` });
      } catch (err) {
        return interaction.reply({ content: err.code === 'ER_DUP_ENTRY' ? 'A team with that name already exists.' : `Failed: ${err.message}`, flags: MessageFlags.Ephemeral });
      }
    }

    const teamName = interaction.options.getString('team', true);
    const teams = await db.getTeams(interaction.guild.id);
    const team = teams.find((t) => t.name === teamName);
    if (!team) return interaction.reply({ content: `No team named "${teamName}".`, flags: MessageFlags.Ephemeral });

    if (sub === 'delete') {
      await db.deleteTeam(interaction.guild.id, team.id);
      return interaction.reply({ content: `Team **${team.name}** deleted.` });
    }

    if (sub === 'addmember') {
      const discordId = interaction.options.getString('discord_id', true);
      const type = interaction.options.getString('type', true);
      if (!/^\d{15,21}$/.test(discordId)) return interaction.reply({ content: 'That ID looks invalid.', flags: MessageFlags.Ephemeral });
      await db.addTeamMember(interaction.guild.id, team.id, discordId, type, interaction.user.id);
      return interaction.reply({ content: `Added ${type} \`${discordId}\` to **${team.name}**.` });
    }

    if (sub === 'removemember') {
      const discordId = interaction.options.getString('discord_id', true);
      await db.removeTeamMember(interaction.guild.id, team.id, discordId);
      return interaction.reply({ content: `Removed \`${discordId}\` from **${team.name}**.` });
    }

    if (sub === 'permission') {
      const permission = interaction.options.getString('permission', true);
      const action = interaction.options.getString('action', true);
      if (!db.ALL_TEAM_PERMISSIONS.includes(permission)) {
        return interaction.reply({ content: `Unknown permission "${permission}".`, flags: MessageFlags.Ephemeral });
      }
      const current = new Set(team.permissions);
      if (action === 'grant') current.add(permission);
      else current.delete(permission);
      await db.updateTeamPermissions(interaction.guild.id, team.id, [...current]);
      return interaction.reply({ content: `${action === 'grant' ? 'Granted' : 'Revoked'} \`${permission}\` ${action === 'grant' ? 'to' : 'from'} **${team.name}**.` });
    }
  },
};
