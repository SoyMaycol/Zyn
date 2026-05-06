# Zyn Agent

<p align="center">
  <img src="http://cdn.soymaycol.icu/files/logo_zyn.png" alt="Zyn logo" width="180" />
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/zyn-ai?label=npm&color=%23CB3837" alt="NPM Version"/>

  <img src="https://img.shields.io/github/v/release/SoyMaycol/Zyn?include_prereleases&sort=semver" alt="Latest Release"/>

  <img src="https://img.shields.io/npm/dt/zyn-ai" alt="Downloads"/>

  <img src="https://img.shields.io/github/forks/SoyMaycol/Zyn" alt="Forks"/>
</p>

<p align="center">
  <b>Local terminal and web agent for multi-provider AI workflows.</b>
</p>

<p align="center">
  <a href="https://github.com/SoyMaycol/Zyn">Official repository</a>
</p>

## What Zyn is

Zyn is a local agent for terminal and web workflows. It supports multiple AI providers, persistent sessions, system tools, contextual memory, and collaborative multi-model reasoning. The project is designed to be direct, extensible, and practical for real development work.

## Features

- Interactive terminal mode with reactive TUI and visual confirmations.
- Classic CLI mode for direct prompts.
- Web mode for collaborative usage and cross-model review.
- Multiple providers and custom model support.
- Modular skills system (reasoning, debugging, frontend, testing, and more).
- Persistent sessions, history, and transcript export.
- Unified Git tool with full API control (`action="api"` and `action="clone"`).
- Custom persona configuration for response tone (`/persona`).
- Automatic system detection (reads real OS, not fixed to Termux).
- Professional image generation with Jimp (social posts, thumbnails, infographics, banners).
- Extensible architecture for tools and providers.

## Requirements

- Node.js 18 or newer
- npm
- Internet connection for remote providers
- Optional: Ollama for local models

## Install

### Global install

```bash
npm install zyn-ai -g
```

Then run:

```bash
zyn
```

### Local development

```bash
git clone https://github.com/SoyMaycol/Zyn.git
cd Zyn
npm install
```

## Usage

### Interactive terminal

```bash
zyn
```

### Direct prompt

```bash
zyn "Explain this project"
```

### Open the web version from the CLI

```bash
/web
```

Or directly:

```bash
node src/web/server.js
```

### Help

Inside Zyn:

```bash
/help
```

## Language selection

Use the command below inside Zyn:

```text
/lang en
/lang es
```

English is the default.

## Main commands

### Sessions

| Command | Description |
|---------|-------------|
| `/help` | Shows full command list with descriptions |
| `/status` | Current status: model, language, active sessions |
| `/history` | Recent session actions (last 20) |
| `/memory` | Agent memory summary |
| `/summary` | Alias of `/memory` |
| `/session` | Current session information |
| `/sessions` | Lists all saved sessions |
| `/new` | Creates a new session |
| `/resume <ID>` | Resumes an existing session |
| `/title <text>` | Renames the current session |
| `/rename <text>` | Alias of `/title` |

### Configuration

| Command | Description |
|---------|-------------|
| `/model [KEY]` | View or change active model. Example: `/model qwen-turbo` |
| `/models` | Lists available models |
| `/providers` | Lists detected providers |
| `/lang <en\|es>` | Changes interface language |
| `/language <en\|es>` | Alias of `/lang` |
| `/config show` | Shows current session configuration |
| `/config lang <en>` | Changes language from config |
| `/config model <K>` | Changes model from config |
| `/auto` | Toggles auto-approval for tool calls |
| `/persona <text>` | Sets custom response tone/personality |
| `/persona reset` | Resets personality to system default |

### Tools and Git

| Command | Description |
|---------|-------------|
| `/tools` | Lists available agent tools |
| `/skills` | Lists loaded agent skills |
| `/git set <prov>` | Configures git credentials. Example: `/git set github --token ghp_xxx` |
| `/git list` | Lists configured git profiles (tokens hidden) |
| `/git remove <prov>` | Removes credentials for a provider |
| `/cwd` | Shows current working directory |

### Web and export

| Command | Description |
|---------|-------------|
| `/web` | Opens the web version |
| `/transcript` | Views the full session transcript |
| `/export` | Exports session to a text file |

### Control

| Command | Description |
|---------|-------------|
| `/stop` | Stops the current agent turn |
| `/abort` | Alias of `/stop` |
| `/reset` | Resets the current context |
| `/clear` | Alias of `/reset` |
| `/exit` | Exits Zyn |
| `/quit` | Alias of `/exit` |

## Providers

Zyn includes support for:

- Qwen
- Zen
- Ollama
- OpenAI-compatible providers

Models can be extended from `data/models.json` or from the internal configuration.

### Example model config

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

## Git — Full API control

The unified `git` tool provides complete control over any provider:

- **action="api"**: Any HTTP operation (GET, POST, PATCH, PUT, DELETE) against the provider API.
- **action="clone"**: Clone repositories with configured credentials.

No hardcoded actions. Choose `method` and `path` freely based on your APIKey permissions.

## Web collaboration

The web version is designed for cross-review between multiple models. That helps one model correct or contrast what another generated, which is useful when consistency matters.

## Skills

The skills system breaks the agent behavior into focused pieces:

- `core`
- `reasoning`
- `methodology`
- `thinking`
- `tools`
- `web-agent`
- `debugging`
- `frontend_design`
- `code-style`
- `domains`
- `testing`

Each skill can evolve without breaking the rest of the project.

## Image generation with Jimp

Zyn includes professional image generation via `create_canvas_image`. Supported templates:

- **Social posts**: Facebook, Twitter/X, Instagram, LinkedIn
- **YouTube thumbnails**: 1280x720 with ready-to-use layouts
- **Banners**: GitHub repos, Discord, YouTube
- **Infographics**: Statistic cards with color coding
- **Quotes**: Inspirational text layouts
- **Event posters**: Date, time, venue
- **Geometric art**: Landscapes and compositions
- **Profile cards**: Avatar, name, details

Each template includes coordinates, colors, and typography ready to use.

## License

This project includes an attribution-friendly license. Keep the credits, the repository link, and the license notices when redistributing or deriving the project.

## Credits

- Project: [SoyMaycol/Zyn](https://github.com/SoyMaycol/Zyn)
- Author: Maycol
