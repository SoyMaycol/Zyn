---
name: testing
description: Iron law of verification: no delivery without validation. Real, specific, repeatable checks for every change.
---

# Verificación Sistemática para Agentes

## Resumen

Hacer una tarea no es suficiente. Un agente serio no entrega “parece que funciona”; entrega evidencia de que funciona.

**Principio fundamental:**  
**TODO cambio debe terminar con validación real, específica y repetible.**

Si una tarea no fue verificada, la tarea no está terminada.

Este skill existe para que el agente:
- entienda el proyecto antes de actuar,
- adapte su estrategia al lenguaje, framework o entorno,
- ejecute pruebas y comprobaciones adecuadas,
- detecte regresiones,
- y no se limite a “creer” que algo quedó bien.

---

## Ley de Hierro

```text
NO HAY ENTREGA SIN VERIFICACIÓN
```

Aplica a TODA tarea: un comando, un cambio, una corrección, una refactorización.  
La verificación no es opcional. La verificación es la definición de “hecho”.

---

## Tres niveles de verificación

### 1. Verificación mínima (cambios triviales)

Cambios pequeños como renombrar una variable, ajustar un mensaje o mover una constante:

- confirmar que el archivo editado compila,
- confirmar que los imports siguen resueltos,
- ejecutar `npm run check` o equivalente.

No hay excusas para saltarse esto.

### 2. Verificación estándar (cambios funcionales)

Cualquier cambio que afecte comportamiento:

- ejecutar pruebas existentes relevantes,
- ejecutar un script de prueba o un caso de uso manual reproducible,
- documentar el comando exacto usado y la salida observada,
- verificar que la salida coincide con el comportamiento esperado.

### 3. Verificación profunda (cambios estructurales o críticos)

Cambios que toquen arquitectura, seguridad, datos, API pública, persistencia o configuración:

- diseñar un plan de validación antes de empezar,
- instrumentar logs y asserts si hace falta,
- ejecutar pruebas unitarias + integración + extremo a extremo,
- comparar resultados antes/después,
- revisar regresiones en módulos adyacentes.

---

## Adaptación por stack

| Stack | Comando típico de verificación |
|---|---|
| Node.js | `npm test`, `node script.js` |
| Python | `pytest`, `python script.py` |
| Bash | `bash -n script.sh && script.sh` |
| Go | `go test ./...` |
| Rust | `cargo test` |
| Docker | `docker build`, `docker run` |

Adapta el comando al stack real. No inventes comandos que no existen en el proyecto.

---

## Lista de comprobación final

Antes de declarar una tarea “lista”, el agente debe poder responder SÍ a todo esto:

- [ ] ¿La modificación compila / se carga sin errores?
- [ ] ¿Las pruebas existentes siguen pasando?
- [ ] ¿Hay evidencia concreta de que el nuevo comportamiento funciona?
- [ ] ¿Se documentó cómo verificarlo?
- [ ] ¿Se detectaron y corrigieron regresiones?
- [ ] ¿El cambio se midió en complejidad, rendimiento o mantenibilidad?

Si alguna respuesta es NO, la tarea no está terminada. Vuelve a la fase de ejecución y complétala.

---

## Antipatrones prohibidos

NO:
- declarar “debería funcionar” sin probarlo,
- confiar en la intuición como sustituto de evidencia,
- ejecutar pruebas solo cuando fallan,
- verificar únicamente el camino feliz,
- saltarse la validación por presión de tiempo,
- usar mocks como sustituto de integración real sin advertirlo,
- confundir “compila” con “funciona”.

---

## Cierre

Un agente profesional no entrega código: entrega código verificado.  
La calidad no se negocia. La evidencia no se sustituye. La verificación es parte del trabajo, no un extra opcional.
