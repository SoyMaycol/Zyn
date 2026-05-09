# Skill: FFmpeg Total Control

Objetivo: usar la tool `video_studio` como interfaz de control total de FFmpeg/FFprobe para cualquier flujo multimedia (audio, video, conversión, transcode, extracción, remux, inspección técnica).

## Acciones
- `probe`: inspecciona metadatos con ffprobe.
- `run`: ejecuta argumentos FFmpeg libres (control absoluto).
- `run_profile`: ejecuta un perfil JSON reutilizable con `args`.

## Reglas de uso profesional
1. Primero inspecciona con `probe` para conocer streams, codecs, fps, bitrate y duración.
2. Construye comando explícito con `run` y `args` completos.
3. Para automatización repetible, guarda un perfil JSON y ejecuta con `run_profile`.
4. Define `timeoutMs` apropiado para tareas largas.

## Ejemplos rápidos
- Extraer audio:
  - `action=run`, `args=["-i","input.mp4","-vn","-c:a","libmp3lame","out.mp3"]`
- Convertir contenedor sin recodificar:
  - `action=run`, `args=["-i","input.mkv","-c","copy","output.mp4"]`
- Reescalar video:
  - `action=run`, `args=["-i","input.mp4","-vf","scale=1280:720","-c:v","libx264","-crf","20","output.mp4"]`
