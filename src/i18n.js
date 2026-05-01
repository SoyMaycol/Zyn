const SUPPORTED_LANGUAGES = ['en', 'es'];

const LABELS = {
  en: 'English',
  es: 'Español',
};

const STRINGS = {
  en: {
    helpTitle: 'Help',
    usage: 'Usage',
    commands: 'Commands',
    providers: 'Providers',
    escTwice: 'ESC x2 in TUI',
    escTwiceDesc: 'Press ESC twice during a turn to stop the agent.',
    interactiveMode: 'interactive mode',
    singlePrompt: 'single prompt',
    newSession: 'new session',
    resumeSession: 'resume session',
    newSessionCreated: 'New session',
    sessionResumed: 'Session resumed',
    sessionNotFound: 'Session not found',
    missingSessionId: 'Missing session id',
    missingTitle: 'Missing new title',
    modelInvalid: 'Invalid model. Available',
    noActiveTurn: 'No active turn to stop.',
    skillsLoaded: 'Loaded skills',
    noDirectory: 'The path is not a directory',
    webUrl: 'Web URL',
    chooseLanguage: 'Choose language from commands: /lang en or /lang es',
    langCurrent: 'Current language',
    langChanged: 'Language updated',
    langInvalid: 'Unsupported language. Available: en, es',
    noSavedSessions: 'No saved sessions.',
    noMemory: 'No compacted memory.',
    noActions: 'No recorded actions.',
    sessionLabel: 'session',
    titleLabel: 'title',
    modelLabel: 'model',
    cwdLabel: 'cwd',
    autoLabel: 'auto',
    turnsLabel: 'turns',
    messagesLabel: 'messages',
    memoryLabel: 'memory',
    fileLabel: 'file',
    transcriptLabel: 'transcript',
    fromLabel: 'created',
    updatedLabel: 'updated',
  },
  es: {
    helpTitle: 'Ayuda',
    usage: 'Uso',
    commands: 'Comandos',
    providers: 'Proveedores',
    escTwice: 'ESC x2 en TUI',
    escTwiceDesc: 'Pulsa ESC dos veces durante un turno para detener el agente.',
    interactiveMode: 'modo interactivo',
    singlePrompt: 'consulta única',
    newSession: 'nueva sesión',
    resumeSession: 'reanudar sesión',
    newSessionCreated: 'Nueva sesión',
    sessionResumed: 'Sesión reanudada',
    sessionNotFound: 'Sesión no encontrada',
    missingSessionId: 'Falta el id de sesión',
    missingTitle: 'Falta el nuevo título',
    modelInvalid: 'Modelo no válido. Disponibles',
    noActiveTurn: 'No hay un turno activo para detener.',
    skillsLoaded: 'Skills cargadas',
    noDirectory: 'La ruta no es un directorio',
    webUrl: 'URL web',
    chooseLanguage: 'Elige idioma con /lang en o /lang es',
    langCurrent: 'Idioma actual',
    langChanged: 'Idioma actualizado',
    langInvalid: 'Idioma no soportado. Disponibles: en, es',
    noSavedSessions: 'No hay sesiones guardadas.',
    noMemory: 'Sin memoria compactada.',
    noActions: 'Sin acciones registradas.',
    sessionLabel: 'sesión',
    titleLabel: 'título',
    modelLabel: 'modelo',
    cwdLabel: 'cwd',
    autoLabel: 'auto',
    turnsLabel: 'turnos',
    messagesLabel: 'mensajes',
    memoryLabel: 'memoria',
    fileLabel: 'archivo',
    transcriptLabel: 'transcript',
    fromLabel: 'desde',
    updatedLabel: 'actualizado',
  },
};

function normalizeLanguage(language) {
  const value = String(language || '').trim().toLowerCase();
  if (!value) return 'en';
  if (value.startsWith('es')) return 'es';
  if (value.startsWith('en')) return 'en';
  return 'en';
}

function languageLabel(language) {
  return LABELS[normalizeLanguage(language)] || LABELS.en;
}

function t(language, key, params = {}) {
  const lang = normalizeLanguage(language);
  const template = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const value = params[name];
    return value === undefined || value === null ? '' : String(value);
  });
}

module.exports = {
  languageLabel,
  normalizeLanguage,
  t,
  SUPPORTED_LANGUAGES,
};
