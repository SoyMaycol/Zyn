# Zyn Agent

<p align="center">
  <img src="http://cdn.soymaycol.icu/files/logo_zyn.png" alt="Zyn logo" width="180" />
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/zyn-ai?label=npm&color=%23CB3837" alt="NPM Version"/>
  <img src="https://img.shields.io/github/v/release/SoyMaycol/Zyn?include_prereleases&sort=semver" alt="Latest Release"/>
  <img src="https://img.shields.io/npm/dt/zyn-ai" alt="Downloads"/>
</p>

<p align="center">
  <b>Local AI agent for terminal, TUI, and web.</b>
</p>

<p align="center">
  <a href="https://github.com/SoyMaycol/Zyn">Official repository</a>
</p>

---

## What is Zyn

Zyn is a local AI agent designed for terminal and web usage. It supports persistent sessions, system tools, multiple AI providers, session exports, and configurable models.

---

## Requirements

- Node.js 18+
- npm
- Internet connection for remote providers
- Optional: Ollama for local models

---

## Installation

### Global install

```bash
npm install -g zyn-ai
zyn
```

### Local development

```bash
git clone https://github.com/SoyMaycol/Zyn.git
cd Zyn
npm install
npm start
```

---

## Usage

```bash
zyn
zyn "Explain this project"
zyn --new
zyn --resume ID
```

---

## Web mode

Inside Zyn:

```text
/web
/web 0.0.0.0:3000
```

Or directly from the project:

```bash
npm run web
```

---

## Language

Supported languages:

- `en`
- `es`

Commands:

```text
/lang
/lang en
/lang es
/language es
/config lang en
```

---

## Main Commands

### Sessions

| Command | Description |
|---|---|
| `/help` | Show available commands |
| `/status` | Show current status |
| `/history` | Show recent actions |
| `/memory` | Show memory summary |
| `/sessions` | List saved sessions |
| `/new` | Create a new session |
| `/resume <ID>` | Resume a session |
| `/title <text>` | Rename session |

### Configuration

| Command | Description |
|---|---|
| `/model` | Show or change model |
| `/models` | List models |
| `/providers` | List providers |
| `/lang <en\|es>` | Change language |
| `/config show` | Show config |
| `/auto on\|off` | Toggle auto approval |
| `/cwd <path>` | Change working directory |

### Tools

| Command | Description |
|---|---|
| `/tools` | List tools |
| `/skills` | List skills |
| `/cwd` | Show working directory |

### Web & Export

| Command | Description |
|---|---|
| `/web` | Start web interface |
| `/transcript` | Show transcript |
| `/export` | Export session |

### Control

| Command | Description |
|---|---|
| `/stop` | Stop current task |
| `/reset` | Reset session |
| `/exit` | Exit Zyn |

In the TUI, press `ESC` twice to stop the current task.

---

## Models

Custom models can be added using `data/models.json`.

Example:

```json
{
  "models": {
    "my-local-model": {
      "label": "My local model",
      "provider": "ollama",
      "ollamaModel": "llama3.1:8b"
    },
    "my-remote-model": {
      "label": "My remote model",
      "provider": "openai-compatible",
      "openaiModel": "gpt-4o-mini",
      "baseUrl": "https://api.example.com/v1"
    }
  }
}
```
