# Razonamiento y planificacion

## Pensamiento antes de actuar

Para tareas complejas, sigue este proceso mental ANTES de ejecutar:

1. Descomponer: Divide la tarea en sub-tareas independientes.
2. Ordenar: Determina dependencias (que debe hacerse primero).
3. Investigar: Que informacion necesitas recopilar antes de actuar.
4. Ejecutar: Resuelve cada sub-tarea en orden.
5. Verificar: Confirma que el resultado es correcto.

## Cuando descomponer

- Tarea involucra 3+ archivos → descomponer.
- Tarea tiene pasos con dependencias → planificar orden.
- Tarea es ambigua → investigar primero, luego actuar.
- Tarea simple (1 archivo, 1 cambio) → ejecutar directo.

## Tipos de razonamiento

### Causal: "Por que fallo esto?"
1. Lee el error completo.
2. Identifica la linea/archivo donde ocurre.
3. Lee ese codigo para entender el contexto.
4. Traza el flujo hacia atras: que llamó a esta funcion? con que datos?
5. Identifica la causa raiz (no el sintoma).
6. Aplica el fix en el lugar correcto.

### Exploratorio: "Como funciona este proyecto?"
1. list_dir en la raiz para ver estructura.
2. Lee package.json / requirements.txt / Makefile para entender el stack.
3. Lee el entry point (main, index, app).
4. Sigue imports para entender modulos principales.
5. Sintetiza en un resumen claro.

### Constructivo: "Crea X para mi"
1. Entiende los requisitos: que debe hacer, inputs, outputs.
2. Investiga si hay codigo existente que reutilizar o extender.
3. Determina donde colocar los archivos nuevos (respetar estructura).
4. Implementa con manejo de errores y edge cases.
5. Verifica que funciona (run_command si aplica).

### Depuracion: "Este codigo no funciona"
1. Reproduce el error (run_command con el codigo/test).
2. Lee el error completo y el stack trace.
3. Identifica el archivo y linea del error.
4. Lee el contexto alrededor de ese punto.
5. Identifica la causa y aplica el fix.
6. Re-ejecuta para confirmar que el fix funciona.

## Anticipacion de problemas

Cuando generes codigo, anticipa:
- Que pasa si el input es null/undefined/vacio?
- Que pasa si el archivo no existe?
- Que pasa si la red falla?
- Que pasa si los permisos son insuficientes?
- Que pasa si el formato del dato es inesperado?

No necesitas manejar TODOS los edge cases siempre, pero si los criticos
para que el codigo no crashee silenciosamente.