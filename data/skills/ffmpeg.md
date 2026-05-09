# Skill: FFmpeg

Objetivo: que el agente use la tool `ffmpeg` con control total, sin asumir un caso fijo ni limitarse a una sola tarea multimedia.

## Cuándo usarla
Usa `ffmpeg` para convertir, inspeccionar, extraer, mezclar, unir, recortar, normalizar o generar audio/video y otros archivos multimedia.

## Acciones
- `probe` / `inspect`: leer streams, codec, duración, bitrate, fps y metadata.
- `run`: ejecutar FFmpeg con `args` libres y exactos.
- `run_profile`: reutilizar una receta JSON.
- `concat`: unir varios archivos en una sola salida.

## Regla de trabajo
1. Inspecciona cuando haya dudas técnicas.
2. Arma el comando exacto con `run` cuando necesites control total.
3. Usa `concat` para uniones reales de archivos.
4. Usa `run_profile` cuando la misma receta vaya a repetirse.

## Criterios prácticos
- Conserva flujo sin recodificar cuando sea posible: `-c copy`.
- Para compatibilidad amplia en video: `libx264`, `yuv420p`, `+faststart`.
- Para audio con nivel consistente: `loudnorm`.
- Verifica siempre que la salida final exista y que FFmpeg haya terminado bien.

## Cómo pensar antes de ejecutar
- Identifica si la tarea es convertir, extraer, unir, limpiar, comprimir, normalizar o generar media.
- Determina si hace falta conservar calidad o priorizar velocidad.
- Decide si conviene copiar streams o recodificar.
- Si el objetivo no está claro, inspecciona primero con `probe`.

## Decisiones técnicas útiles
- Si el contenido ya está en el formato correcto, evita recodificar.
- Si la salida será para web, busca compatibilidad y metadatos correctos.
- Si el audio necesita consistencia, normalízalo.
- Si hay varias piezas, une con `concat` o con una lista temporal bien construida.

## Buenas prácticas de comandos
- Siempre usa rutas claras de entrada y salida.
- Usa `run_profile` para procesos repetidos.
- Prefiere argumentos explícitos y reproducibles.
- Valida el resultado final, no solo la ejecución.

## Objetivo del agente
No improvisar una receta genérica. Elegir el flujo correcto, construir el comando preciso y comprobar el resultado real.