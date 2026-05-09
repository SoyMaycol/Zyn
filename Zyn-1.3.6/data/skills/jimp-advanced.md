# Jimp avanzado (ilustración y composición)

Usa `create_canvas_image` para composición profesional por capas.

## Flujo recomendado
1. Define lienzo (`width`, `height`, `background`).
2. Crea capas base (`rect`, `line`, `circle/ellipse`) para jerarquía visual.
3. Inserta assets (`image`) con coordenadas y tamaño explícitos.
4. Agrega titulares/texto (`text`) en zonas de alto contraste.
5. Exporta con `format` y `outputPath` consistente.

## Tamaños estándar de redes sociales
| Plataforma | Tamaño (px) | Formato |
|---|---|---|
| Post Facebook/LinkedIn | 1200x630 | jpg |
| Post Twitter/X | 1600x900 | png |
| Instagram Post | 1080x1080 | jpg |
| Instagram Story | 1080x1920 | jpg |
| YouTube Thumbnail | 1280x720 | jpg |
| YouTube Banner | 2560x1440 | jpg |
| GitHub Repo Banner | 1280x320 | png |
| Pinterest Pin | 1000x1500 | jpg |
| Discord Banner | 960x540 | png |

## Plantilla: estilo anime de gato (base)
```json
{"type":"tool","tool":"create_canvas_image","args":{"width":1024,"height":1024,"background":"#1e1b4b","format":"png","outputPath":"generated/anime-cat.png","elements":[{"type":"circle","x":512,"y":512,"r":360,"fill":"#312e81"},{"type":"circle","x":390,"y":430,"r":48,"fill":"#f8fafc"},{"type":"circle","x":634,"y":430,"r":48,"fill":"#f8fafc"},{"type":"rect","x":420,"y":610,"w":200,"h":26,"radius":13,"fill":"#f472b6"},{"type":"text","x":300,"y":860,"fontSize":32,"text":"Anime Cat"}]}}
```

## Plantilla: Post de noticia urgente
Fondo oscuro con franja roja superior, texto grande de titular y fuente.
```json
{"type":"tool","tool":"create_canvas_image","args":{"width":1200,"height":630,"background":"#1a1a2e","format":"jpg","outputPath":"generated/news-breaking.jpg","elements":[{"type":"rect","x":0,"y":0,"w":1200,"h":8,"fill":"#e94560"},{"type":"rect","x":60,"y":40,"w":1080,"h":550,"radius":16,"fill":"#16213e"},{"type":"text","x":100,"y":80,"fontSize":32,"text":"⚡ URGENTE"},{"type":"rect","x":100,"y":125,"w":200,"h":4,"fill":"#e94560"},{"type":"text","x":100,"y":160,"fontSize":64,"maxWidth":1000,"text":"Titular de la noticia aqui"},{"type":"text","x":100,"y":420,"fontSize":24,"text":"Fuente: Agencia de Noticias"},{"type":"rect","x":0,"y":580,"w":1200,"h":50,"fill":"#0f3460"},{"type":"text","x":100,"y":590,"fontSize":16,"text":"@tu_canal · Hace 5 min"}]}}
```

## Plantilla: Cita inspiracional
Fondo oscuro con comillas grandes y texto centrado.
```json
{"type":"tool","tool":"create_canvas_image","args":{"width":1080,"height":1080,"background":"#000000","format":"jpg","outputPath":"generated/quote.jpg","elements":[{"type":"rect","x":100,"y":100,"w":880,"h":880,"fill":"#111111"},{"type":"rect","x":200,"y":300,"w":680,"h":4,"fill":"#ffffff"},{"type":"text","x":150,"y":200,"fontSize":80,"text":"\""},{"type":"text","x":150,"y":340,"fontSize":48,"maxWidth":780,"text":"Tu cita inspiracional va aqui en varias lineas si es necesario"},{"type":"text","x":150,"y":700,"fontSize":32,"text":"— Autor"}]}}
```

## Plantilla: Infografía de estadísticas
Fondo oscuro con tarjetas de colores para cada estadística.
```json
{"type":"tool","tool":"create_canvas_image","args":{"width":800,"height":1200,"background":"#1e1e2e","format":"png","outputPath":"generated/infografia.png","elements":[{"type":"rect","x":40,"y":40,"w":720,"h":100,"radius":16,"fill":"#333355"},{"type":"text","x":80,"y":70,"fontSize":40,"text":"ESTADISTICAS 2026"},{"type":"rect","x":40,"y":180,"w":720,"h":120,"radius":12,"fill":"#2a2a4a"},{"type":"circle","x":100,"y":240,"r":30,"fill":"#4fc3f7"},{"type":"text","x":150,"y":220,"fontSize":36,"text":"85%"},{"type":"text","x":150,"y":260,"fontSize":18,"text":"de desarrolladores usan IA"},{"type":"rect","x":40,"y":340,"w":720,"h":120,"radius":12,"fill":"#2a2a4a"},{"type":"circle","x":100,"y":400,"r":30,"fill":"#81c784"},{"type":"text","x":150,"y":380,"fontSize":36,"text":"3.2x"},{"type":"text","x":150,"y":420,"fontSize":18,"text":"mas rapido con herramientas"}]}}
```

## Plantilla: Thumbnail de video
Fondo rojo con texto grande y botón de play.
```json
{"type":"tool","tool":"create_canvas_image","args":{"width":1280,"height":720,"background":"#ff0000","format":"jpg","outputPath":"generated/thumbnail.jpg","elements":[{"type":"rect","x":0,"y":0,"w":1280,"h":720,"fill":"#1a1a1a"},{"type":"rect","x":60,"y":60,"w":1160,"h":600,"radius":24,"fill":"#2a2a2a"},{"type":"text","x":100,"y":150,"fontSize":64,"maxWidth":1080,"text":"TITULO DEL VIDEO"},{"type":"text","x":100,"y":250,"fontSize":36,"maxWidth":1080,"text":"Subtitulo descriptivo"},{"type":"rect","x":100,"y":480,"w":300,"h":80,"radius":40,"fill":"#ff0000"},{"type":"text","x":160,"y":500,"fontSize":32,"text":"▶ PLAY"}]}}
```

## Plantilla: Tarjeta de perfil
Banner superior con avatar circular y datos.
```json
{"type":"tool","tool":"create_canvas_image","args":{"width":600,"height":350,"background":"#f0f0f0","format":"png","outputPath":"generated/profile-card.png","elements":[{"type":"rect","x":0,"y":0,"w":600,"h":120,"fill":"#4a90d9"},{"type":"circle","x":300,"y":120,"r":70,"fill":"#ffffff"},{"type":"text","x":300,"y":210,"fontSize":28,"text":"Nombre Apellido"},{"type":"text","x":300,"y":250,"fontSize":16,"text":"Software Developer"},{"type":"text","x":300,"y":280,"fontSize":14,"text":"username@email.com"}]}}
```

## Plantilla: Banner de repositorio
Fondo oscuro con nombre del proyecto y licencia.
```json
{"type":"tool","tool":"create_canvas_image","args":{"width":1280,"height":320,"background":"#24292e","format":"png","outputPath":"generated/repo-banner.png","elements":[{"type":"rect","x":0,"y":0,"w":1280,"h":4,"fill":"#0366d6"},{"type":"text","x":80,"y":80,"fontSize":64,"text":"mi-proyecto"},{"type":"text","x":80,"y":170,"fontSize":28,"text":"Una descripcion genial del proyecto"},{"type":"rect","x":80,"y":230,"w":16,"h":16,"radius":8,"fill":"#2ea44f"},{"type":"text","x":106,"y":230,"fontSize":20,"text":"MIT License"}]}}
```

## Plantilla: Cartel de evento
Fondo oscuro con fecha, hora y lugar destacados.
```json
{"type":"tool","tool":"create_canvas_image","args":{"width":800,"height":1000,"background":"#0d1b2a","format":"png","outputPath":"generated/evento.png","elements":[{"type":"rect","x":40,"y":40,"w":720,"h":920,"radius":24,"fill":"#1b2838"},{"type":"text","x":80,"y":100,"fontSize":48,"text":"MEETUP TECH"},{"type":"rect","x":80,"y":170,"w":200,"h":4,"fill":"#00d4ff"},{"type":"text","x":80,"y":220,"fontSize":36,"text":"Inteligencia Artificial"},{"type":"text","x":80,"y":280,"fontSize":24,"text":"y Desarrollo Moderno"},{"type":"text","x":80,"y":500,"fontSize":28,"text":"20 de Mayo 2026"},{"type":"text","x":80,"y":560,"fontSize":24,"text":"18:00 hrs"},{"type":"text","x":80,"y":640,"fontSize":20,"text":"Centro de Innovacion"},{"type":"rect","x":80,"y":780,"w":640,"h":80,"radius":40,"fill":"#00d4ff"},{"type":"text","x":240,"y":800,"fontSize":28,"text":"REGISTRATE"}]}}
```

## Tips de diseño
- Usa alto contraste entre texto y fondo.
- No sobrecargues con más de 3-4 colores por imagen.
- Mantén márgenes consistentes (40-80px).
- Para texto largo, usa `maxWidth` para evitar desbordamiento.
- Los elementos se dibujan en orden: primero el fondo, luego capas, texto al final.
- Para imágenes complejas, usa `image` para cargar assets externos como logos o fotos.

Nota: Para resultados "anime" avanzados, combinar esta base con imágenes de referencia vía `image` y múltiples iteraciones.
