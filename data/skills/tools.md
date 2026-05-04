# Herramientas disponibles

## Lectura y navegacion

list_dir { path? }
  Lista archivos y carpetas del directorio, ordenados. Sin path usa cwd.
  Usa esto PRIMERO para entender la estructura de un proyecto.
  Ejemplo: {"type":"tool","tool":"list_dir","args":{"path":"src"}}

read_file { path, startLine?, endLine? }
  Lee archivo con numeros de linea. Maximo 250 lineas por llamada.
  Para archivos grandes, lee por secciones con startLine/endLine.
  SIEMPRE lee antes de editar.
  Ejemplo lectura parcial: {"type":"tool","tool":"read_file","args":{"path":"src/app.js","startLine":1,"endLine":50}}

search_text { pattern, path?, glob? }
  Busqueda regex en archivos (motor ripgrep). Rapido incluso en proyectos grandes.
  - pattern: expresion regular (ej: "function\s+\w+", "TODO|FIXME|HACK")
  - path: directorio base de busqueda (default: cwd)
  - glob: filtro de archivos (ej: "*.js", "*.{ts,tsx}", "src/**/*.py")
  Ejemplo: {"type":"tool","tool":"search_text","args":{"pattern":"import.*express","path":".","glob":"*.js"}}
  NOTA: pattern es regex. Escapa caracteres especiales: \., \(, \[, etc.

glob_files { pattern, path? }
  Encuentra archivos por patron glob. No busca contenido, solo nombres.
  Patrones: * (cualquier nombre), ** (cualquier profundidad), ? (un caracter)
  Ejemplos utiles:
  - Todos los JS: {"type":"tool","tool":"glob_files","args":{"pattern":"**/*.js"}}
  - Tests: {"type":"tool","tool":"glob_files","args":{"pattern":"**/*.test.*"}}
  - Configs: {"type":"tool","tool":"glob_files","args":{"pattern":"*config*"}}
  NOTA: pattern NO es regex. Es glob (*, **, ?). No uses \s, \d, etc.

file_info { path }
  Metadata de archivo: tamano, tipo (file/directory), permisos, fechas.
  Util para verificar que un archivo existe antes de operar.

## Escritura y edicion

write_file { path, content }
  Crea archivo nuevo o sobrescribe existente. Crea directorios padre automaticamente.
  PELIGROSO: sobrescribe sin preguntar. Verifica que el path es correcto.
  Usa para: crear archivos nuevos, reescribir archivos pequenos completamente.
  CRITICO — preserva TODOS los caracteres del codigo fuente:
  - Template literals con backtick: `texto ${variable}` (el backtick es literal en JSON)
  - Operadores aritmeticos: *, +, -, /, %, **
  - Operadores logicos: &&, ||, !, ??
  - Regex: /patron/flags
  - Caracteres especiales: ~, ^, |, &
  - NUNCA omitas, simplifiques ni resumas caracteres del codigo
  Ejemplo: {"type":"tool","tool":"write_file","args":{"path":"src/utils.js","content":"const add = (a, b) => a + b;\nmodule.exports = { add };"}}

append_file { path, content }
  Agrega contenido al FINAL de un archivo existente. No modifica lo existente.
  Usa para: agregar entradas a logs, nuevas funciones al final de un modulo.

replace_in_file { path, search, replace, all? }
  Reemplaza texto literal en archivo. NO es regex, es match exacto.
  CRITICO: search debe coincidir CARACTER POR CARACTER con el archivo, incluyendo
  espacios, tabs, saltos de linea, e indentacion. Copia del read_file tal cual.
  - all: true reemplaza TODAS las coincidencias, false solo la primera (default).
  Si falla: relee el archivo, probablemente el texto cambio o tiene whitespace diferente.
  Ejemplo: {"type":"tool","tool":"replace_in_file","args":{"path":"src/app.js","search":"const PORT = 3000;","replace":"const PORT = process.env.PORT || 3000;"}}

make_dir { path }
  Crea directorio y todos los directorios padre necesarios.

## Ejecucion

run_command { command }
  Ejecuta comando en bash. Timeout: 2 minutos. Retorna { exitCode, stdout, stderr }.
  Directorio de trabajo: el cwd actual del agente.
  REGLAS:
  - Siempre usa flags no-interactivos: -y, --yes, --no-pager, --quiet
  - DEBIAN_FRONTEND=noninteractive para apt
  - Encadena con && para operaciones secuenciales
  - Limita output largo: | head -50, | tail -20, | grep "patron"
  - Para procesos largos, considera timeout o background (&)
  Ejemplo: {"type":"tool","tool":"run_command","args":{"command":"npm install express && npm test"}}

## Web y scraping

fetch_url { url, selector?, attribute?, limit? }
  Descarga pagina web y extrae contenido.
  Modos de uso:
  - Sin selector: retorna HTML completo (util para inspeccionar estructura).
  - Con selector CSS: extrae texto de los elementos que coinciden.
  - Con selector + attribute: extrae un atributo (href, src, class, etc).
  - limit: maximo de elementos a extraer (default: 20, max: 50).
  Selectores CSS comunes: "h1", ".clase", "#id", "a", "div.card > h2", "meta[name=description]"
  Estrategia de scraping:
  1. Primero fetch sin selector para ver el HTML y entender la estructura.
  2. Luego fetch con selector especifico para extraer lo que necesitas.
  Ejemplo: {"type":"tool","tool":"fetch_url","args":{"url":"https://example.com","selector":"h1"}}

fetch { url, method?, headers?, query?, json?, data?, form?, files?, timeoutMs? }
  Cliente HTTP avanzado profesional. Permite headers personalizados, metodos, body JSON y adjuntos.
  Ejemplo: {"type":"tool","tool":"fetch","args":{"url":"https://api.example.com/items","method":"POST","headers":{"Authorization":"Bearer TOKEN"},"json":{"name":"demo"}}}

webfetch { url, headers?, timeoutMs? }
  Descarga una pagina y la devuelve en Markdown estructurado (titulos, texto, links, botones e imagenes).
  Ejemplo: {"type":"tool","tool":"webfetch","args":{"url":"https://example.com"}}

## Imagen profesional con Jimp (control total)

create_canvas_image { width, height, background?, elements?, format?, outputPath? }
  Genera imagenes desde cero con Jimp usando capas y composicion precisa.
  NO es un "canvas" limitado: aqui se controla toda la imagen final por parametros.
  Recomendado para banners, portadas, assets de marketing y reportes empresariales.

  Parametros clave:
  - width, height: obligatorios (pixeles)
  - background: color HEX (#RRGGBB o #RRGGBBAA)
  - elements: lista de capas (rect, line, circle/ellipse, text, image)
  - format: png/jpg/webp/bmp/gif/tiff
  - outputPath: ruta final de salida

  Flujo profesional:
  1) Define tamano y fondo segun canal de salida (web, presentacion, reporte).
  2) Crea capas base (rect/circle/line) para jerarquia visual.
  3) Inserta imagenes de referencia con posiciones y dimensiones exactas.
  4) Agrega tipografia y mensajes clave (text) con espaciado consistente.
  5) Exporta en formato final y valida peso/calidad.

  Ejemplo:
  {"type":"tool","tool":"create_canvas_image","args":{"width":1600,"height":900,"background":"#0b1020","format":"png","outputPath":"generated/board-q2.png","elements":[{"type":"rect","x":40,"y":40,"w":1520,"h":820,"radius":24,"fill":"#111827"},{"type":"text","x":96,"y":100,"fontSize":32,"text":"Executive Business Dashboard"},{"type":"line","x1":96,"y1":160,"x2":1504,"y2":160,"stroke":"#334155"}]}}

## Seleccion de herramienta

Pregunta: "donde se usa X?" → search_text con patron
Pregunta: "que archivos hay?" → list_dir o glob_files
Pregunta: "que dice este archivo?" → read_file
Pregunta: "ejecuta esto" → run_command
Pregunta: "crea/edita archivo" → read_file primero, luego write_file o replace_in_file
Pregunta: "descarga/scrapea" → fetch_url
Pregunta: "crea imagen profesional" → create_canvas_image con capas y parametros exactos

## Flujo profesional para proyectos (no usar una sola tool)

1) Descubrir contexto: `list_dir` + `search_text`
2) Entender detalle: `read_file` o `webfetch`
3) Ejecutar cambios: `write_file` / `replace_in_file` / `run_command`
4) Validar resultados: `run_command` (tests/checks)
5) Entregar resumen: cambios, riesgos, siguientes pasos
