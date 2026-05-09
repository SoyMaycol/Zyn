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

Or directly:

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
| `/gmail connect` | Connect Gmail with Google OAuth + PKCE |
| `/gmail status` | Show Gmail connection status |
| `/gmail disconnect` | Remove saved Gmail tokens |
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
    "my-gemini-flash": {
      "label": "Gemini Flash",
      "provider": "gemini",
      "geminiModel": "gemini-flash"
    }
  }
}
```

## PRoot Container Manager (experimental)

This project now ships a `proot-manager` CLI to create and operate rootless containers with custom rootfs.

### Quick start

```bash
proot-manager doctor
proot-manager create --id demo --rootfs /path/to/rootfs.tar.gz --ramMb 1024 --diskMb 4096
proot-manager list
proot-manager exec --id demo --cmd /bin/sh
proot-manager limits --id demo --ramMb 2048 --diskMb 8192
proot-manager delete --id demo
```

### Features

- Create/delete/list containers.
- Execute commands or open an interactive shell.
- Configurable RAM cap via `ulimit` (`RLIMIT_AS`).
- Disk quota monitor with process-group kill when exceeded.
- Auto-detects system and suggests the correct package-manager command to install PRoot.

Programmatic API: `src/containers/prootManager.js`.
