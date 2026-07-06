# Zyn Agent — AI Agent for Your Terminal

<p align="center">
  <img src="https://i.ibb.co/46VHVKb/47-sin-t-tulo-20260702143433.png" alt="Zyn AI Agent Logo" width="180" />
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/zyn-ai?label=npm&color=%23CB3837" alt="NPM Version"/>
  <img src="https://img.shields.io/github/v/release/SoyMaycol/Zyn?include_prereleases&sort=semver" alt="Latest Release"/>
  <img src="https://img.shields.io/npm/dt/zyn-ai" alt="Downloads"/>
  <img src="https://img.shields.io/github/license/SoyMaycol/Zyn" alt="License"/>
  <img src="https://img.shields.io/badge/node-%3E%3D18-green" alt="Node.js 18+"/>
</p>

<p align="center">
  <b>Terminal AI agent with 28+ providers, 217+ models, plugin system, MCP support, and zero vendor lock-in.</b>
</p>

<p align="center">
  <a href="#installation">Install</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="#commands">Commands</a> ·
  <a href="#providers--models">Providers</a> ·
  <a href="#plugins">Plugins</a> ·
  <a href="#mcp-servers">MCP</a> ·
  <a href="#themes">Themes</a>
</p>

---

## What Is Zyn?

Zyn is a command-line AI agent that runs on your machine. It connects to any LLM provider (OpenAI, Anthropic, Gemini, Groq, etc.), executes real tools (shell commands, file operations, web searches), and remembers context across sessions.

It's not a chat wrapper. It's an agent that actually does things — runs commands, reads/writes files, searches the web, creates images, and talks to MCP servers. You can extend it with plugins from npm.

**Honest assessment:** Zyn works well for terminal-based AI workflows. It has real tool execution, persistent memory, and a plugin system. It's not perfect — some edge cases with streaming can be rough, and the TUI occasionally glitches. But it gets the job done for developers who want AI in their terminal without vendor lock-in.

---

## Installation

```bash
# Install globally
npm install -g zyn-ai

# Or use directly
npx zyn-ai

# From source
git clone https://github.com/SoyMaycol/Zyn.git
cd Zyn
npm install
npm start
```

**Requirements:** Node.js 18+

---

## Quick Start

```bash
zyn               # Full TUI with streaming, themes, plugins
zyn "your prompt" # Single CLI prompt
zyn --new         # Fresh session
zyn --resume ID   # Resume a previous session
```

First run: Zyn starts with a free model (Zen/Nemotron). Use `/providers` to configure your own API keys, then `/models` to pick a model.



https://github.com/user-attachments/assets/a66690d6-db83-4d5a-8482-d0af98a8b7e4



---

## Features

### Agent Core

- **Tool execution** — run commands, read/write files, edit code, search web, create images
- **Persistent memory** — saves context across sessions (`/memory`, `/summary`)
- **Session management** — full history, resume, export, transcripts
- **Background jobs** — `/bg` for long-running tasks, `/jobs` to manage them
- **Streaming** — live token output, thinking indicators, cancel with ESC
- **i18n** — English/Spanish with auto-detection
- **No hard limits** — configurable timeouts, history size, context windows

### Providers & Models

- **28+ providers** — OpenAI, Anthropic, Google Gemini, Groq, Together, OpenRouter, Mistral, xAI, Cohere, Fireworks, Perplexity, Ollama, GitHub Models, Azure, AWS Bedrock, Vertex AI, Cloudflare, LM Studio, Novita, Chutes, Inference.net, Replicate, DeepSeek, HuggingFace, Zen, Qwen, Custom
- **217+ verified models** — real model IDs, no fake entries
- **Dynamic model picker** — `/models` opens interactive selector
- **Custom model IDs** — type any model ID (with warning if not registered)
- **Auto-discovery** — `/provider sync` fetches latest model lists

### TUI Interface

- **Interactive selection** — model picker, provider selector, theme chooser
- **Real-time streaming** — thinking blocks, tool call logs, live token counter
- **24 built-in themes** — dark, light, gruvbox, dracula, nord, solarized, monokai, tokyo-night, matrix, cyberpunk, vaporwave, rosePine, catppuccin, and more
- **Dynamic theme chooser** — `/theme` opens interactive picker with preview
- **Responsive** — adapts to any terminal width, listens to resize events
- **No emojis** — clean text UI with symbols (`>`, `·`, `x`)

### Plugin System

- **`/plugins` command** — install, uninstall, list community plugins
- **npm-based** — install from npmjs registry
- **Plugin types** — themes, skills, tools, prompts, commands, UI components
- **Security model** — consent required before install, warns about permissions
- **Sandboxed** — plugins run in restricted context, no full system access

### MCP Servers

- **`/mcp` commands** — connect, disconnect, list, import
- **Model Context Protocol** — connect to external tool servers
- **Auto-discovery** — detect MCP servers from URLs
- **Tool integration** — MCP tools appear alongside built-in tools

---

## Commands

### Core

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/status` | Current model, provider, session info |
| `/history` | Last 20 actions |
| `/memory` | Show memory summary |
| `/session` | Current session info |
| `/sessions` | List all sessions |
| `/new` | New session |
| `/resume <ID>` | Resume session |
| `/title <text>` | Rename session |

### Configuration

| Command | Description |
|---------|-------------|
| `/models` | Model picker |
| `/providers` | Provider selector |
| `/provider set <name> <field> <value>` | Set provider config |
| `/provider remove <name>` | Remove provider |
| `/provider sync <name>` | Fetch latest models |
| `/theme` | Theme picker (24 themes) |
| `/theme <name>` | Switch theme directly |
| `/lang <en\|es>` | Change language |
| `/auto on\|off` | Auto-approve tools |
| `/persona set <text>` | Set AI persona |
| `/config show` | Show all config |
| `/cwd <path>` | Change working directory |

### Plugins

| Command | Description |
|---------|-------------|
| `/plugins` | Open plugin manager |
| `/plugins list` | List installed plugins |
| `/plugins install <name>` | Install from npm |
| `/plugins uninstall <name>` | Remove plugin |
| `/plugins search <query>` | Search npm for plugins |

### MCP Servers

| Command | Description |
|---------|-------------|
| `/mcp` | Open MCP manager |
| `/mcp connect <name> <url>` | Connect to MCP server |
| `/mcp disconnect <name>` | Disconnect server |
| `/mcp list` | List connected servers |
| `/mcp tools <name>` | List server tools |
| `/mcp import` | Auto-discover MCP servers |

### Export & Control

| Command | Description |
|---------|-------------|
| `/export` | Export session to txt |
| `/bg` | Detach to background |
| `/jobs` | List background jobs |
| `/stop` | Stop current turn |
| `/clear` | Reset session |
| `/exit` | Exit Zyn |

---

## Providers & Models

Zyn connects to 28+ LLM providers. Configure with `/providers`, then pick a model with `/models`.

**Free options (no API key):**
- Zen (Nemotron, Mimo) — default, works out of the box

**Popular paid providers:**
- OpenAI — GPT-4o, GPT-5, o1, o3
- Anthropic — Claude 3.5 Sonnet, Claude 4
- Google — Gemini 2.5 Pro, Gemini 2.5 Flash
- Groq — Llama 3.3, Mixtral (fast inference)
- Together — DeepSeek, Llama, Qwen models
- OpenRouter — access to multiple providers

```bash
# Configure a provider
/provider set openai apiKey sk-xxx

# Pick a model
/models
```

---

## Themes

Zyn includes 24 built-in themes with dynamic selection.

```bash
/theme                  # Interactive theme picker
/theme gruvbox          # Switch directly
/theme random           # Random theme
/theme list             # List all themes
```

**Built-in themes:** dark, cappuccino, light, coffee, gruvbox, dracula, nord, solarized, monokai, tokyo-night, matrix, synthwave, rosePine, catppuccin, oneDark, materialPalenight, cyberpunk, arctic, ember, lavender, midnight, sunset, ocean, vaporwave.

**Install community themes:**
```bash
/plugins install zyn-theme-matrix
/theme matrix
```

---

## Plugins

Extend Zyn with community plugins from npm.

```bash
/plugins                    # Open plugin manager
/plugins list               # List installed plugins
/plugins install zyn-theme-neon  # Install a theme
/plugins search skill       # Search for skill plugins
/plugins uninstall zyn-theme-neon  # Remove plugin
```

**Plugin types:**
- `theme` — new color schemes and visual styles
- `skill` — AI skills with YAML frontmatter
- `tool` — custom tools (API calls, scripts)
- `prompt` — modify system prompts
- `command` — add slash commands
- `ui` — UI components

**Security:** Zyn asks for consent before installing plugins. Plugins run sandboxed — they can't access your files or API keys without explicit permission. Always review plugin source code before installing.

---

## MCP Servers

Connect to Model Context Protocol servers for external tools.

```bash
/mcp                                    # Open MCP manager
/mcp connect my-tools http://localhost:8080  # Connect server
/mcp list                               # List connected servers
/mcp tools my-tools                     # List available tools
/mcp disconnect my-tools                # Disconnect
```

MCP tools appear alongside Zyn's built-in tools. The agent can use them automatically.

---

## Directory Structure

```
zyn/
├── zyn.js                    # Entry point
├── src/
│   ├── core/
│   │   ├── agent.js          # Agent core (runAgentTurn, streaming, tool loop)
│   │   ├── prompts.js        # System prompt, conversation formatting
│   │   └── skills.js         # Skill loading (YAML frontmatter)
│   ├── cli/
│   │   ├── commands.js       # Slash commands, provider config, plugin/MCP mgmt
│   │   ├── runtime.js        # CLI interface
│   │   ├── print.js          # Terminal output, streaming
│   │   └── selector.js       # Interactive selectors
│   ├── tui/
│   │   └── app.mjs           # TUI (Ink/React), themes, UI components
│   ├── tools/
│   │   └── index.js          # Tool definitions, execution, validation
│   ├── providers/
│   │   ├── scraperClient.js  # Provider routing, chat dispatch
│   │   ├── catalog.js        # Model/provider catalog
│   │   └── *.js              # Provider implementations (28+)
│   ├── utils/
│   │   ├── sessionStorage.js # Session state, history, memory
│   │   └── transcriptStorage.js # Transcript logging
│   └── i18n.js               # English/Spanish translations
├── data/chat/                # Local session data (not uploaded)
│   ├── sessions/
│   ├── transcripts/
│   ├── exports/
│   └── providers.json        # Provider API keys
├── package.json
└── README.md
```

---

## Development

```bash
git clone https://github.com/SoyMaycol/Zyn.git
cd Zyn
npm install
npm run check    # Syntax check critical files
npm start        # Run TUI
```

**Code conventions:**
- CommonJS for Node.js files (`.js`)
- ES Modules for TUI (`.mjs`)
- No emojis in TUI — use text symbols
- Spanish/English i18n for all user-facing strings

---

## Roadmap

- [ ] Plugin marketplace UI
- [ ] More MCP server integrations
- [ ] Custom tool creation wizard
- [ ] Multi-session collaboration
- [ ] Voice input/output
- [ ] Custom theme builder

---

## Support

- **Issues:** https://github.com/SoyMaycol/Zyn/issues
- **Discussions:** https://github.com/SoyMaycol/Zyn/discussions

---

## License

MIT © Maycol
