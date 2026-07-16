# AGENTS.md — Zyn Agent

This file is the working guide for AI coding agents contributing to **Zyn**. It describes what the project is, how the repository is organized, where the real runtime state lives, and how to safely extend the agent, providers, plugins, MCP servers, skills, CLI, TUI, and web UI.

## 1) What Zyn is

Zyn is a production-oriented terminal AI agent. It is not a chat wrapper. It is built to:

- run real tools,
- manage persistent sessions and memory,
- connect to many LLM providers,
- load plugins,
- connect to MCP servers,
- expose a web UI,
- and provide a TUI / CLI experience for day-to-day development work.

The project is designed around practical automation. When you work in this repository, optimize for correctness, stability, and maintainability over cleverness.

## 2) Source of truth

When something conflicts, use this order:

1. `src/` code
2. `package.json`
3. runtime-aware config and support files in `.github/`
4. `README.md` and other docs
5. bundled data in `data/`

Important facts from the codebase:

- `package.json` declares `type: commonjs`.
- `package.json` requires Node.js `>=22`.
- The CLI entry point is `zyn.js`.
- The TUI lives in `src/tui/app.mjs` and is ESM.
- The rest of the runtime is mostly CommonJS.
- The README is useful, but it can lag behind the implementation.
- If README and code disagree, trust the code.

## 3) What lives where

### Entry points
- `zyn.js` — process entry point.
- `src/cli/runtime.js` — interactive CLI loop and single-prompt mode.
- `src/core/agent.js` — main agent turn loop and tool execution flow.
- `src/web/server.js` — web app server.
- `src/tui/app.mjs` — Ink/React terminal UI.

### Core layers
- `src/core/prompts.js` — system prompt assembly, conversation shaping, tool and plugin prompt text.
- `src/core/skills.js` — skill discovery, frontmatter parsing, on-demand loading.
- `src/tools/index.js` — built-in tools and tool execution.
- `src/providers/` — model/provider adapters and provider catalog.
- `src/plugins/index.js` — plugin discovery and registration.
- `src/mcp/client.js` — MCP client and tool injection.
- `src/utils/` — persistence, text helpers, background jobs, secrets, transcripts, Gmail auth, path helpers.
- `src/web/` — collaborative web app, auth, storage, and browser UI assets.
- `src/public/` — shared helper assets for the web surface.

### Bundled data
- `data/skills/` — bundled skills.
- `data/models.json` — bundled model catalog fallback.
- `data/README.md` — notes about packaged data.

### GitHub config
- `.github/FUNDING.yml`
- `.github/dependabot.yml`
- `.github/workflows/publish.yml`

## 4) Runtime data and persistence

Zyn stores runtime data outside the repository by default.

Default user data root:
- Linux/macOS: `~/.zyn/`
- Windows: `C:\Users\<User>\\.zyn\\`
- Override with `ZYN_DATA_DIR`

Main runtime locations used by the code:

- `~/.zyn/chat/`
  - `sessions/`
  - `current-session.json`
  - `persistent-config.json`
  - `transcripts/`
  - `exports/`
  - `background/`
- `~/.zyn/config/`
  - `providers.json`
  - `models.json`
  - `mcp-servers.json`
- `~/.zyn/plugins/`
- `~/.zyn/web/`
- `~/.zyn/tasks.json`
- `~/.zyn/gmail-auth.json`

Do not treat runtime data as source code. Do not write project changes into `~/.zyn/` unless the feature explicitly belongs there.

## 5) Development commands

These are the practical commands that matter most in this repo:

```bash
npm install
npm start
npm run dev
npm run check
```

Other common entry points:

```bash
node zyn.js
npx zyn-ai
zyn
zyn "your prompt"
zyn --new
zyn --resume <ID>
```

Use `npm run check` before finishing changes that touch runtime logic, parsers, tools, prompts, or provider adapters.

## 6) How the agent works

Zyn is built around a loop:

1. Build a system prompt from repo context, skills, providers, tools, plugins, and MCP tools.
2. Send conversation messages to the active model/provider.
3. Parse responses into comments, direct actions, or tool calls.
4. Execute built-in tools, plugin tools, or MCP tools.
5. Store session state, transcript data, and memory summary.
6. Render output through the CLI/TUI/web surface.

Do not change any part of this loop casually. Small prompt changes can break tool parsing, streaming, or tool call behavior.

### Important behavior rules
- Preserve streaming behavior.
- Preserve cancel/abort behavior.
- Preserve session resume behavior.
- Preserve memory compaction behavior.
- Preserve tool-step limits and timeout handling.
- Preserve language handling (`en` / `es`).
- Preserve the distinction between assistant text, comments, and tool calls.

## 7) Built-in tool model

The built-in tool catalog in `src/tools/index.js` includes file, search, shell, web, upload, Gmail, Git, memory, skill loading, and user-prompt tools. The main tool families are:

- filesystem navigation: `list_dir`, `read_file`, `search_text`, `glob_files`, `file_info`
- editing: `write_file`, `append_file`, `replace_in_file`, `make_dir`
- execution: `run_command`
- web: `fetch_url`, `fetch`, `fetch_http`, `webfetch`, `scrape_site`, `web_search`, `web_read`
- uploads: `upload_file`
- integrations: `gmail`, `git`
- agent helpers: `load_skill`, `memory`, `ask_user`

Rules for tool changes:

- If you add a tool, update the implementation, the tool prompt text, the parser, and any allowlist / known-tool sets.
- If you rename a tool, update every place that checks exact tool names.
- If you change tool arguments, update the prompt examples and validation logic together.
- Keep tool results structured and machine-readable.

## 8) Skills

Skills are stored as folders containing `SKILL.md` with YAML frontmatter.

Current bundled skill categories:
- `core`
- `tools`
- `reasoning`
- `thinking`
- `testing`
- `debugging`
- `methodology`
- `completion`
- `code-style`
- `domains`
- `frontend-design`
- `game-dev`

How skills work in this repo:

- Only the skill index is preloaded.
- Full skill content is loaded on demand with the `load_skill` tool.
- `src/core/skills.js` parses the frontmatter and can also include extra code/text files from the skill folder.
- Skills are meant to be reusable guidance and task-specific context.

When editing skills:
- keep the frontmatter valid,
- keep names stable,
- avoid bloating the index with duplicated instructions,
- and keep skill bodies focused on one task family.

## 9) Providers and models

Zyn supports **27 provider families** and **414 built-in models** in the current codebase.

Provider families currently represented in `src/config.js` include:

- `anthropic`
- `azure`
- `bedrock`
- `chutes`
- `cohere`
- `deepseek`
- `fireworks`
- `gemini`
- `github`
- `groq`
- `huggingface`
- `inference`
- `lmstudio`
- `mistral`
- `novita`
- `ollama`
- `ollamaCloud`
- `openai`
- `openrouter`
- `perplexity`
- `qwenapi`
- `replicate`
- `together`
- `vertex`
- `xai`
- `zen`
- `zyncloud`

Rules for provider work:

- Provider config lives in `~/.zyn/config/providers.json`.
- Model config lives in `~/.zyn/config/models.json`.
- MCP server config lives in `~/.zyn/config/mcp-servers.json`.
- If you add a provider or model, update the catalog, prompts, selectors, and any documentation that exposes the list.
- Keep the OpenAI-compatible provider path stable where possible.
- Keep streaming behavior consistent across providers.
- Never hardcode secrets in code or docs.

### Provider configuration commands
- `/providers` — interactive provider selector
- `/provider set <name> <field> <value>`
- `/provider remove <name>`
- `/provider sync <name>`
- `/models` — interactive model picker

### Practical provider rules
- The default model key in code can be controlled by `ZYN_DEFAULT_MODEL`; the current code default is `zyncloud-minimax-m3`.
- `ZYN_DEFAULT_LANG` and `ZYN_LANGUAGE` influence the default UI language.
- `ZYN_REQUEST_TIMEOUT_MS`, `ZYN_MAX_TOOL_STEPS`, `ZYN_MAX_HISTORY_CHARS`, and related environment variables tune runtime limits.
- If you touch retries or streaming, verify both the happy path and a failure path.

## 10) Plugins

Zyn plugins are loaded from the user data directory, not from the repository:

- plugin root: `~/.zyn/plugins/`
- installed packages live under `~/.zyn/plugins/node_modules/`

How plugins are discovered in the current loader:

- the loader scans installed packages,
- reads `manifest.json`,
- loads the package main file,
- expects an exported `register(ctx)` function,
- and uses `ctx.registerTool(def)` to expose custom tools.

The loader prefixes plugin tool names as:

```text
plugin_<package-name>_<tool-name>
```

### Minimal plugin structure

```text
my-plugin/
├── package.json
├── manifest.json
└── index.js
```

### package.json example

```json
{
  "name": "zyn-plugin-example",
  "version": "1.0.0",
  "main": "index.js"
}
```

### manifest.json example

```json
{
  "name": "zyn-plugin-example",
  "version": "1.0.0",
  "type": "tool",
  "description": "Adds a custom Zyn tool",
  "author": "you"
}
```

### index.js example

```js
module.exports.register = function register(ctx) {
  ctx.registerTool({
    name: 'hello',
    description: 'Return a friendly greeting',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    },
    fn: async (args) => {
      return { message: `Hello, ${args.name || 'world'}!` };
    }
  });
};
```

### Plugin rules
- Review plugin source before installing.
- Treat plugins as powerful and potentially behavior-changing.
- Do not assume the manifest `type` is enforced by runtime code; the real loading contract is `manifest.json` + `main` + `register(ctx)`.
- Keep plugin tool names short, stable, and specific.
- Do not break existing plugin tool prefixes or discovery logic.
- If you change plugin loading, update plugin prompts and any plugin manager UI text together.

## 11) MCP servers

MCP support lets Zyn connect to external tool servers.

Current user-configured MCP server file:
- `~/.zyn/config/mcp-servers.json`

The runtime can accept MCP configuration in JSON form and then inject discovered tools into the agent prompt.

### Practical MCP connection pattern

```bash
/mcp connect {"name":"deepwiki","url":"https://mcp.deepwiki.com/mcp"}
/mcp connect {"name":"local","url":"http://localhost:8080"}
/mcp connect {"name":"fs","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","."]}
```

### MCP config fields you should support
- `name` — required stable server name
- `url` — HTTP / SSE / streamable HTTP endpoint
- `command` + `args` — stdio server process
- `headers` — optional request headers
- `env` — optional environment variables for stdio servers
- `cwd` — optional working directory for stdio servers
- `protocol` or `format` — optional transport hint

### MCP tool naming
Discovered MCP tools are exposed with exact names such as:

```text
mcp_<server>_<tool>
```

Rules for MCP changes:

- Keep the JSON config format copy/paste friendly.
- Do not rename tool prefixes unless you also update the prompt builder and parser.
- When a server is connected, the agent prompt should list the tools clearly.
- If you add transport support, preserve backward compatibility with existing server configs.

## 12) Web UI

The web surface lives under `src/web/` and is a real application, not a static page.

Key files:
- `src/web/server.js`
- `src/web/webAgent.js`
- `src/web/store.js`
- `src/web/githubApi.js`
- `src/web/public/`

Important web facts:

- The server uses Express and session-based auth.
- Session data and web secrets are stored under the user data root.
- The web agent builds its own prompt with repo tree and skills context.
- Web UI changes should be treated as product changes, not just cosmetic changes.

When editing the web UI:
- preserve auth flow,
- preserve session persistence,
- preserve collaboration behavior,
- and verify that the UI still boots cleanly.

## 13) TUI

The terminal UI lives in `src/tui/app.mjs`.

Guidelines:
- Keep the TUI clean and readable.
- Avoid emojis in terminal output.
- Preserve keyboard navigation, selection, and resize behavior.
- Preserve streaming and thinking indicators.
- Keep layouts responsive across terminal sizes.
- Keep React / Ink code in ESM style.

If you change the TUI:
- verify interactive selection still works,
- verify prompt rendering still works,
- and verify the CLI fallback still behaves correctly in non-TTY environments.

## 14) Commands and user-facing behavior

The CLI supports a large set of slash commands. The most important ones are:

- `/help`
- `/status`
- `/history`
- `/memory` and `/summary`
- `/session`
- `/sessions`
- `/new`
- `/resume`
- `/title` and `/rename`
- `/models`
- `/providers`
- `/provider`
- `/git`
- `/gmail`
- `/persona`
- `/lang` / `/language`
- `/auto`
- `/config`
- `/bg`
- `/undo`
- `/redo`
- `/stop` / `/abort`
- `/reset` / `/clear`
- `/cwd`
- `/compact`
- `/theme`
- `/thinking`
- `/plugins`
- `/mcp`
- `/settings`
- `/transcript`
- `/export`
- `/exit` / `/quit`

Rules:
- If you add or remove a command, update help text, translations, and any selector UI.
- Keep English and Spanish strings aligned.
- Keep command names stable when possible.

## 15) Coding conventions

- Prefer small, targeted changes.
- Match the surrounding style in the touched file.
- Keep CommonJS in `.js` files unless the file is already ESM.
- Keep `src/tui/app.mjs` in ESM.
- Keep runtime messages translatable when they are user-facing.
- Avoid introducing unnecessary dependencies.
- Use existing utilities before inventing new ones.
- Preserve current file and directory naming conventions.

## 16) Security and secrets

- Never commit secrets.
- Never hardcode API keys.
- Never log private tokens or auth headers.
- Treat plugin and MCP installation as security-sensitive.
- Do not bypass auth or access-control checks in the web UI.
- Do not delete or rewrite user data unless the task explicitly requires it.

## 17) Validation

Before closing a change, validate what matters for the area you touched:

### For parser / prompt / tool / agent changes
- `npm run check`
- a manual smoke test in the CLI
- a tool-call or provider path test if applicable

### For provider changes
- verify model listing
- verify a real request path
- verify streaming or error fallback

### For plugin changes
- verify plugin discovery
- verify manifest loading
- verify tool registration name prefix
- verify reload / uninstall behavior if touched

### For MCP changes
- verify config parsing
- verify server connection
- verify tool discovery
- verify exact tool names in the prompt

### For web UI changes
- verify the server boots
- verify auth/session flow
- verify one end-to-end chat path

### For TUI changes
- verify basic rendering in a TTY
- verify non-TTY fallback
- verify selection / navigation behavior

## 18) Change checklist

### If you change commands
Update:
- `src/cli/commands.js`
- help text
- translations
- any command selectors or labels

### If you change tools
Update:
- `src/tools/index.js`
- `src/core/prompts.js`
- `src/core/agent.js`
- any parser logic that recognizes tool calls
- docs/examples if tool syntax changed

### If you change providers or models
Update:
- `src/config.js`
- provider adapters under `src/providers/`
- `src/providers/catalog.js`
- any model picker / provider selector UI
- docs that describe provider capabilities

### If you change plugins
Update:
- `src/plugins/index.js`
- plugin manager commands
- plugin help text
- examples in docs or AGENTS if the contract changes

### If you change MCP
Update:
- `src/mcp/client.js`
- config migration / parsing logic
- prompt injection text
- command help and examples

### If you change session / memory / transcripts
Update:
- `src/utils/sessionStorage.js`
- `src/utils/transcriptStorage.js`
- any files that reference user data paths
- export / resume / summary behavior

### If you change the web UI
Update:
- `src/web/server.js`
- `src/web/webAgent.js`
- `src/web/store.js`
- `src/web/public/`
- auth/session handling if relevant

## 19) Final rule

Before making a conclusion, inspect the code that actually runs. Do not guess, do not invent paths, do not invent commands, and do not assume the README is current.
