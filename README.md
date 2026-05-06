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

También puedes iniciar el servidor web directamente:

```bash
npm run web
# o
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

## Comandos disponibles

Estos comandos son los que reconoce actualmente la CLI/TUI.

### Sesiones e información

| Comando | Qué hace |
|---|---|
| `/help` | Muestra la ayuda completa. |
| `/status` | Muestra estado actual de sesión, modelo, idioma, cwd y cola. |
| `/history` | Muestra acciones recientes. |
| `/memory` | Muestra la memoria compactada del agente. |
| `/summary` | Alias de `/memory`. |
| `/session` | Muestra información de la sesión actual. |
| `/sessions` | Lista sesiones guardadas. |
| `/new` | Crea una sesión nueva. |
| `/resume <ID>` | Reanuda una sesión guardada. |
| `/title <texto>` | Renombra la sesión actual. |
| `/rename <texto>` | Alias de `/title`. |

### Configuración

| Comando | Qué hace |
|---|---|
| `/model` | Muestra el modelo activo. |
| `/model <key>` | Cambia el modelo activo. |
| `/models` | Lista los modelos disponibles. |
| `/providers` | Lista proveedores detectados y sus modelos. |
| `/lang` | Muestra el idioma actual. |
| `/lang <en\|es>` | Cambia el idioma. |
| `/language <en\|es>` | Alias de `/lang`. |
| `/auto` | Muestra si la auto-aprobación está activa. |
| `/auto on` | Activa auto-aprobación de herramientas. |
| `/auto off` | Desactiva auto-aprobación. |
| `/concuerdo` | Alterna el modo de grupo donde varios modelos colaboran. |
| `/persona show` | Muestra la persona/tono activo. |
| `/persona set <texto>` | Define la persona/tono de respuesta. |
| `/persona reset` | Restaura la persona por defecto. |
| `/config show` | Muestra configuración de sesión. |
| `/config lang <en\|es>` | Cambia el idioma. |
| `/config model <key>` | Cambia el modelo. |
| `/config auto on\|off` | Activa o desactiva auto-aprobación. |
| `/config group on\|off` | Activa o desactiva modo de grupo. |
| `/config cwd <path>` | Cambia el directorio de trabajo. |

### Herramientas, Git y directorio

| Comando | Qué hace |
|---|---|
| `/tools` | Lista herramientas disponibles para el agente. |
| `/skills` | Lista skills cargadas. |
| `/git help` | Muestra ayuda de credenciales Git. |
| `/git list` | Lista credenciales Git guardadas con tokens ocultos. |
| `/git set <provider> <token> [username] [apiBaseUrl:URL] [cloneBaseUrl:URL] [name:N]` | Guarda credenciales para `github`, `gitlab` o `custom`. |
| `/git remove <provider> [name]` | Elimina credenciales Git. |
| `/cwd` | Muestra el directorio de trabajo actual. |
| `/cwd <path>` | Cambia el directorio de trabajo. |

Ejemplos reales de Git:

```text
/git set github ghp_xxxxx
/git set gitlab glpat_xxxxx mi_usuario
/git set custom token_xxxxx mi_usuario apiBaseUrl:https://git.empresa.com/api/v4 cloneBaseUrl:https://git.empresa.com name:empresa
/git list
/git remove github
/git remove custom name:empresa
```

### Web, transcripción y exportación

| Comando | Qué hace |
|---|---|
| `/web` | Inicia la versión web en `127.0.0.1:3000`. |
| `/web <host:port>` | Inicia la versión web en host/puerto personalizado. |
| `/transcript` | Muestra una vista previa de la transcripción. |
| `/export` | Exporta la transcripción a un archivo `.txt`. |
| `/export <path>` | Exporta la transcripción a una ruta específica. |

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

- Qwen.
- Zen.
- Ollama.
- Proveedores compatibles con OpenAI.

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

## Herramientas del agente

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
