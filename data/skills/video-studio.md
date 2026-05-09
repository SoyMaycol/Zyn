# Skill: Video Studio Pro

Objetivo: usar la tool `video_studio` de forma robusta para producir videos de cualquier tipo (Phonk, YouTube, gameplay, podcast, cinematic o custom) con control total del pipeline.

## Modo de trabajo
1. **Definir tipo de contenido**
   - phonk: vertical, fps alto, estética agresiva, cortes por beat.
   - youtube/podcast: claridad de voz, encuadre estable, ritmo moderado.
   - gameplay: fps alto, overlays mínimos, legibilidad HUD.
2. **Crear base**
   - Ejecutar `video_studio` con `action="scaffold"` y `profile` adecuado.
3. **Validar configuración**
   - Ejecutar `action="validate_profile"` antes de renderizar.
4. **Inspeccionar plan**
   - Ejecutar `action="plan"` y revisar filtergraph, resolución, fps y salida.
5. **Renderizar**
   - Ejecutar `action="render"`.

## Buenas prácticas
- Mantener rutas relativas en `profile.json`.
- Ajustar `encode.crf` según calidad objetivo (17-21 recomendado).
- Para Phonk, subir fps y contraste; para podcast priorizar audio limpio y movimiento leve.
- Hacer iteraciones rápidas con clips cortos antes del render final largo.

## Checklist antes de entregar
- Profile válido.
- Output generado en `renders/`.
- Códec y pix_fmt compatibles (`libx264`, `yuv420p`).
- Audio presente y sincronizado.
