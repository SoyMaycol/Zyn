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
    missingPath: 'Missing path',
    modelInvalid: 'Invalid model. Available',
    noActiveTurn: 'No active turn to stop.',
    skillsLoaded: 'Loaded skills',
    noDirectory: 'The path is not a directory',
    webUrl: 'Web URL',
    chooseLanguage: 'Choose language with /lang en or /lang es',
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
    helpShort: '/help for commands',
    thinking: 'Thinking...',
    thinkingPast: 'Thought',
    you: 'You',
    agent: 'Zyn',
    queuedLabel: 'queued',
    queueHint: 'Queued - type and it will process later...',
    inputHint: 'Type a message...',
    tabComplete: 'Tab complete',
    arrowsNavigate: '↑↓ navigate',
    permit: 'allow',
    deny: 'deny',
    exitSoon: 'exiting after the current turn',
    exitNow: 'goodbye',
    stopTwice: 'press ESC again',
    stopAgent: 'to stop the agent',
    turn: 'Turn',
    ready: 'Response ready',
    languagePrompt: 'Response language',
    providerCommand: 'Configure provider',
    providerUsage: 'Use /provider add <name> <baseUrl> <apiKey>',
    providerAdded: 'Provider registered',
    providerRemoved: 'Provider removed',
    providerList: 'Registered providers',
    providerSync: 'Models refreshed',
    providerNoModels: 'No models were detected from that provider.',
    providerDetected: 'Detected models',
    providerInvalid: 'Invalid provider command',
    providerMissing: 'Missing provider name',
    providerMissingUrl: 'Missing base URL',
    providerMissingKey: 'Missing API key',
    providerUnknown: 'Unknown provider',
    providerSaved: 'Saved provider configuration',
    providerModels: 'models',
    providerBaseUrl: 'base URL',
    providerApiKey: 'API key',
    providerGroup: 'group',
    providerModelKey: 'model key',
    providerModelLabel: 'label',
    providerModelId: 'model id',
    providerHelp: 'Configure remote providers and auto-detect models.',
    sessionPersisted: 'Sessions and config now live in your home directory.',
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
    missingPath: 'Falta la ruta',
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
    helpShort: '/help para comandos',
    thinking: 'Pensando...',
    thinkingPast: 'Pensé',
    you: 'Tú',
    agent: 'Zyn',
    queuedLabel: 'en cola',
    queueHint: 'En cola - escribe y se procesará después...',
    inputHint: 'Escribe un mensaje...',
    tabComplete: 'Tab completa',
    arrowsNavigate: '↑↓ navegar',
    permit: 'permitir',
    deny: 'denegar',
    exitSoon: 'saliendo al terminar el turno actual',
    exitNow: 'hasta luego',
    stopTwice: 'pulsa ESC otra vez',
    stopAgent: 'para detener el agente',
    turn: 'Turno',
    ready: 'Respuesta lista',
    languagePrompt: 'Idioma de respuesta',
    providerCommand: 'Configurar proveedor',
    providerUsage: 'Usa /provider add <nombre> <baseUrl> <apiKey>',
    providerAdded: 'Proveedor registrado',
    providerRemoved: 'Proveedor eliminado',
    providerList: 'Proveedores registrados',
    providerSync: 'Modelos actualizados',
    providerNoModels: 'No se detectaron modelos en ese proveedor.',
    providerDetected: 'Modelos detectados',
    providerInvalid: 'Comando de proveedor no válido',
    providerMissing: 'Falta el nombre del proveedor',
    providerMissingUrl: 'Falta la base URL',
    providerMissingKey: 'Falta la API key',
    providerUnknown: 'Proveedor desconocido',
    providerSaved: 'Configuración del proveedor guardada',
    providerModels: 'modelos',
    providerBaseUrl: 'base URL',
    providerApiKey: 'API key',
    providerGroup: 'grupo',
    providerModelKey: 'clave del modelo',
    providerModelLabel: 'etiqueta',
    providerModelId: 'id del modelo',
    providerHelp: 'Configura proveedores remotos y detecta modelos automáticamente.',
    sessionPersisted: 'Las sesiones y la configuración ahora viven en tu carpeta de usuario.',
  },
};

function normalizeLanguage(language) {
  const value = String(language || '').trim().toLowerCase();
  if (!value) return 'en';
  if (value.startsWith('es')) return 'es';
  if (value.startsWith('en')) return 'en';
  return 'en';
}

function detectLanguage(text, fallback = 'en') {
  const value = String(text || '').toLowerCase();
  const fallbackLang = normalizeLanguage(fallback);

  const spanishScore = [
    /[áéíóúñ¿¡]/,
    /\b(el|la|los|las|de|del|y|que|para|con|por|una|un|no|si|instala|instalar|haz|hace|agrega|añade|corrige|arregla|muestra|dime|busca|abre|cierra)\b/i,
  ].reduce((score, re) => score + (re.test(value) ? 1 : 0), 0);

  const englishScore = [
    /\b(the|and|for|with|you|please|install|make|show|find|open|close|run|update|fix|create|give|need)\b/i,
  ].reduce((score, re) => score + (re.test(value) ? 1 : 0), 0);

  if (spanishScore > englishScore) return 'es';
  if (englishScore > spanishScore) return 'en';
  return fallbackLang;
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
  detectLanguage,
  languageLabel,
  normalizeLanguage,
  t,
  SUPPORTED_LANGUAGES,
};
