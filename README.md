# Zyn

<p align="center">
  <img src="http://cdn.soymaycol.icu/files/logo_zyn.png" alt="Zyn logo" width="180" />
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/zyn-ai?label=npm&color=%23CB3837" alt="NPM Version"/>
  <img src="https://img.shields.io/github/v/release/SoyMaycol/Zyn?include_prereleases&sort=semver" alt="Latest Release"/>
  <img src="https://img.shields.io/npm/dt/zyn-ai" alt="Downloads"/>
  <img src="https://img.shields.io/github/license/SoyMaycol/Zyn" alt="License"/>
</p>

<p align="center">
  <b>AI agent for terminal, TUI, and external platforms (WhatsApp, Discord, Telegram).</b>
</p>

<p align="center">
  <a href="https://github.com/SoyMaycol/Zyn">GitHub</a>
</p>

---

## Features

- **CLI + TUI** — full terminal UI with keyboard navigation, command suggestions, and overlay system
- **Multi-provider** — Zen (free, no config), Gemini, Qwen (DashScope), HuggingFace, custom providers
- **Skills system** — folder-based skills with YAML frontmatter that guide agent behavior
- **Tool execution** — read/write files, run commands, search code, browse web, glob patterns
- **Session management** — persistent sessions with full transcript replay, resume, export
- **Multi-platform** — embeddable in WhatsApp (Baileys), Discord, and Telegram bots
- **Background workers** — detach long-running turns to background processes
- **i18n** — English and Spanish interfaces

## Requirements

- Node.js 18+
- npm
- Internet connection for remote AI providers

## Installation

```bash
npm install -g zyn-ai
zyn
```

### From source

```bash
git clone https://github.com/SoyMaycol/Zyn.git
cd Zyn
npm install
npm start
```

## Usage

```bash
zyn                  # Interactive TUI (default)
zyn "question"       # Single prompt (CLI mode)
zyn --new            # Force new session
zyn --resume ID      # Resume existing session
```

## Models

14 built-in models across 4 providers:

### Zen (free, no configuration)

| Key | Model |
|---|---|
| `nemotron` | Nemotron 3 Ultra |
| `mimo` | Mimo 2.5 |
| `north-mini` | North Mini Code |
| `deepseek` | DeepSeek V4 Flash |

### Gemini (requires API key)

| Key | Model |
|---|---|
| `gemini-flash` | Gemini 2.5 Flash |
| `gemini-flash-001` | Gemini 2.5 Flash 001 |
| `gemini-pro` | Gemini 2.5 Pro |
| `gemini-flash-lite` | Gemini 2.5 Flash Lite |
| `gemini-flash-lite-001` | Gemini 2.5 Flash Lite 001 |
| `gemma-3` | Gemma 3 27B |

### Qwen (requires DashScope API key)

| Key | Model |
|---|---|
| `qwen-plus` | Qwen Plus |
| `qwen-max` | Qwen Max |
| `qwen-turbo` | Qwen Turbo |

### HuggingFace (requires HF token)

| Key | Model |
|---|---|
| `hf-ling-2.6-1t` | InclusionAI Ling 2.6 1T |

Default model: `nemotron` (Zen, no configuration required).

## Commands

### Sessions

| Command | Description |
|---|---|
| `/help` | Show help |
| `/status` | Current status |
| `/history` | Recent actions (last 20) |
| `/memory` | Memory summary |
| `/session` | Current session info |
| `/sessions` | List all sessions |
| `/new` | New session |
| `/resume <ID>` | Resume session |
| `/title <text>` | Rename session |

### Configuration

| Command | Description |
|---|---|
| `/models` | Open model picker (current provider) |
| `/providers` | Open provider picker → configure → pick model |
| `/lang <en\|es>` | Change language |
| `/auto on\|off` | Toggle auto-approval |
| `/concuerdo` | Toggle group model mode |
| `/persona set <text>` | Set response persona |
| `/config show` | Show config |
| `/git set\|list\|remove` | Manage git credentials |
| `/cwd <path>` | Change working directory |

### Tools & Skills

| Command | Description |
|---|---|
| `/tools` | List agent tools |
| `/skills` | List loaded skills |
| `/gmail connect` | Connect Gmail via OAuth |

### Export & Control

| Command | Description |
|---|---|
| `/bg` | Detach current turn to background |
| `/transcript` | View session transcript |
| `/export` | Export session to txt |
| `/stop` | Stop current agent turn |
| `/undo` | Undo last turn |
| `/redo` | Redo undone turn |
| `/reset` | Reset context |
| `/exit` | Exit |

Press `ESC` twice in the TUI to stop the current task.

## Skills

Skills are folders under `data/skills/<name>/SKILL.md` with YAML frontmatter:

```markdown
---
name: reasoning
description: Reasoning and planning for complex tasks
---

# Skill body here
```

The system prompt automatically advertises every loaded skill to the model.

## API

### Embed in your bot

```js
const { createAgent } = require('zyn-ai');

const agent = createAgent({
  model: 'nemotron',
  language: 'en',
  autoApprove: false,
});

const response = await agent.send('userId', 'Hello!');
```

### Platforms

```js
const { createAgent, platforms } = require('zyn-ai');

const agent = createAgent({ model: 'nemotron' });

// WhatsApp (Baileys)
await platforms.whatsapp({ agent, session: './whatsapp-auth' });

// Discord
await platforms.discord({ agent, token: 'DISCORD_TOKEN' });

// Telegram
await platforms.telegram({ agent, token: 'TELEGRAM_TOKEN' });
```

Install the corresponding `optionalDependencies` only if you need them.

## Environment Variables

| Variable | Description |
|---|---|
| `ZYN_DEFAULT_MODEL` | Override default model key |
| `ZYN_DEFAULT_LANG` | Default language (`en` or `es`) |
| `ZYN_GEMINI_API_KEY` | Gemini API key |
| `ZYN_QWEN_API_KEY` | DashScope API key |
| `ZYN_HUGGINGFACE_TOKEN` | HuggingFace token |
| `ZYN_REQUEST_TIMEOUT_MS` | Request timeout (default: 180000) |
| `ZYN_GMAIL_CLIENT_SECRET` | Gmail OAuth client secret |

## License

MIT
