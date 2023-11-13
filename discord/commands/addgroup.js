const config = require('../config.json');
const Discord = require('discord.js');
const { ChannelType, PermissionsBitField } = require('discord.js');


exports.help = {
  name: 'addgroup',
  description: 'Creates a private group channel with the members specified as arguments.',
  usage: `‣ \`${config.prefix}addgroup help\` : Display the instructions.
‣ \`${config.prefix}addgroup @login1 login2 [@login3 etc]\` : Creates a private channel with you and the members specified as arguments (logins and/or mentions).`,
};

const welcome_pm_message = `Welcome to your own **private channel**! 👋

If you wish, you can already update its name in the **settings**.
If you want to **add** other members manually, run the following command:
\`\`\`
/addmember login1 login2
\`\`\`
Replace the logins with the members you want to add - Discord won't automatically suggest them to you as they are not in the channel, make sure you write their login properly.
`;

async function collectArgsData(client, argsWithoutMentions, message) {
  const usersData = { users: [message.author], logins_list: [] };
  const author_member = message.author;
  const author_login = author_member.nickname ? author_member.nickname.split(' ')[0] : message.author.username.split(' ')[0];
  usersData.logins_list.push(author_login);
  await Promise.all(argsWithoutMentions.map(async (element) => {
    await client.helpers.shared.addToPrivateGroupData(client, usersData, message.author, element);
  }));
  if (message.mentions && message.mentions.members) {
    await Promise.all(message.mentions.members.map(async (element) => {
      await client.helpers.shared.addToPrivateGroupData(client, usersData, message.author, element);
    }));
  }
  return usersData;
}

function createGroupChannel(client, message, parent_category, users_data) {
  users_data.logins_list = users_data.logins_list.filter((x, i) => i === users_data.logins_list.indexOf(x));
  users_data.logins_list.sort();

  let channel_name = users_data.logins_list.join('_');
  channel_name = (channel_name.length > 100) ? channel_name.substr(0, 97) + '...' : channel_name;

  const permissionOverwrites = [];

  // We deny every role to view this channel.
  client.config.guild.roles.cache.forEach(role => {
    permissionOverwrites.push({
      id: role.id,
      type: 'role',
      deny: [PermissionsBitField.Flags.ViewChannel],
    });
  });

  // We allow author and every mentioned users to view this channel.
  users_data.users.forEach(user => {
    permissionOverwrites.push({
      id: user.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
      deny: [
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageRoles,
        PermissionsBitField.Flags.ManageWebhooks,
        PermissionsBitField.Flags.CreateInstantInvite,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.SendTTSMessages],
    },);
  });

  // Allow manage channel perms for the creator
  const owner_permissions = permissionOverwrites.find(po => po.id == message.author.id);
  owner_permissions.allow = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageRoles,
  ];
  owner_permissions.deny = [];

  // Create channel with permissions.
  const req = client.config.guild.channels.create({
    name: channel_name,
    type: ChannelType.GuildText,
    parent: parent_category,
    permissionOverwrites: permissionOverwrites,
  });

  req.then(channel => {
    channel.send(welcome_pm_message).catch(console.error);
  }).catch((error) => {
    message.channel.send(`\`\`\`${error}\`\`\``);
    console.log(error);
  });
}

exports.run = (client, message, args) => {
  // We only allow this command to be run by DM or command channels (not categories).
  if (!client.helpers.channelsAuth.onlyAuthorizeDmOrChannel(client, message)) return;
  // Returns documentation.
  if (client.helpers.shared.helpArg(args, message.channel, exports.help)) { return; }

  const argsWithoutMentions = args.filter(arg => !Discord.MessageMentions.UsersPattern.test(arg));
  const cad = collectArgsData;

  cad(client, argsWithoutMentions, message).then(res => {
    const users_data = res;
    if (users_data.users.length <= 1) {
      message.channel.send(exports.help.usage).catch(console.error);
      return;
    }

    const categories = client.config.guild.channels.cache.filter(channel =>
      channel.type === ChannelType.GuildCategory &&
      channel.name.startsWith(client.config.privateGroupsCategory),
    );

    if (categories.size < 1) {
      message.channel
        .send(`Could not find the \`${client.config.privateGroupsCategory}\` category, please contact an administrator.`)
        .catch(console.error);
      return;
    }

    const parent_category = categories.find(category => category.children.cache.size < 50);
    if (!parent_category || typeof parent_category === 'undefined') {
      // Create a new category if existing ones are full.
      const category_name = `${client.config.privateGroupsCategory} ${categories.size + 1}`;

      client.config.guild.channels.create({
        name: category_name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: categories.first().permissionOverwrites,
      })
        .then(category => createGroupChannel(client, message, category, users_data))
        .catch(error => console.log(error));
    } else { createGroupChannel(client, message, parent_category, users_data); }
  });
};