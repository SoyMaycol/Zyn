function loadBaileysAdapter() {
  let mod;
  try {
    mod = require('@whiskeysockets/baileys');
  } catch (err) {
    throw new Error(
      'Baileys is not installed. Run `npm install @whiskeysockets/baileys` to enable the WhatsApp adapter.',
    );
  }
  return mod;
}

function baileys(agent, options = {}) {
  const { prefix = '', authDir, onReady, printQR = true } = options;
  const baileys = loadBaileysAdapter();
  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys;
  const Boom = baileys.Boom || (() => { try { return require('@hapi/boom'); } catch { return null; } })();

  let sock;
  let active = false;

  async function start() {
    const authPath = authDir || path.join(process.cwd(), '.zyn', 'whatsapp-auth');
    fs.mkdirSync(authPath, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    sock = makeWASocket({ auth: state, printQR });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'open') {
        active = true;
        if (typeof onReady === 'function') onReady(sock);
      }
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode : 0;
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => start().catch(() => {}), 1500);
        } else {
          active = false;
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        const text = msg.message.conversation
          || msg.message.extendedTextMessage?.text
          || msg.message.imageMessage?.caption
          || msg.message.videoMessage?.caption
          || '';
        if (!text) continue;
        const sender = msg.key.remoteJid || 'unknown';
        const incoming = prefix ? text.slice(prefix.length) : text;
        try {
          const reply = await agent.send(sender, incoming);
          await sock.sendMessage(sender, { text: String(reply || '') });
        } catch (err) {
          agent.emit?.('error', err);
        }
      }
    });
  }

  async function sendMessage(jid, text) {
    if (!sock || !active) throw new Error('WhatsApp socket not ready');
    return sock.sendMessage(jid, { text: String(text) });
  }

  return { start, sendMessage, getSocket: () => sock };
}

module.exports = baileys;
