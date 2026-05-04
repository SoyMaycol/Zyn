# Jimp avanzado: ilustración, posts y composición profesional

Usa `create_canvas_image` para generar piezas visuales con calidad alta, composición limpia y resultados acordes al tipo de solicitud del usuario.

## Objetivo
El agente debe adaptar la composición al pedido real del usuario. Si pide un post, debe verse como post. Si pide un dibujo, debe verse como ilustración. Si pide una portada, banner, meme, miniatura o pieza promocional, debe ajustar el estilo, la jerarquía visual, el balance de color y el uso del espacio para lograr el mejor resultado posible.

## Reglas de trabajo
1. Analiza primero la intención exacta del usuario.
2. Elige una composición adecuada al formato pedido.
3. Prioriza claridad visual, legibilidad y coherencia estética.
4. Usa capas, contraste y alineación para dar apariencia profesional.
5. Evita errores de tamaño, proporción, texto cortado, elementos mal centrados o saturación visual innecesaria.
6. Si el usuario no da suficientes datos, completa de forma inteligente con criterio visual profesional.
7. Mantén el estilo coherente con la temática solicitada: anime, noticia, promocional, infografía, cartoon, elegante, futurista, infantil, serio, etc.
8. No hagas diseños genéricos. Cada pieza debe sentirse hecha a medida.
9. Revisa antes de exportar: composición, ortografía, espaciado, equilibrio y legibilidad.
10. Si una propuesta necesita varias iteraciones, mejora la versión anterior en vez de reinventarla sin motivo.

## Flujo recomendado
1. Define el objetivo visual según la solicitud.
2. Define lienzo con dimensiones correctas para el uso final.
3. Construye base visual con formas, fondos y jerarquía.
4. Inserta imágenes o elementos principales con posiciones y tamaños precisos.
5. Agrega texto solo donde tenga buen contraste y lectura limpia.
6. Ajusta detalles de composición para que el resultado se vea intencional y profesional.
7. Exporta con formato y ruta consistentes.

## Criterios de calidad
- El diseño debe verse como el usuario pidió.
- El texto no debe invadir zonas visuales importantes.
- Los elementos principales deben destacar de forma clara.
- El estilo debe coincidir con el propósito del contenido.
- La pieza final debe verse lista para publicar o compartir.

## Buenas prácticas
- Usa contraste fuerte entre fondo y contenido.
- Distribuye elementos con equilibrio visual.
- Evita dejar espacios vacíos sin intención.
- No sobrecargues la imagen con demasiados elementos.
- Usa bordes, sombras, formas y capas solo cuando aporten valor.
- Si el diseño es para redes, prioriza impacto inmediato.
- Si el diseño es ilustración, prioriza expresión, volumen y detalle.
- Si el diseño es informativo, prioriza orden, jerarquía y lectura.

## Plantilla de ejecución
{"type":"tool","tool":"create_canvas_image","args":{"width":1024,"height":1024,"background":"#1e1b4b","format":"png","outputPath":"generated/anime-cat.png","elements":[{"type":"circle","x":512,"y":512,"r":360,"fill":"#312e81"},{"type":"circle","x":390,"y":430,"r":48,"fill":"#f8fafc"},{"type":"circle","x":634,"y":430,"r":48,"fill":"#f8fafc"},{"type":"rect","x":420,"y":610,"w":200,"h":26,"radius":13,"fill":"#f472b6"},{"type":"text","x":300,"y":860,"fontSize":32,"text":"Anime Cat"}]}}
