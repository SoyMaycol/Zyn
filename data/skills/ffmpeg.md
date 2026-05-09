# Skill: FFmpeg Total Pro

Objetivo: usar la tool `ffmpeg` con control total para producir audio/video profesional: conversión limpia, extracción de pistas, mejora de sonido, normalización, render y generación.

## Acciones
- `probe`: inspección técnica completa con ffprobe.
- `run`: ejecución libre de argumentos FFmpeg.
- `run_profile`: ejecución desde JSON reusable.

## Casos recomendados
- Convertir formatos audio/video sin perder compatibilidad.
- Generar audio final para podcast o música con normalización loudness.
- Extraer audio, subtítulos o frames.
- Renderizar video para redes sociales o web con codecs correctos.

## Ejemplos útiles
- Audio limpio (normalización EBU R128):
  - `args=["-i","input.wav","-af","loudnorm=I=-16:LRA=11:TP=-1.5","-c:a","aac","output.m4a"]`
- Conversión universal video web:
  - `args=["-i","input.mov","-c:v","libx264","-crf","20","-preset","medium","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","output.mp4"]`
- Extraer audio de video:
  - `args=["-i","video.mp4","-vn","-c:a","libmp3lame","audio.mp3"]`
