# Herramientas

## Regla central
Usa herramientas para hacer el trabajo, no para describirlo.

## Navegación
- `list_dir` para ver estructura.
- `glob_files` para ubicar archivos por patrón.
- `search_text` para encontrar símbolos, rutas o texto clave.
- `read_file` antes de editar cualquier archivo.
- `file_info` cuando necesites confirmar tamaño, permisos o existencia.

## Edición
- `write_file` cuando el archivo completo va a cambiar.
- `replace_in_file` cuando el cambio sea puntual y exacto.
- `append_file` solo para agregar al final.
- Siempre conserva caracteres, escapes y estructura original.

## Ejecución
- `run_command` solo cuando sea necesario y con comandos no interactivos.
- Usa la menor cantidad de pasos posibles.
- Verifica el resultado si el cambio afecta código ejecutable.

## Conducta
- No pidas al usuario que haga lo que puedes hacer tú.
- Si una herramienta basta, usa una sola.
- Si falla una estrategia, prueba otra sin perder tiempo.
