function loadTelegramAdapter() {
  let mod;
  try {
    mod = require('node-telegram-bot-api');
  } catch (err) {
    throw new Error(
      'node-telegram-bot-api is not installed. Run `npm install node-telegram-bot-api` to enable the Telegram adapter.',
    );
  }
  return mod;
}

function telegram(agent, options = {}) {
  const { token, polling = true, prefix = '' } = options;
  if (!token) throw new Error('Telegram adapter requires a `token` option.');
  const TelegramBot = loadTelegramAdapter();
  const bot = new TelegramBot(token, { polling });

  const active = { value: false };

  bot.on('polling_error', (err) => {
    agent.emit?.('error', err);
  });
  bot.on('webhook_error', (err) => {
    agent.emit?.('error', err);
  });

  bot.on('message', async (msg) => {
    if (!msg?.from?.id) return;
    const text = String(msg.text || '');
    if (!text) return;
    const incoming = prefix ? text.slice(prefix.length) : text;
    if (!incoming) return;
    try {
      const reply = await agent.send(String(msg.from.id), incoming);
      await bot.sendMessage(msg.chat.id, String(reply || ''));
    } catch (err) {
      agent.emit?.('error', err);
    }
  });

  bot.on('polling_start', () => {
    active.value = true;
    options.onReady?.(bot);
  });

  async function stop() {
    active.value = false;
    await bot.stopPolling();
  }

  return { start: async () => { if (!active.value) active.value = true; }, stop, sendMessage: (chatId, text) => bot.sendMessage(chatId, String(text)), bot, isReady: () => active.value };
}

module.exports = telegram;
