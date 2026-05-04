# Jimp avanzado (ilustración y composición)

Usa `create_canvas_image` para composición profesional por capas.

## Flujo recomendado
1. Define lienzo (`width`, `height`, `background`).
2. Crea capas base (`rect`, `line`, `circle/ellipse`) para jerarquía visual.
3. Inserta assets (`image`) con coordenadas y tamaño explícitos.
4. Agrega titulares/texto (`text`) en zonas de alto contraste.
5. Exporta con `format` y `outputPath` consistente.

## Plantilla: estilo anime de gato (base)
```json
{"type":"tool","tool":"create_canvas_image","args":{"width":1024,"height":1024,"background":"#1e1b4b","format":"png","outputPath":"generated/anime-cat.png","elements":[{"type":"circle","x":512,"y":512,"r":360,"fill":"#312e81"},{"type":"circle","x":390,"y":430,"r":48,"fill":"#f8fafc"},{"type":"circle","x":634,"y":430,"r":48,"fill":"#f8fafc"},{"type":"rect","x":420,"y":610,"w":200,"h":26,"radius":13,"fill":"#f472b6"},{"type":"text","x":300,"y":860,"fontSize":32,"text":"Anime Cat"}]}}
```

Nota: Para resultados “anime” avanzados, combinar esta base con imágenes de referencia vía `image` y múltiples iteraciones.
