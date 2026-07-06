---
name: game-dev
author: Zyn Team
description: Creation of browser-based games using Babylon.js, Phaser, and PlayCanvas. Includes project setup and development workflow.
---

# Skill: Game Development

Esta skill permite crear juegos para web usando frameworks profesionales. Por defecto usa **Babylon.js**, **Phaser** o **PlayCanvas** según el tipo de juego.

## Frameworks por defecto

### Juegos 3D → Babylon.js
```bash
npm init -y && npm install babylonjs babylonjs-loaders
```
- Motor 3D completo con físicas, sombras, partículas
- IDE propio (Playground) para prototipar
- Ideal para: shooters 3D, plataformas 3D, RPGs, simuladores
- Playground: https://playground.babylonjs.com

### Juegos 2D → Phaser
```bash
npm init -y && npm install phaser
```
- Framework 2D más popular para juegos web
- Física Arcade, animaciones, audio, input
- Ideal para: platformers, puzzlers, shoot-em-ups, RPGs 2D
- Template rápido: https://github.com/phaserjs/template

### Juegos web engine → PlayCanvas
```bash
# Usar el editor web de PlayCanvas o instalar CLI
npm init -y && npm install playcanvas
```
- Engine con editor visual en navegador
- Componentes, scripts, física Bullet
- Ideal para: juegos que necesitan editor visual, colaboración

## Flujo de trabajo estándar

1. **Preguntar al usuario**: tipo de juego, complejidad, frameworks preferidos
2. **Inicializar proyecto**: crear estructura de archivos
3. **Implementar lógica**: game loop, reglas, estados
4. **Agregar assets**: sprites, sonidos, modelos
5. **Testing y iteración**: probar, ajustar, entregar

## Estructura típica

```
mi-juego/
  index.html      ← Entry point
  game.js         ← Lógica principal
  package.json    ← Dependencias
  assets/         ← Sprites, sonidos
  src/            ← Código fuente
```

## Template rápido Babylon.js

```javascript
// game.js - Babylon.js setup básico
const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true);

const createScene = function() {
  const scene = new BABYLON.Scene(engine);
  const camera = new BABYLON.ArcRotateCamera("cam", 0, Math.PI/3, 10, BABYLON.Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
  const sphere = BABYLON.MeshBuilder.CreateSphere("sphere", {diameter: 1}, scene);
  return scene;
};

const scene = createScene();
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
```

## Template rápido Phaser

```javascript
// game.js - Phaser 3 setup básico
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  physics: { default: 'arcade' },
  scene: {
    preload() { this.load.image('sky', 'assets/sky.png'); },
    create() { this.add.image(400, 300, 'sky'); },
    update() { }
  }
};

new Phaser.Game(config);
```

## Reglas importantes

- SIEMPRE pregunta al usuario qué framework prefiere si no especifica uno
- Por defecto: Babylon.js para 3D, Phaser para 2D
- Usa `write_file` para crear archivos del proyecto
- Usa `run_command` con `timeout` para instalar dependencias
- Crea un `index.html` que cargue el script del juego
- Incluye un `package.json` con las dependencias correctas
- Prueba que funcione antes de entregar