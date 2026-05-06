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
  <b>Agente local para terminal, TUI y web con múltiples proveedores de IA.</b>
</p>

<p align="center">
  <a href="https://github.com/SoyMaycol/Zyn">Repositorio oficial</a>
</p>

## Qué es Zyn

Zyn es un agente local para trabajar desde la terminal o desde una interfaz web. Mantiene sesiones persistentes, puede ejecutar herramientas del sistema, recuerda contexto compacto, exporta transcripciones y permite usar modelos de distintos proveedores configurados en el proyecto.

## Requisitos

- Node.js 18 o superior.
- npm.
- Conexión a internet para proveedores remotos.
- Opcional: Ollama si quieres usar modelos locales.

## Instalación

### Instalación global

```bash
npm install -g zyn-ai
zyn
```

### Desarrollo local

```bash
git clone https://github.com/SoyMaycol/Zyn.git
cd Zyn
npm install
npm start
```

## Uso real desde la terminal

```bash
zyn                 # abre la TUI interactiva
zyn "pregunta"      # ejecuta un prompt directo en modo CLI clásico
zyn --new           # crea una sesión nueva antes de abrir Zyn
zyn --resume ID     # reanuda una sesión guardada por ID
```

### Direct prompt

```bash
zyn "Explain this project"
```

### Open the web version

Inside Zyn:

```text
/web
/web 0.0.0.0:3000
```

Or directly from the project:

```bash
npm run web
# or
node src/web/server.js
```

## Idioma

El idioma se guarda en la configuración de la sesión. Los idiomas soportados son `en` y `es`.

```text
/lang              # muestra el idioma actual
/lang en           # cambia a inglés
/lang es           # cambia a español
/language es       # alias de /lang
/config lang en    # cambia el idioma desde /config
```

## Language selection

Use these commands inside Zyn:

```text
/lang
/lang en
/lang es
/language es
/config lang en
```

English is the default unless `ZYN_DEFAULT_LANG`, `ZYN_LANGUAGE`, or the environment locale resolves to another supported language.

## Main commands

### Sessions

| Command | Description |
|---------|-------------|
| `/help` | Shows full command list with descriptions |
| `/status` | Current status: model, language, session, queue, and working directory |
| `/history` | Recent session actions |
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
| `/model` / `/model <key>` | View or change the active model |
| `/models` | Lists available models |
| `/providers` | Lists detected providers |
| `/lang <en\|es>` | Changes interface language |
| `/language <en\|es>` | Alias of `/lang` |
| `/config show` | Shows current session configuration |
| `/config lang <en\|es>` | Changes language from config |
| `/config model <key>` | Changes model from config |
| `/auto` / `/auto on` / `/auto off` | Views or changes auto-approval for tool calls |
| `/persona show` / `/persona set <text>` | Shows or sets custom response tone/personality |
| `/persona reset` | Resets personality to system default |
| `/concuerdo` | Toggles group model mode |
| `/config auto on\|off` | Changes auto-approval from config |
| `/config group on\|off` | Changes group model mode from config |
| `/config cwd <path>` | Changes working directory from config |

### Tools and Git

| Command | Description |
|---------|-------------|
| `/tools` | Lists available agent tools |
| `/skills` | Lists loaded agent skills |
| `/git help` | Shows Git credential help |
| `/git set <provider> <token> [username] [apiBaseUrl:URL] [cloneBaseUrl:URL] [name:N]` | Configures Git credentials for `github`, `gitlab`, or `custom` |
| `/git list` | Lists configured git profiles (tokens hidden) |
| `/git remove <provider> [name]` | Removes credentials for a provider/profile |
| `/cwd` | Shows current working directory |
| `/cwd <path>` | Changes current working directory |

### Web and export

| Command | Description |
|---------|-------------|
| `/web` | Opens the web version on `127.0.0.1:3000` |
| `/web <host:port>` | Opens the web version on a custom host/port |
| `/transcript` | Views the full session transcript |
| `/export` | Exports session to a text file |
| `/export <path>` | Exports session to a specific path |

### Control

| Comando | Qué hace |
|---|---|
| `/stop` | Detiene el turno actual del agente. |
| `/abort` | Alias de `/stop`. |
| `/reset` | Limpia historial, acciones, contador de turnos y memoria compactada. |
| `/clear` | Alias de `/reset`. |
| `/exit` | Sale de Zyn. |
| `/quit` | Alias de `/exit`. |

En la TUI, pulsa `ESC` dos veces durante un turno para detener al agente.

## Proveedores y modelos

Zyn incluye modelos integrados para estos proveedores:

Models can be extended from `data/models.json` or from the internal configuration. If `data/models.json` does not exist, use `data/models.example.json` as the shape reference.

Puedes extenderlos con `data/models.json`. Si no existe, puedes copiar la estructura de `data/models.example.json`.

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

The unified `git` tool provides complete control over any configured provider. The file-reading tool supports up to 5000 lines per `read_file` call; for large files, use `startLine` and `endLine`.

The Git tool supports:

- **action="api"**: Any HTTP operation (GET, POST, PATCH, PUT, DELETE) against the provider API.
- **action="clone"**: Clone repositories with configured credentials.

No hardcoded actions. Choose `method` and `path` freely based on your APIKey permissions. Configure credentials with `/git set <provider> <token> [username] [apiBaseUrl:URL] [cloneBaseUrl:URL] [name:N]`.

## Web collaboration

El agente puede usar herramientas como lectura/búsqueda de archivos, escritura, edición, comandos del sistema, HTTP, scraping, búsqueda web, generación de imágenes con canvas/Jimp y operaciones Git. La herramienta `read_file` permite leer hasta 5000 líneas por llamada; para archivos grandes conviene usar `startLine` y `endLine`.

## Git desde herramientas

La herramienta interna `git` permite:

- `action="api"`: ejecutar operaciones HTTP contra la API configurada del proveedor (`method`, `path`, `body`, etc.).
- `action="clone"`: clonar repositorios usando credenciales guardadas.

Las credenciales se gestionan con los comandos `/git` mostrados arriba.

## Scripts de desarrollo

```bash
npm start      # inicia Zyn
npm run dev    # alias de npm start
npm run web    # inicia el servidor web
npm run check  # valida sintaxis de zyn.js y src/cli/runtime.js
```
