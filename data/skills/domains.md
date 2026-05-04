# Expertise en dominios especificos

## Node.js / Express

- Estructura: routes → controllers → services → models.
- Middleware: funciones nombradas, next() para pasar, res.status().json() para responder.
- Errores: middleware de error global (err, req, res, next) como ultimo middleware.
- Async: wrap async handlers con try/catch o express-async-errors.
- Respuestas: { success: true, data } o { error: "mensaje" } consistente.
- Status codes: 200 OK, 201 Created, 400 Bad Request, 401 Unauth, 404 Not Found, 500 Server Error.
- Variables de entorno: process.env con dotenv. NUNCA hardcodear secrets.
- package.json: scripts claros (start, dev, test, build).

## React / Frontend moderno

- Componentes funcionales con hooks.
- useState para estado local, useEffect para side effects.
- Custom hooks para logica reutilizable.
- Props destructurados: function Card({ title, body }).
- Keys unicas en listas (NUNCA usar index como key si la lista cambia).
- Evitar re-renders: useMemo, useCallback cuando sea necesario (no prematuramente).
- CSS: Tailwind CSS, CSS Modules, o styled-components segun el proyecto.

## Git

- Commits: mensajes descriptivos en imperativo ("Agrega feature X", no "Agregue...").
- Branches: feature/, fix/, hotfix/ como prefijo.
- Comandos utiles: git status, git diff, git log --oneline -10.
- Stash: git stash / git stash pop para cambios temporales.
- Si el usuario pide un commit, verifica cambios con git status primero.

## Docker

- Dockerfiles: multi-stage builds para produccion.
- .dockerignore: incluir node_modules, .git, .env.
- docker-compose: para orquestacion multi-servicio.
- Volúmenes para persistencia de datos.
- Networking: crear networks para comunicacion entre servicios.

## Bases de datos

- SQL: queries parametrizados SIEMPRE (nunca concatenar inputs en queries).
- MongoDB: esquemas con Mongoose, indices para queries frecuentes.
- Migraciones: siempre usar sistema de migraciones (knex, prisma, sequelize).
- Conexiones: pool de conexiones, cerrar al terminar.
- Backups: antes de operaciones destructivas, sugerir backup.

## APIs y HTTP

- REST: verbos correctos (GET lee, POST crea, PUT reemplaza, PATCH actualiza, DELETE borra).
- Headers: Content-Type correcto, Authorization Bearer para tokens.
- Error handling: respuestas con status code y mensaje descriptivo.
- Rate limiting: sugerir cuando sea relevante.
- CORS: configurar correctamente en APIs publicas.

## Scraping web

Estrategia de scraping con fetch_url:
1. Primero fetch SIN selector para ver el HTML crudo y entender la estructura.
2. Identifica los selectores CSS correctos para los datos que necesitas.
3. Fetch CON selector para extraer datos.
4. Si necesitas atributos (href, src), usa el parametro attribute.
5. Para sitios con JS dinamico, el HTML puede no tener los datos. Busca APIs internas.
6. Respeta robots.txt y no hagas requests excesivos.

## Linux / Sysadmin

- Monitoreo: top/htop, free -h, df -h, du -sh *.
- Procesos: ps aux | grep X, kill PID, systemctl status.
- Logs: tail -f /var/log/X, journalctl -u service -f.
- Red: curl, wget, netstat/ss, ping, dig.
- Permisos: chmod, chown. 755 para directorios, 644 para archivos normales.
- Paquetes: apt update && apt install -y package.

## Seguridad basica

- NUNCA generes, expongas, o hardcodees credentials, API keys, o tokens.
- SQL injection: queries parametrizados siempre.
- XSS: escapar output HTML, usar textContent en lugar de innerHTML.
- Path traversal: validar y sanitizar paths de usuario.
- Dependencias: mantener actualizadas, revisar vulnerabilidades con npm audit.
- Permisos: principio de minimo privilegio.
- Si encuentras credentials en codigo, sugiere moverlas a variables de entorno.

## Operaciones empresariales y tareas pesadas

- Planificacion: divide proyectos grandes en hitos, riesgos, dependencias y responsables.
- Gestion: prioriza por impacto/urgencia y define KPIs medibles (SLA, costo, tiempo, calidad).
- Ejecucion pesada: usa procesos por lotes, colas, reintentos idempotentes y checkpoints.
- Reportes ejecutivos: resume estado con bloqueadores, decisiones, proximos pasos y fechas.
- Fiabilidad: propone observabilidad (logs, metricas, alertas) y runbooks de incidentes.
