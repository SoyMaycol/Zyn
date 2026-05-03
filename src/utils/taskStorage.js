const fs = require('fs');
const path = require('path');
const { TASKS_FILE, USER_DATA_ROOT } = require('../config');

const fsp = fs.promises;

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadTaskStore() {
  const raw = readJson(TASKS_FILE);
  if (!raw || typeof raw !== 'object') {
    return { version: 1, tasks: [] };
  }
  if (Array.isArray(raw)) {
    return { version: 1, tasks: raw };
  }
  return {
    version: Number(raw.version || 1),
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
  };
}

function saveTaskStore(store) {
  writeJson(TASKS_FILE, {
    version: 1,
    tasks: Array.isArray(store.tasks) ? store.tasks : [],
    updatedAt: new Date().toISOString(),
  });
}

function normalizeTaskText(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function makeTaskId() {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function enrichTask(task) {
  return {
    id: task.id,
    title: normalizeTaskText(task.title),
    description: normalizeTaskText(task.description || ''),
    status: task.status || 'todo',
    priority: task.priority || 'medium',
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
    dueAt: task.dueAt || null,
    tags: Array.isArray(task.tags) ? task.tags : [],
    source: task.source || 'manual',
    sessionId: task.sessionId || null,
    notes: normalizeTaskText(task.notes || ''),
  };
}

function listTasks(options = {}) {
  const { status, includeDone = true } = options;
  const store = loadTaskStore();
  return store.tasks
    .map(enrichTask)
    .filter(task => (includeDone ? true : task.status !== 'done'))
    .filter(task => (status ? task.status === status : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function createTask(input = {}) {
  const store = loadTaskStore();
  const title = normalizeTaskText(input.title || input.text || input.description);
  if (!title) {
    throw new Error('task title requerido');
  }

  const now = new Date().toISOString();
  const task = enrichTask({
    id: makeTaskId(),
    title,
    description: input.description || '',
    status: input.status || 'todo',
    priority: input.priority || 'medium',
    createdAt: now,
    updatedAt: now,
    dueAt: input.dueAt || null,
    tags: input.tags || [],
    source: input.source || 'manual',
    sessionId: input.sessionId || null,
    notes: input.notes || '',
  });

  store.tasks.push(task);
  saveTaskStore(store);
  return task;
}

function findTaskIndex(store, idOrTitle) {
  const needle = normalizeTaskText(idOrTitle).toLowerCase();
  if (!needle) return -1;
  return store.tasks.findIndex(task => {
    const idMatch = String(task.id || '').toLowerCase() === needle;
    const titleMatch = String(task.title || '').toLowerCase() === needle;
    return idMatch || titleMatch;
  });
}

function updateTask(idOrTitle, updates = {}) {
  const store = loadTaskStore();
  const idx = findTaskIndex(store, idOrTitle);
  if (idx === -1) {
    throw new Error(`No existe la tarea: ${idOrTitle}`);
  }

  const current = store.tasks[idx];
  const next = enrichTask({
    ...current,
    ...updates,
    title: updates.title ?? current.title,
    description: updates.description ?? current.description,
    priority: updates.priority ?? current.priority,
    status: updates.status ?? current.status,
    dueAt: updates.dueAt === undefined ? current.dueAt : updates.dueAt,
    tags: updates.tags ?? current.tags,
    notes: updates.notes ?? current.notes,
    updatedAt: new Date().toISOString(),
  });

  store.tasks[idx] = next;
  saveTaskStore(store);
  return next;
}

function completeTask(idOrTitle, notes = '') {
  return updateTask(idOrTitle, {
    status: 'done',
    notes,
  });
}

function deleteTask(idOrTitle) {
  const store = loadTaskStore();
  const idx = findTaskIndex(store, idOrTitle);
  if (idx === -1) {
    throw new Error(`No existe la tarea: ${idOrTitle}`);
  }
  const [removed] = store.tasks.splice(idx, 1);
  saveTaskStore(store);
  return enrichTask(removed);
}

function clearTasks() {
  saveTaskStore({ tasks: [] });
}

function formatTask(task) {
  const state = task.status === 'done' ? '✓' : task.status === 'doing' ? '▶' : '·';
  const due = task.dueAt ? ` · due ${task.dueAt}` : '';
  const priority = task.priority ? ` · ${task.priority}` : '';
  const desc = task.description ? `\n    ${task.description}` : '';
  const notes = task.notes ? `\n    notas: ${task.notes}` : '';
  return `${state} ${task.id} :: ${task.title}${priority}${due}${desc}${notes}`;
}

function summarizeTasks(tasks = listTasks()) {
  const lines = [`Tasks: ${tasks.length}`];
  for (const task of tasks.slice(0, 20)) {
    lines.push(formatTask(task));
  }
  return lines.join('\n');
}

module.exports = {
  clearTasks,
  completeTask,
  createTask,
  deleteTask,
  formatTask,
  listTasks,
  loadTaskStore,
  saveTaskStore,
  summarizeTasks,
  updateTask,
  USER_DATA_ROOT,
};
