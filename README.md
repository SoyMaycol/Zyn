# Zyn

<p align="center">
  <img src="https://cdn.soymaycol.icu/files/logo_zyn.png" alt="Zyn logo" width="180" />
</p>

<p align="center">
  <b>Local terminal and web agent for multi-provider AI workflows.</b>
</p>

<p align="center">
  <a href="https://github.com/SoyMaycol/Zyn">Official repository</a>
</p>

## What Zyn is

Zyn is a local agent for terminal and web workflows. It supports multiple AI providers, persistent sessions, tools, memory, and collaborative multi-model reasoning. The project is designed to be direct, extensible, and practical for real development work.

## Features

- English by default, with language switching from commands.
- Interactive terminal mode and classic CLI mode.
- Web mode for collaborative usage.
- Multiple providers and custom models.
- Modular skills system.
- Persistent sessions, history, and transcript export.
- Extensible architecture for tools and providers.

## Requirements

- Node.js 18 or newer
- npm
- Internet connection for remote providers
- Optional: Ollama for local models

## Install

### Global install

```bash
npm install -g git+https://github.com/SoyMaycol/Zyn.git
```

Then run:

```bash
Zyn
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
Zyn
```

### Direct prompt

```bash
Zyn "Explain this project"
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

- `/help` shows the full command list.
- `/lang en` or `/lang es` changes the interface language.
- `/model` views or changes the active model.
- `/models` lists available models.
- `/providers` lists detected providers.
- `/skills` shows loaded skills.
- `/tools` shows available tools.
- `/web` opens the web version.
- `/concuerdo` enables the group-model mode.
- `/stop` stops the current agent turn.
- `/reset` resets the current context.

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

## License

This project includes an attribution-friendly license. Keep the credits, the repository link, and the license notices when redistributing or deriving the project.

## Credits

- Project: [SoyMaycol/Zyn](https://github.com/SoyMaycol/Zyn)
- Base authorship: Maycol and Ado
