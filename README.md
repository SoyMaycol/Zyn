# Zyn Agent

<p align="center">
  <img src="https://i.ibb.co/46VHVKb/47-sin-t-tulo-20260702143433.png" alt="Zyn logo" width="180" />
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/zyn-ai?label=npm&color=%23CB3837" alt="NPM Version"/>
  <img src="https://img.shields.io/github/v/release/SoyMaycol/Zyn?include_prereleases&sort=semver" alt="Latest Release"/>
  <img src="https://img.shields.io/npm/dt/zyn-ai" alt="Downloads"/>
  <img src="https://img.shields.io/github/license/SoyMaycol/Zyn" alt="License"/>
</p>

<p align="center">
  <b>Production-grade CLI Agent with 28+ providers and 217+ models.</b>
</p>

<p align="center">
  <a href="https://github.com/SoyMaycol/Zyn">GitHub</a>
</p>

---

## Why Zyn?

- One binary.
- Works with 28 AI providers.
- Built-in memory.
- Native TUI.
- Background workers.
- Runs locally or in the cloud.
- OpenAI-compatible APIs.

## Features

- **CLI + TUI**” full terminal UI with keyboard navigation, token display, real-time streaming, theme support (10 themes), auto-compaction
- **28 providers, 217+ models**” OpenAI, Anthropic, Google (Gemini/Vertex), Groq, Together, OpenRouter, Mistral, xAI, Cohere, Fireworks, Perplexity, DeepSeek, Qwen (DashScope), HuggingFace, Replicate, Cloudflare Workers AI, Azure OpenAI, AWS Bedrock, GitHub Models, LM Studio (local), Ollama (local + cloud), Novita, Chutes, Inference.net, Zen (free, no config), and any custom OpenAI-compatible API
- **Persistent memory**” agent-managed memory tool (`memory save/list/get/delete/clear`) with session persistence, visible in system prompt as compact reference
- **Skills system**” folder-based skills with YAML frontmatter and automatic prompt integration
- **Tool execution**” read/write files, run commands (with mandatory timeout), search code, browse web, glob patterns, git operations, image processing (via Jimp)
- **Session management**” persistent sessions with full history replay, resume, export, transcript, auto-title
- **Background workers**” detach long-running turns to background processes
- **i18n** â€” English and Spanish interfaces with auto-detection
- **Streaming**” real-time token streaming, live thinking visibility, tool call detection during streaming, cancelable with ESC
- **No hard-coded limits**” all limits configurable via env vars (tool steps, history chars, file lines, output chars)
- **Multi-platform*”" embeddable in WhatsApp (Baileys), Discord, and Telegram bots (under development)

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
> No configuration required, Start immediately using the free Zen provider.

## Usage

```bash
zyn                  # Interactive TUI (default)
zyn "question"       # Single prompt (CLI mode)
zyn --new            # Force new session
zyn --resume ID      # Resume existing session (keeps history)
```

## Presentation



https://github.com/user-attachments/assets/8f1020ea-a883-4489-8ced-37cc4860c052



## Providers

28 providers supported. Use `/providers` in the TUI to select a provider, configure it, and pick a model.

| Provider | Key | Config Required | Auth Method | Notes |
|---|---|---|---|---|
| Zen | `zen` | No | None | Free, no setup needed |
| OpenAI | `openai` | Yes | `apiKey` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | Yes | `apiKey` | `ANTHROPIC_API_KEY` |
| Google Gemini | `gemini` | Yes | `apiKey` | `GEMINI_API_KEY` / `GOOGLE_API_KEY` |
| Google Vertex AI | `vertex` | Yes | `apiKey` + `project` + `location` | `GOOGLE_CLOUD_API_KEY` |
| Groq | `groq` | Yes | `apiKey` | `GROQ_API_KEY` |
| Together AI | `together` | Yes | `apiKey` | `TOGETHER_API_KEY` |
| OpenRouter | `openrouter` | Yes | `apiKey` | `OPENROUTER_API_KEY` |
| Mistral AI | `mistral` | Yes | `apiKey` | `MISTRAL_API_KEY` |
| xAI (Grok) | `xai` | Yes | `apiKey` | `XAI_API_KEY` |
| Cohere | `cohere` | Yes | `apiKey` | `COHERE_API_KEY` |
| Fireworks AI | `fireworks` | Yes | `apiKey` | `FIREWORKS_API_KEY` |
| Perplexity | `perplexity` | Yes | `apiKey` | `PERPLEXITY_API_KEY` |
| DeepSeek | `deepseek` | Yes | `apiKey` | `DEEPSEEK_CHAT_KEY` |
| Qwen (DashScope) | `qwenapi` | Yes | `apiKey` | `QWEN_API_KEY` |
| HuggingFace | `huggingface` | Optional | `apiKey` | `HF_TOKEN` |
| Ollama (Local) | `ollama` | No | None | Runs locally |
| Ollama Cloud | `ollamaCloud` | Yes | `apiKey` | `OLLAMA_API_KEY` |
| GitHub Models | `github` | Yes | `apiKey` (PAT with models:read) | `GITHUB_TOKEN` |
| Azure OpenAI | `azure` | Yes | `apiKey` + `resource` | `AZURE_OPENAI_API_KEY` |
| AWS Bedrock | `bedrock` | Yes | `apiKey` + `region` | `BEDROCK_API_KEY` |
| Replicate | `replicate` | Yes | `apiKey` | `REPLICATE_API_TOKEN` |
| Cloudflare Workers AI | `cloudflare` | Yes | `apiKey` + `accountId` | `CLOUDFLARE_API_TOKEN` |
| LM Studio (Local) | `lmstudio` | No | None | Runs locally |
| Novita AI | `novita` | Yes | `apiKey` | `NOVITA_API_KEY` |
| Chutes AI | `chutes` | Yes | `apiKey` | `CHUTES_API_KEY` |
| Inference.net | `inference` | Yes | `apiKey` | `INFERENCE_API_KEY` |
| Custom (OpenAI-compatible) | `custom` | Yes | `baseUrl` + `apiKey` | Any OpenAI-compatible API |

Default model: `nemotron` (Zen, free, no configuration required).

Run `/models` to see all available models for the current provider, or use `/providers` to configure and switch providers interactively. You can also type a custom model ID manually from the model selector.

## Commands

### Sessions

| Command | Description |
|---|---|
| `/help` | Show help |
| `/status` | Current status |
| `/history` | Recent actions (last 20) |
| `/memory` | Show memory summary |
| `/transcript` | View session transcript |
| `/session` | Current session info |
| `/sessions` | List all sessions |
| `/new` | New session |
| `/resume <ID>` | Resume session (keeps history) |
| `/title <text>` | Rename session |

### Configuration

| Command | Description |
|---|---|
| `/models` | Open model picker (current provider) |
| `/providers` | Open interactive provider picker -> configure -> pick model |
| `/provider list` | List configured providers and their fields |
| `/provider sync <name>` | Fetch models from a provider's API |
| `/provider set <name> <field> <value>` | Set provider config |
| `/provider remove <name>` | Remove a provider configuration |
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
| `/export` | Export session to txt |
| `/stop` | Stop current agent turn |
| `/undo` | Undo last turn |
| `/redo` | Redo undone turn |
| `/reset` | Reset context (keeps memory) |
| `/exit` | Exit |

Press `ESC` twice in the TUI to stop the current task.

## Custom Providers

Add any OpenAI-compatible API:

```bash
# Interactive: run /providers -> select "+ Add custom provider"
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

The system prompt automatically advertises every loaded skill to the model.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ZYN_DEFAULT_MODEL` | `nemotron` | Override default model key |
| `ZYN_DEFAULT_LANG` | `en` | Default language (`en` or `es`) |
| `ZYN_REQUEST_TIMEOUT_MS` | `120000` | Request timeout |
| `ZYN_PROVIDER_TIMEOUT_MAX_ATTEMPTS` | `4` | Retry attempts on provider failure |
| `ZYN_PROVIDER_TIMEOUT_RETRY_DELAY_MS` | `5000` | Delay between retries |
| `ZYN_MAX_TOOL_STEPS` | `500` | Maximum tool call steps per turn |
| `ZYN_MAX_HISTORY_CHARS` | `200000` | Max history characters retained |
| `ZYN_MAX_FILE_LINES` | `10000` | Max file lines read at once |
| `ZYN_MAX_OUTPUT_CHARS` | `50000` | Max output chars per tool result |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | - | Anthropic API key |
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` | - | Google AI API key |
| `GROQ_API_KEY` | - | Groq API key |
| `TOGETHER_API_KEY` | - | Together AI API key |
| `OPENROUTER_API_KEY` | - | OpenRouter API key |
| `MISTRAL_API_KEY` | - | Mistral AI API key |
| `XAI_API_KEY` | - | xAI (Grok) API key |
| `COHERE_API_KEY` | - | Cohere API key |
| `FIREWORKS_API_KEY` | - | Fireworks AI API key |
| `PERPLEXITY_API_KEY` | - | Perplexity API key |
| `DEEPSEEK_CHAT_KEY` | - | DeepSeek API key |
| `QWEN_API_KEY` / `DASHSCOPE_API_KEY` | - | Qwen (DashScope) API key |
| `HF_TOKEN` | - | HuggingFace token |
| `GITHUB_TOKEN` | - | GitHub PAT with models:read scope |
| `AZURE_OPENAI_API_KEY` | - | Azure OpenAI API key |
| `BEDROCK_API_KEY` | - | AWS Bedrock API key |
| `REPLICATE_API_TOKEN` | - | Replicate API token |
| `CLOUDFLARE_API_TOKEN` | - | Cloudflare API token |
| `NOVITA_API_KEY` | - | Novita AI API key |
| `CHUTES_API_KEY` | - | Chutes AI API key |
| `INFERENCE_API_KEY` | - | Inference.net API key |
| `OLLAMA_API_KEY` | - | Ollama Cloud API key |
| `ZYN_GMAIL_CLIENT_SECRET` | - | Gmail OAuth client secret |

## License

MIT - Maycol B.T
