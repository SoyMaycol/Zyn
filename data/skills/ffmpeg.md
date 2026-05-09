# Skill: FFmpeg Mastery for Agent Workflows

Objetivo: que el agente use la tool `ffmpeg` de forma confiable, repetible y profesional para resolver tareas reales de audio/video sin fricción.

## Cuándo usar esta tool
Usa `ffmpeg` cuando la tarea pida:
- Convertir formatos (`.mov`→`.mp4`, `.wav`→`.mp3`, etc.).
- Extraer audio/video/subtítulos/frames.
- Mejorar audio (normalización, volumen, mezcla, filtros).
- Generar salidas listas para web/redes/social.
- Comprimir sin romper compatibilidad.
- Inspección técnica del archivo antes de editar.

## Acciones disponibles
- `probe`: inspección técnica con ffprobe (JSON con streams, codec, duración, bitrate, fps).
- `run`: ejecución libre con `args` (control total real).
- `run_profile`: carga un JSON reusable para tareas repetitivas.

## Flujo obligatorio recomendado
1. **Inspeccionar primero** con `probe`.
2. **Diseñar comando** con `run` y `args` explícitos.
3. **Ejecutar** y revisar salida/errores.
4. Si se repite, **guardar en perfil** y usar `run_profile`.

## Buenas prácticas de calidad
- Video compatible universal:
  - `-c:v libx264 -pix_fmt yuv420p -movflags +faststart`
- Audio limpio para voz/podcast:
  - `-af loudnorm=I=-16:LRA=11:TP=-1.5`
- No recodificar si no hace falta:
  - `-c copy`
- Mantener calidad visual:
  - usar `-crf` (17-23, menor = más calidad)
- Evitar sobrescribir accidentalmente:
  - usa `overwrite=false` cuando necesites conservar salida previa.

## Plantillas de comandos (args)
### 1) Convertir video a MP4 web
`["-i","input.mov","-c:v","libx264","-crf","20","-preset","medium","-pix_fmt","yuv420p","-c:a","aac","-b:a","192k","-movflags","+faststart","output.mp4"]`

### 2) Extraer audio a MP3
`["-i","input.mp4","-vn","-c:a","libmp3lame","-q:a","2","output.mp3"]`

### 3) Normalizar audio (podcast/música)
`["-i","input.wav","-af","loudnorm=I=-16:LRA=11:TP=-1.5","-c:a","aac","-b:a","192k","output.m4a"]`

### 4) Remux sin pérdida (rápido)
`["-i","input.mkv","-c","copy","output.mp4"]`

### 5) Extraer frames PNG
`["-i","input.mp4","-vf","fps=1","frames/frame_%04d.png"]`

## run_profile (JSON)
Ejemplo `profiles/podcast-export.json`:
```json
{
  "overwrite": true,
  "timeoutMs": 180000,
  "args": [
    "-i", "input.wav",
    "-af", "loudnorm=I=-16:LRA=11:TP=-1.5",
    "-c:a", "aac",
    "-b:a", "192k",
    "output.m4a"
  ]
}
```

## Criterio de decisión rápido
- “¿Qué tiene este archivo?” → `probe`
- “Convierte esto” → `run`
- “Haz siempre esta exportación” → `run_profile`
