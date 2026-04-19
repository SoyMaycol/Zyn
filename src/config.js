const os = require('os');
const path = require('path');

const APP_NAME = 'Adonix';
const APP_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.join(APP_ROOT, 'data');
const HOME_DIR = os.homedir() || '/root';
const MODELS = {
  'qwen': { label: 'Qwen 3.6 Plus', provider: 'qwen' },
  'nemotron': { label: 'Nemotron 3 Super', provider: 'zen', zenModel: 'nemotron-3-super-free' },
  'minimax': { label: 'MiniMax M2.5', provider: 'zen', zenModel: 'minimax-m2.5-free' },
  'trinity': { label: 'Trinity Large', provider: 'zen', zenModel: 'trinity-large-preview-free' },
};
const DEFAULT_MODEL_KEY = 'qwen';

const QWEN_EMAIL = 'danielalejandrobasado@gmail.com';
const QWEN_PASSWORD = 'zyzz1234';
const MAX_TOOL_STEPS = 10;
const MAX_OUTPUT_CHARS = 12000;
const MAX_FILE_LINES = 250;
const ACTION_LOG_LIMIT = 40;
const REQUEST_TIMEOUT_MS = 180000;
const MAX_HISTORY_CHARS = 24000;
const KEEP_RECENT_MESSAGES = 12;
const SESSION_ROOT = path.join(DATA_ROOT, 'chat');
const SESSIONS_DIR = path.join(SESSION_ROOT, 'sessions');
const CURRENT_SESSION_FILE = path.join(SESSION_ROOT, 'current-session.json');
const TRANSCRIPTS_DIR = path.join(SESSION_ROOT, 'transcripts');
const EXPORTS_DIR = path.join(SESSION_ROOT, 'exports');
const THINK_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

module.exports = {
  ACTION_LOG_LIMIT,
  APP_NAME,
  APP_ROOT,
  CURRENT_SESSION_FILE,
  DATA_ROOT,
  DEFAULT_MODEL_KEY,
  EXPORTS_DIR,
  HOME_DIR,
  KEEP_RECENT_MESSAGES,
  MAX_FILE_LINES,
  MAX_HISTORY_CHARS,
  MAX_OUTPUT_CHARS,
  MAX_TOOL_STEPS,
  MODELS,
  QWEN_EMAIL,
  QWEN_PASSWORD,
  REQUEST_TIMEOUT_MS,
  SESSION_ROOT,
  SESSIONS_DIR,
  THINK_FRAMES,
  TRANSCRIPTS_DIR,
};
