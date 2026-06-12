function loadDiscordAdapter() {
  let mod;
  try {
    mod = require('discord.js');
  } catch (err) {
    throw new Error(
      'discord.js is not installed. Run `npm install discord.js` to enable the Discord adapter.',
    );
  }
  return mod;
}

function discord(agent, options = {}) {
  const { token, prefix = '!zyn ', intents } = options;
  if (!token) throw new Error('Discord adapter requires a `token` option.');
  const discordMod = loadDiscordAdapter();
  const { Client, GatewayIntentBits, Events } = discordMod;

  const requiredIntents = intents || [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ];

  const client = new Client({ intents: requiredIntents });
  const active = { value: false };

  client.once(Events.ClientReady, (c) => {
    active.value = true;
    options.onReady?.(c);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    const content = String(message.content || '');
    if (prefix && !content.startsWith(prefix)) return;
    const text = prefix ? content.slice(prefix.length) : content;
    if (!text) return;
    try {
      const reply = await agent.send(message.author.id, text);
      await message.channel.send(String(reply || ''));
    } catch (err) {
      agent.emit?.('error', err);
    }
  });

  async function start() {
    await client.login(token);
  }

  async function stop() {
    active.value = false;
    await client.destroy();
  }

  async function sendMessage(channelId, text) {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) throw new Error('Channel is not text-based');
    return channel.send(String(text));
  }

  return { start, stop, sendMessage, client, isReady: () => active.value };
}

module.exports = discord;
