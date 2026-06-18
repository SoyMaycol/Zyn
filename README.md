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
  <b>AI agent for terminal, TUI, and embeddable API — fixed conversation history, memory compaction, and text display bugs</b>
</p>

<p align="center">
  <a href="https://github.com/SoyMaycol/Zyn">GitHub</a>
</p>

---

## Key Fixes (2026)

### History Persistence

- **Session resumption** — Use `--resume ID` to continue previous conversations. Without `--resume`, a new empty session is created each time.
- **History includes** — User messages, assistant responses, tool results, and thinking blocks (with accurate elapsed time, not 0.0s for tools)

### Memory Compaction

- **Lower threshold** — Now compacts at 12K chars (was 60K) — more frequent, realistic cleaning
- **Accurate summaries** — Real conversation history ($ removed), better token estimates
- **Smart history retention** — Keeps last 50 messages or 12K chars, whichever fits first

### Text Display

- **Unescaped newlines** — `\n` in JSON content now converts to real newlines
- **Inline markdown** — Renders `*italic*`, `_italic_`, `**bold**`, `` `code` `` in responses
- **No duplication** — Response content written once, not twice

### System Prompt Improvements

- **Clearer instructions** — Added rules for using conversation history:
  - "Tienes acceso al historial de la conversacion. Úsalo para responder preguntas sobre conversaciones anteriores."
  - Specific guidance: "Si el usuario pregunta 'que dice al principio' o similar, revisa el historial y responde con lo que dice."
- **Supports `ask_user`** — Model now knows to ask the user when it needs information or choices

### Skill Search

- **Auto-search** — Mentions of GitHub repos/skills trigger `web_search` to find them
- **Skills.sh compatible** — Format matches skills.sh ecosystem (YAML frontmatter + Markdown)

### Other Fixes

- **ESC double-press** — First ESC shows "press again", second within 500ms aborts
- **Tool notifications** — Show `[toolName]` in thinking block when tool JSON is detected
- **`load_skill` language** — Accepts `state.language` for Spanish/English output
- **DeepSeek integration** — Fixed streaming tool detection, WASM PoW solver

## Features

- **CLI + TUI** — full terminal UI with keyboard navigation, token display, **improved history & compaction**, overlay system
- **Multi-provider** — Zen (free, no config), Gemini, Qwen (DashScope), HuggingFace, **skill search**, custom providers (any OpenAI-compatible API)
- **Skills system** — folder-based skills with **improved prompt integration** and YAML frontmatter
- **Tool execution** — read/write files, run commands, search code, browse web, glob patterns
- **Session management** — **real conversation history**, persistent sessions with **better compaction**, full transcript replay, resume, export
- **Context tracking** — token estimator with per-model context limits, **auto-compaction at 85%**, updated to reflect new history behavior
- **Multi-platform** — embeddable in WhatsApp (Baileys), Discord, and Telegram bots
- **Background workers** — detach long-running turns to background processes
- **i18n** — English and Spanish interfaces

---

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
zyn --resume ID      # Resume existing session (keeps history)
```

## Models

14 built-in models across 4 providers. Each model has its real context length in the StatusBar (e.g. `10.8K/128K`).

### Zen (free, no configuration)

| Key | Model | Context |
|---|---|---|
| `nemotron` | Nemotron 3 Ultra | 128K |
| `mimo` | Mimo 2.5 | 128K |
| `north-mini` | North Mini Code | 128K |
| `deepseek` | DeepSeek V4 Flash | 128K |

### Gemini (requires API key)

| Key | Model | Context |
|---|---|---|
| `gemini-flash` | Gemini 2.5 Flash | 1M |
| `gemini-flash-001` | Gemini 2.5 Flash 001 | 1M |
| `gemini-pro` | Gemini 2.5 Pro | 1M |
| `gemini-flash-lite` | Gemini 2.5 Flash Lite | 1M |
| `gemini-flash-lite-001` | Gemini 2.5 Flash Lite 001 | 1M |
| `gemma-3` | Gemma 3 27B | 128K |

### Qwen (requires DashScope API key)

| Key | Model | Context |
|---|---|---|
| `qwen-plus` | Qwen Plus | 128K |
| `qwen-max` | Qwen Max | 32K |
| `qwen-turbo` | Qwen Turbo | 1M |

### HuggingFace (requires HF token)

| Key | Model | Context |
|---|---|---|
| `hf-ling-2.6-1t` | InclusionAI Ling 2.6 1T | 128K |

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
| `/resume <ID>` | Resume session (keeps history) |
| `/title <text>` | Rename session |

### Configuration

| Command | Description |
|---|---|
| `/models` | Open model picker (current provider) |
| `/providers` | Open interactive provider picker → configure → pick model |
| `/provider list` | List configured providers and their fields |
| `/provider sync <name>` | Fetch models from a provider's API |
| `/provider set <name> <field> <value>` | Set provider config (apiKey, baseUrl, modelId, contextLength) |
| `/provider remove <name>` | Remove a provider configuration |
| `/lang <en\|es>` | Change language |
| `/auto on\|off` | Toggle auto-approval |
| `/concuerdo` | Toggle group model mode (queries all configured models) |
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

## Custom Providers

Add any OpenAI-compatible API:

```bash
# Interactive: run /providers → select "+ Add custom provider"
# Or manual:
/provider set groq baseUrl https://api.groq.com/openai/v1
/provider set groq apiKey gsk_xxxx
/provider set groq contextLength 128000
/provider sync groq
```

Configurable fields: `apiKey`, `baseUrl`, `modelId`, `contextLength`, `email`, `password`, `modelEndpoint`, `chatEndpoint`.

## Skills

Skills are folders under `data/skills/<name>/SKILL.md` with YAML frontmatter:

```markdown
---
name: reasoning
description: Reasoning and planning for complex tasks
---

# Skill body here
```

The system prompt automatically advertises every loaded skill to the model, and mentions of GitHub repos/skills trigger `web_search` to find them.

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
| `ZYN_PROVIDER_TIMEOUT_MAX_ATTEMPTS` | Retry attempts on provider failure (default: 3) |
| `ZYN_GMAIL_CLIENT_SECRET` | Gmail OAuth client secret |

## License

MIT
