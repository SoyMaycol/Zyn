import React, { useState, useEffect, useCallback, useRef } from 'react';
import { render, Box, Text, Static, useInput, useApp, useStdout } from 'ink';
import { createRequire } from 'module';
import { EventEmitter } from 'events';

const require = createRequire(import.meta.url);
const { runAgentTurn } = require('../core/agent');
const { parseAgentResponse } = require('../core/prompts');
const { handleLocalCommand, SLASH_COMMANDS } = require('../cli/commands');
const { countTokens, estimateContextTokens, getContextLimit } = require('../config');
const {
  loadOrCreateSessionState,
  applyLoadedState,
  consumeBackgroundResult,
  listBackgroundResults,
} = require('../utils/sessionStorage');
const { appendTranscriptEntry } = require('../utils/transcriptStorage');
const { pushAction } = require('../cli/print');
const {
  APP_NAME,
  DEFAULT_MODEL_KEY,
  MODELS,
} = require('../config');
const { normalizeLanguage } = require('../i18n');

const h = React.createElement;
function getTuiLang() {
  return normalizeLanguage(global.__zynCurrentLanguage || 'en');
}
function uiText(en, es) {
  return getTuiLang() === 'es' ? es : en;
}
const MAX_THINKING_LINES = 20;
const SPIN_MS = 80;

const SPIN_FRAMES = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];
const SPIN_FRAMES_DOTS = ['\u25cb', '\u25cf', '\u25d0', '\u25d1', '\u25d2', '\u25d3'];
const SPIN_FRAMES_BRAILLE = ['\u2801', '\u2803', '\u2807', '\u280f', '\u281f', '\u283f', '\u287f', '\u28ff'];
const SPIN_FRAMES_ARROW = ['\u2190', '\u2196', '\u2191', '\u2197', '\u2192', '\u2198', '\u2193', '\u2199'];
const SPIN_FRAMES_MOON = ['\u25d6', '\u25d7', '\u25d8', '\u25d9'];
const SPIN_FRAMES_CLOCK = ['\u2570', '\u256f', '\u256e', '\u256d', '\u256c', '\u256b', '\u256a', '\u2569', '\u2568', '\u2567', '\u2566', '\u2565', '\u2564', '\u2563', '\u2562', '\u2561'];

const THEMES = {
  dark: {
    bg: '#212823', surface: '#1a1a1a', surfaceHi: '#222222',
    text: '#ffffff', textDim: '#cccccc', textMuted: '#999999',
    textGhost: '#666666', textInvis: '#333333',
    accent: '#d4a054', accentSoft: '#c49450', accentDim: '#8a6a3a',
    green: '#6aab6a', greenDim: '#3a6a3a', red: '#cc5555', redDim: '#6a3333',
    amber: '#ccaa44', amberDim: '#6a5522', purple: '#aa88cc', purpleDim: '#5a446a',
    blue: '#6699cc', blueDim: '#334466', cyan: '#66cccc', cyanDim: '#336666',
    border: '#2a2a2a', borderLight: '#383838', codeBg: '#111111',
    spinFrames: SPIN_FRAMES, spinMs: 80, borderStyle: 'line',
  },
  cappuccino: {
    bg: '#f5efe6', surface: '#f0e6d6', surfaceHi: '#e8dcc8',
    text: '#3b2f2f', textDim: '#5a4a4a', textMuted: '#7a6a6a',
    textGhost: '#9a8a7a', textInvis: '#bfb0a0',
    accent: '#a0522d', accentSoft: '#b0623d', accentDim: '#c0724d',
    green: '#2e8b57', greenDim: '#5cb85c', red: '#c0392b', redDim: '#e74c3c',
    amber: '#d4a017', amberDim: '#f0c040', purple: '#8e44ad', purpleDim: '#a855c0',
    blue: '#2980b9', blueDim: '#5dade2', cyan: '#17a2b8', cyanDim: '#5bc0de',
    border: '#c8b89a', borderLight: '#d8c8aa', codeBg: '#e8dcc8',
    spinFrames: SPIN_FRAMES_DOTS, spinMs: 120, borderStyle: 'round',
  },
  light: {
    bg: '#ffffff', surface: '#f8f9fa', surfaceHi: '#e9ecef',
    text: '#212529', textDim: '#495057', textMuted: '#6c757d',
    textGhost: '#adb5bd', textInvis: '#dee2e6',
    accent: '#d35400', accentSoft: '#e67e22', accentDim: '#f39c12',
    green: '#28a745', greenDim: '#5cb85c', red: '#dc3545', redDim: '#e74c3c',
    amber: '#ffc107', amberDim: '#f0c040', purple: '#6f42c1', purpleDim: '#8a55c0',
    blue: '#007bff', blueDim: '#5dade2', cyan: '#17a2b8', cyanDim: '#5bc0de',
    border: '#dee2e6', borderLight: '#e9ecef', codeBg: '#f8f9fa',
    spinFrames: SPIN_FRAMES_BRAILLE, spinMs: 100, borderStyle: 'line',
  },
  coffee: {
    bg: '#2c1e10', surface: '#241a0c', surfaceHi: '#3a2a18',
    text: '#e8d5b8', textDim: '#c4a882', textMuted: '#a08868',
    textGhost: '#7a6848', textInvis: '#544830',
    accent: '#d4a054', accentSoft: '#c49450', accentDim: '#8a6a3a',
    green: '#6aab6a', greenDim: '#3a6a3a', red: '#cc5555', redDim: '#6a3333',
    amber: '#ccaa44', amberDim: '#6a5522', purple: '#aa88cc', purpleDim: '#5a446a',
    blue: '#6699cc', blueDim: '#334466', cyan: '#66cccc', cyanDim: '#336666',
    border: '#4a3a20', borderLight: '#5a4a30', codeBg: '#1a1008',
    spinFrames: SPIN_FRAMES_MOON, spinMs: 150, borderStyle: 'double',
  },
  gruvbox: {
    bg: '#282828', surface: '#3c3836', surfaceHi: '#504945',
    text: '#ebdbb2', textDim: '#d5c4a1', textMuted: '#bdae93',
    textGhost: '#928374', textInvis: '#7c6f64',
    accent: '#fe8019', accentSoft: '#fabd2f', accentDim: '#b8bb26',
    green: '#b8bb26', greenDim: '#98971a', red: '#fb4934', redDim: '#cc241d',
    amber: '#fabd2f', amberDim: '#d79921', purple: '#d3869b', purpleDim: '#b16286',
    blue: '#83a598', blueDim: '#458588', cyan: '#8ec07c', cyanDim: '#689d6a',
    border: '#504945', borderLight: '#665c54', codeBg: '#1d2021',
    spinFrames: SPIN_FRAMES_ARROW, spinMs: 90, borderStyle: 'bold',
  },
  dracula: {
    bg: '#282a36', surface: '#343746', surfaceHi: '#44475a',
    text: '#f8f8f2', textDim: '#cccac2', textMuted: '#aaa8a0',
    textGhost: '#6272a4', textInvis: '#44475a',
    accent: '#ff79c6', accentSoft: '#bd93f9', accentDim: '#6272a4',
    green: '#50fa7b', greenDim: '#00b956', red: '#ff5555', redDim: '#cc3333',
    amber: '#f1fa8c', amberDim: '#d4d4aa', purple: '#bd93f9', purpleDim: '#8a6fd0',
    blue: '#6272a4', blueDim: '#44475a', cyan: '#8be9fd', cyanDim: '#5fc4d4',
    border: '#44475a', borderLight: '#6272a4', codeBg: '#1e1f29',
    spinFrames: SPIN_FRAMES_CLOCK, spinMs: 70, borderStyle: 'double',
  },
  nord: {
    bg: '#2e3440', surface: '#3b4252', surfaceHi: '#434c5e',
    text: '#eceff4', textDim: '#d8dee9', textMuted: '#aeb6c2',
    textGhost: '#616e88', textInvis: '#4c566a',
    accent: '#88c0d0', accentSoft: '#81a1c1', accentDim: '#5e81ac',
    green: '#a3be8c', greenDim: '#8faa7b', red: '#bf616a', redDim: '#a3555a',
    amber: '#ebcb8b', amberDim: '#d4a96a', purple: '#b48ead', purpleDim: '#9a7a9a',
    blue: '#81a1c1', blueDim: '#6a8aaa', cyan: '#88c0d0', cyanDim: '#6aabb0',
    border: '#4c566a', borderLight: '#5e81ac', codeBg: '#242933',
    spinFrames: SPIN_FRAMES_BRAILLE, spinMs: 110, borderStyle: 'round',
  },
  solarized: {
    bg: '#002b36', surface: '#073642', surfaceHi: '#0a4a5a',
    text: '#839496', textDim: '#93a1a1', textMuted: '#657b83',
    textGhost: '#586e75', textInvis: '#073642',
    accent: '#b58900', accentSoft: '#cb4b16', accentDim: '#dc322f',
    green: '#859900', greenDim: '#586e75', red: '#dc322f', redDim: '#cb4b16',
    amber: '#b58900', amberDim: '#93a1a1', purple: '#6c71c4', purpleDim: '#586e75',
    blue: '#268bd2', blueDim: '#2aa198', cyan: '#2aa198', cyanDim: '#268bd2',
    border: '#0a4a5a', borderLight: '#586e75', codeBg: '#001e26',
    spinFrames: SPIN_FRAMES_CLOCK, spinMs: 130, borderStyle: 'line',
  },
  monokai: {
    bg: '#272822', surface: '#3e3d32', surfaceHi: '#49483e',
    text: '#f8f8f2', textDim: '#cfcfc2', textMuted: '#a0a090',
    textGhost: '#75715e', textInvis: '#49483e',
    accent: '#f92672', accentSoft: '#ae81ff', accentDim: '#66d9ef',
    green: '#a6e22e', greenDim: '#7aaf20', red: '#f92672', redDim: '#cc3355',
    amber: '#e6db74', amberDim: '#c4be60', purple: '#ae81ff', purpleDim: '#9060c0',
    blue: '#66d9ef', blueDim: '#40b0d0', cyan: '#66d9ef', cyanDim: '#40b0d0',
    border: '#49483e', borderLight: '#5e5d50', codeBg: '#1a1b16',
    spinFrames: SPIN_FRAMES_ARROW, spinMs: 60, borderStyle: 'bold',
  },
  tokyoNight: {
    bg: '#1a1b26', surface: '#24283b', surfaceHi: '#414868',
    text: '#c0caf5', textDim: '#a9b1d6', textMuted: '#565f89',
    textGhost: '#3b4261', textInvis: '#1f2335',
    accent: '#ff9e64', accentSoft: '#bb9af7', accentDim: '#7dcfff',
    green: '#9ece6a', greenDim: '#73daca', red: '#f7768e', redDim: '#db4b4b',
    amber: '#e0af68', amberDim: '#c0a860', purple: '#bb9af7', purpleDim: '#9060c0',
    blue: '#7aa2f7', blueDim: '#5a7cd0', cyan: '#7dcfff', cyanDim: '#5fb0d0',
    border: '#414868', borderLight: '#565f89', codeBg: '#16161e',
    spinFrames: SPIN_FRAMES_DOTS, spinMs: 85, borderStyle: 'round',
  },
};

function getTheme(name) {
  return THEMES[name] || THEMES.dark;
}

let T = getTheme('dark');
let globalStore = null;
global.__zynApplyTheme = (name) => {
  T = getTheme(name);
  if (globalStore) {
    globalStore.themeVersion++;
    globalStore._emit();
  }
};

class UIStore extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.items = [];
    this.liveThinking = null;
    this.liveAnswer = null;
    this.spinner = null;
    this.processing = false;
    this.confirmRequest = null;
    this.selectRequest = null;
    this.inputRequest = null;
    this.lastUserMessage = '';
    this.inputDraft = '';
    this.turnCount = 0;
    this.messageQueue = [];
    this.pendingExit = false;
    this.lastEscapeAt = 0;
    this.submittedHistory = [];
    this.submittedRedo = [];
    this.conversationHistory = [];
    this.conversationRedo = [];
    this.tokenEstimate = 0;
    this.contextLimit = 0;
    this.themeVersion = 0;
    this._idCounter = 0;
    this._scheduled = false;
  }

  addItem(item) {
    this._idCounter += 1;
    this.items = [...this.items, { ...item, id: String(this._idCounter) }];
    this._emit();
  }

  setSpinner(label) {
    this.spinner = label ? { label, started: Date.now() } : null;
    this._emit();
  }

  beginThinking() {
    this.liveThinking = { text: '', started: Date.now() };
    this._emit();
  }

  appendThinking(delta) {
    if (!this.liveThinking) return;
    this.liveThinking = { ...this.liveThinking, text: this.liveThinking.text + delta };
    this._emit();
  }

  endThinking() {
    if (!this.liveThinking) return;
    const elapsed = ((Date.now() - this.liveThinking.started) / 1000).toFixed(1);
    this.addItem({ type: 'thinking', text: this.liveThinking.text, elapsed });
    this.liveThinking = null;
  }

  beginAnswer() {
    this.liveAnswer = { text: '' };
    this._emit();
  }

  appendAnswer(delta) {
    if (!this.liveAnswer) return;
    this.liveAnswer = { ...this.liveAnswer, text: this.liveAnswer.text + delta };
    this._updateTokenEstimate(delta);
    this._emit();
  }

  endAnswer() {
    if (!this.liveAnswer) return;
    this.addItem({ type: 'answer', text: this.liveAnswer.text });
    this.liveAnswer = null;
  }

  _updateTokenEstimate(delta) {
    if (!delta) return;
    this.tokenEstimate += Math.ceil(delta.length * 0.25);
  }

  setTokenEstimate(estimate, limit) {
    this.tokenEstimate = estimate;
    this.contextLimit = limit;
    this._emit();
  }

  addEvent(kind, title, detail) {
    this.addItem({ type: 'event', kind, title, detail: detail || '' });
  }

  setInputDraft(text) {
    const nextDraft = String(text || '');
    if (nextDraft === this.inputDraft) return;
    this.inputDraft = nextDraft;
    this._emit();
  }

  requestConfirm(title, detail) {
    return new Promise(resolve => {
      this.confirmRequest = { title, detail, resolve };
      this._emit();
    });
  }

  resolveConfirm(answer) {
    if (!this.confirmRequest) return;
    this.confirmRequest.resolve(answer);
    this.confirmRequest = null;
    this._emit();
  }

  requestSelect(options) {
    return new Promise(resolve => {
      const marker = Symbol('select');
      this._selectMarker = marker;
      setImmediate(() => {
        if (this._selectMarker !== marker) {
          resolve(null);
          return;
        }
        this.selectRequest = { ...options, resolve, selected: Number.isInteger(options?.initialIndex) ? options.initialIndex : 0 };
        this._emit();
      });
    });
  }

  resolveSelect(value) {
    if (!this.selectRequest) return;
    this.selectRequest.resolve(value);
    this.selectRequest = null;
    this._emit();
  }

  cancelSelect() {
    this._selectMarker = null;
    if (!this.selectRequest) return;
    this.selectRequest.resolve(null);
    this.selectRequest = null;
    this._emit();
  }

  adjustSelect(delta) {
    if (!this.selectRequest) return;
    const total = this.selectRequest.items?.length || 0;
    if (total === 0) return;
    const next = (this.selectRequest.selected + delta + total) % total;
    this.selectRequest.selected = next;
    this._emit();
  }

  requestInput(options) {
    return new Promise(resolve => {
      const marker = Symbol('input');
      this._inputMarker = marker;
      setImmediate(() => {
        if (this._inputMarker !== marker) {
          resolve(null);
          return;
        }
        this.inputRequest = { ...options, resolve, value: '' };
        this._emit();
      });
    });
  }

  cancelInput() {
    if (!this.inputRequest) return;
    this.inputRequest.resolve(null);
    this.inputRequest = null;
    this._emit();
  }

  appendInputChar(ch) {
    if (!this.inputRequest) return;
    if (ch === '\x1b' || ch === '\x1b\x1b' || ch === '\x03') {
      this.inputRequest.resolve(null);
      this.inputRequest = null;
    } else if (ch === '\r' || ch === '\n') {
      const value = this.inputRequest.value;
      this.inputRequest.resolve(value);
      this.inputRequest = null;
    } else if (ch === '\x7f' || ch === '\b') {
      this.inputRequest.value = this.inputRequest.value.slice(0, -1);
    } else if (ch.length === 1 && ch.charCodeAt(0) >= 32) {
      this.inputRequest.value += ch;
    }
    this._emit();
  }

  enqueueMessage(text) {
    this.messageQueue.push(text);
    this.addItem({ type: 'queued', text });
    this._emit();
  }


  pushSubmittedMessage(text) {
    const value = String(text || '');
    if (!value) return;
    this.submittedHistory.unshift(value);
    if (this.submittedHistory.length > 200) this.submittedHistory.pop();
    this.submittedRedo = [];
    this._emit();
  }

  addConversationTurn(userMsg, assistantMsg) {
    this.conversationHistory.unshift({ user: userMsg, assistant: assistantMsg, timestamp: Date.now() });
    if (this.conversationHistory.length > 100) this.conversationHistory.pop();
    this.conversationRedo = [];
    this._emit();
  }

  undoConversationTurn() {
    if (this.conversationHistory.length === 0) return null;
    const turn = this.conversationHistory.shift();
    this.conversationRedo.unshift(turn);
    this._removeLastConversationItems();
    this._emit();
    return turn;
  }

  redoConversationTurn() {
    if (this.conversationRedo.length === 0) return null;
    const turn = this.conversationRedo.shift();
    this.conversationHistory.unshift(turn);
    this.addItem({ type: 'user', text: turn.user });
    this.addItem({ type: 'answer', text: turn.assistant });
    this._emit();
    return turn;
  }

  _removeLastConversationItems() {
    let removed = 0;
    for (let i = this.items.length - 1; i >= 0 && removed < 2; i--) {
      if (this.items[i].type === 'user' || this.items[i].type === 'answer') {
        this.items.splice(i, 1);
        removed++;
      }
    }
    if (removed > 0) this._emit();
  }

  undoSubmittedMessage() {
    if (this.submittedHistory.length === 0) return null;
    const value = this.submittedHistory.shift();
    this.submittedRedo.unshift(value);
    this.setInputDraft(value);
    this.addEvent('info', uiText('message restored', 'mensaje restaurado'), shortTextPreview(value, 120));
    return value;
  }

  redoSubmittedMessage() {
    if (this.submittedRedo.length === 0) return null;
    const value = this.submittedRedo.shift();
    this.submittedHistory.unshift(value);
    this.setInputDraft(value);
    this.addEvent('info', uiText('message reapplied', 'mensaje reaplicado'), shortTextPreview(value, 120));
    return value;
  }

  _emit() {
    if (this._scheduled) return;
    this._scheduled = true;
    setImmediate(() => {
      this._scheduled = false;
      this.emit('update');
    });
  }
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function shortTextPreview(str, maxLen) {
  const s = String(str || '').replace(/\n/g, ' ').trim();
  return s.length > maxLen ? s.slice(0, maxLen - 3) + '...' : s;
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  return m + 'm ' + (s % 60) + 's';
}

function useStore(store) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick(t => t + 1);
    store.on('update', handler);
    return () => store.off('update', handler);
  }, [store]);
}

function useDimensions() {
  const { stdout } = useStdout();
  const [dims, setDims] = useState({ width: stdout?.columns || 100, height: stdout?.rows || 40 });
  useEffect(() => {
    if (!stdout) return;
    const handler = () => {
      setDims({ width: stdout.columns || 100, height: stdout.rows || 40 });
    };
    stdout.on('resize', handler);
    return () => stdout.off('resize', handler);
  }, [stdout]);
  return dims;
}


function parseInline(text) {
  const parts = [];
  const regex = /(\*\*(.+?)\*\*)|(`([^`]+?)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ t: 'text', v: text.slice(lastIndex, match.index) });
    }
    if (match[2]) parts.push({ t: 'bold', v: match[2] });
    else if (match[4]) parts.push({ t: 'code', v: match[4] });
    else if (match[6] && match[7]) parts.push({ t: 'link', text: match[6], url: match[7] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ t: 'text', v: text.slice(lastIndex) });
  }
  if (parts.length === 0) parts.push({ t: 'text', v: text });
  return parts;
}


function normalizeAssistantDisplayText(text) {
  const raw = String(text || '');
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  const parsed = parseAgentResponse(trimmed);
  if (parsed?.type === 'tool') {
    return '';
  }
  if (parsed?.type === 'final' && typeof parsed.content === 'string' && parsed.content.trim()) {
    return parsed.content.trim();
  }

  return raw;
}

function InlineLine({ text, color }) {
  const parts = parseInline(text);
  const base = color || T.text;
  return h(Box, { flexWrap: 'wrap' },
    ...parts.map((p, i) => {
      if (p.t === 'bold') return h(Text, { key: String(i), color: base, bold: true }, p.v);
      if (p.t === 'code') return h(Text, { key: String(i), color: T.cyan, backgroundColor: T.codeBg }, ' ' + p.v + ' ');
      if (p.t === 'link') return h(Box, { key: String(i), flexWrap: 'wrap' },
        h(Text, { color: T.accent, underline: true }, p.text),
        h(Text, { color: T.textMuted }, ' (' + p.url + ')'),
      );
      return h(Text, { key: String(i), color: base }, p.v);
    }),
  );
}

function parseMarkdownBlocks(text) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let paragraph = [];
  let i = 0;

  const flushParagraph = () => {
    const value = paragraph.join(' ').replace(/\s+/g, ' ').trim();
    if (value) blocks.push({ type: 'paragraph', text: value });
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const fenceMatch = line.match(/^```(\w*)\s*$/);
    if (fenceMatch) {
      flushParagraph();
      const lang = fenceMatch[1] || '';
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') });
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      i += 1;
      continue;
    }

    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      flushParagraph();
      blocks.push({ type: 'header', level: hMatch[1].length, text: hMatch[2].trim() });
      i += 1;
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quoteLines = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', text: quoteLines.join(' ') });
      continue;
    }

    const tableCandidate = line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]);
    if (tableCandidate) {
      flushParagraph();
      const table = [line];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        table.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'table', rows: table });
      continue;
    }

    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (ulMatch) {
      flushParagraph();
      const indent = Math.floor(ulMatch[1].length / 2);
      const items = [];
      while (i < lines.length) {
        const current = lines[i].match(/^(\s*)[-*+]\s+(.+)/);
        if (!current) break;
        items.push({ ordered: false, indent: Math.floor(current[1].length / 2), text: current[2].trim() });
        i += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    const olMatch = line.match(/^(\s*)\d+[.)]\s+(.+)/);
    if (olMatch) {
      flushParagraph();
      const items = [];
      while (i < lines.length) {
        const current = lines[i].match(/^(\s*)\d+[.)]\s+(.+)/);
        if (!current) break;
        items.push({ ordered: true, indent: Math.floor(current[1].length / 2), text: current[2].trim() });
        i += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    paragraph.push(trimmed);
    i += 1;
  }

  flushParagraph();
  return blocks;
}

function wrapText(text, maxWidth) {
  const limit = Math.max(8, maxWidth || 80);
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  if (words.length === 0) return [''];

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if ((current + ' ' + word).length <= limit) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function splitTableCells(row) {
  const raw = String(row || '').trim();
  const cells = raw.startsWith('|') && raw.endsWith('|') ? raw.slice(1, -1).split('|') : raw.split('|');
  return cells.map(cell => cell.trim()).filter((_, idx) => true);
}

function CodeBlock({ lang, code, width }) {
  const maxW = Math.max(24, Math.min((width || 80) - 4, 120));
  const inner = Math.max(10, maxW - 4);
  const langLabel = lang ? ' ' + lang + ' ' : '';
  const topBar = '┌' + (langLabel ? '─' + langLabel : '') + '─'.repeat(Math.max(0, maxW - 2 - langLabel.length)) + '┐';
  const botBar = '└' + '─'.repeat(maxW - 2) + '┘';
  const codeLines = String(code || '').split('\n');

  return h(Box, { flexDirection: 'column', marginTop: 0, marginBottom: 0 },
    h(Text, { color: T.borderLight }, topBar),
    ...codeLines.flatMap((ln, i) => {
      const wrapped = wrapText(ln, inner);
      return wrapped.map((part, partIdx) => h(Box, { key: `${i}-${partIdx}` },
        h(Text, { color: T.borderLight }, '│ '),
        h(Text, { color: T.cyan }, part.padEnd(inner)),
        h(Text, { color: T.borderLight }, ' │'),
      ));
    }),
    h(Text, { color: T.borderLight }, botBar),
  );
}

function MarkdownContent({ text, width }) {
  const blocks = parseMarkdownBlocks(text);
  const contentWidth = Math.max(24, (width || 80) - 8);
  return h(Box, { flexDirection: 'column' },
    ...blocks.map((block, i) => {
      switch (block.type) {
        case 'code':
          return h(CodeBlock, { key: String(i), lang: block.lang, code: block.code, width });
        case 'header':
          return h(Box, { key: String(i), marginTop: block.level === 1 ? 1 : 0 },
            h(Text, { color: T.accent, bold: true }, block.text),
          );
        case 'list': {
          return h(Box, { key: String(i), flexDirection: 'column', paddingLeft: 0 },
            ...block.items.map((item, idx) => {
              const bullet = item.ordered ? `${idx + 1}.` : '•';
              const indent = '  '.repeat(item.indent || 0);
              const wrapped = wrapText(item.text, Math.max(12, contentWidth - indent.length - 4));
              return h(Box, { key: String(idx), flexDirection: 'column' },
                h(Box, { flexWrap: 'wrap' },
                  h(Text, { color: T.textMuted }, indent + bullet + ' '),
                  h(InlineLine, { text: wrapped[0] || item.text }),
                ),
                ...wrapped.slice(1).map((part, partIdx) => h(Box, { key: String(partIdx), paddingLeft: indent.length + 2 }, h(Text, { color: T.textMuted }, part))),
              );
            }),
          );
        }
        case 'paragraph': {
          const wrapped = wrapText(block.text, contentWidth);
          return h(Box, { key: String(i), flexDirection: 'column', marginBottom: 0 },
            ...wrapped.map((part, idx) => h(InlineLine, { key: String(idx), text: part })),
          );
        }
        case 'quote': {
          const wrapped = wrapText(block.text, contentWidth - 2);
          return h(Box, { key: String(i), marginLeft: 1, flexDirection: 'column' },
            ...wrapped.map((part, idx) => h(Box, { key: String(idx) },
              h(Text, { color: T.textMuted }, '> '),
              h(InlineLine, { text: part, color: T.textMuted }),
            )),
          );
        }
        case 'hr':
          return h(Text, { key: String(i), color: T.borderLight }, '─'.repeat(Math.max(10, Math.min(width || 80, 70))));
        case 'table': {
          const rows = block.rows.map(row => splitTableCells(row)).filter((row, idx) => idx === 0 || !row.every(cell => /^:?-{3,}:?$/.test(cell)));
          const widths = [];
          for (const row of rows) {
            row.forEach((cell, idx) => {
              widths[idx] = Math.max(widths[idx] || 0, cell.length);
            });
          }
          const maxTableWidth = Math.max(24, (width || 80) - 8);
          const gaps = Math.max(0, widths.length - 1) * 3;
          const total = widths.reduce((a, b) => a + b, 0) + gaps;
          const scale = total > maxTableWidth ? Math.max(0.4, (maxTableWidth - gaps) / Math.max(1, widths.reduce((a, b) => a + b, 0))) : 1;
          const fitted = widths.map(w => Math.max(6, Math.floor(w * scale)));
          const lines = rows.map(row => row.map((cell, idx) => {
            const cellWidth = fitted[idx] || 6;
            const value = String(cell || '').slice(0, cellWidth);
            return value.padEnd(cellWidth);
          }).join(' │ '));
          return h(Box, { key: String(i), flexDirection: 'column' },
            ...lines.map((line, rowIdx) => h(Text, { key: String(rowIdx), color: rowIdx === 0 ? T.accent : T.textMuted, wrap: 'wrap' }, line)),
          );
        }
        default:
          return null;
      }
    }),
  );
}

function Banner({ model, resumed, width, cwd }) {
  const maxW = Math.max(30, Math.min(width - 4, 72));
  const inner = maxW - 4;
  const topLine = '  \u250c' + '\u2500'.repeat(maxW - 2) + '\u2510';
  const botLine = '  \u2514' + '\u2500'.repeat(maxW - 2) + '\u2518';

  const pad = (str) => {
    const s = str.slice(0, inner);
    return s + ' '.repeat(Math.max(0, inner - s.length));
  };

  const sessionLabel = resumed ? uiText('session resumed', 'sesion reanudada') : uiText('new session', 'sesion nueva');
  const cwdShort = cwd && cwd.length > inner - 6 ? '...' + cwd.slice(-(inner - 9)) : (cwd || '.');

  return h(Box, { flexDirection: 'column', paddingTop: 1, paddingBottom: 0 },
    h(Text, { color: T.border }, topLine),
    h(Box, {},
      h(Text, { color: T.border }, '  \u2502 '),
      h(Text, { color: T.accent, bold: true }, '\u25cf '),
      h(Text, { color: T.text, bold: true }, pad(APP_NAME)),
      h(Text, { color: T.border }, ' \u2502'),
    ),
    h(Box, {},
      h(Text, { color: T.border }, '  \u2502 '),
      h(Text, { color: T.textMuted }, pad('modelo: ' + model + ' \u00b7 ' + sessionLabel)),
      h(Text, { color: T.border }, ' \u2502'),
    ),
    h(Box, {},
      h(Text, { color: T.border }, '  \u2502 '),
      h(Text, { color: T.textMuted }, pad('cwd: ' + cwdShort)),
      h(Text, { color: T.border }, ' \u2502'),
    ),
    h(Text, { color: T.border }, botLine),
  );
}

function SpinnerLine({ label, started }) {
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const frames = T.spinFrames || SPIN_FRAMES;
  const ms = T.spinMs || SPIN_MS;

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
      if (started) setElapsed(Date.now() - started);
    }, ms);
    return () => clearInterval(timer);
  }, [started, frames.length, ms]);

  const elapsedStr = elapsed > 1500 ? formatElapsed(elapsed) : '';

  return h(Box, { paddingLeft: 5, gap: 1 },
    h(Text, { color: T.accentSoft }, frames[frame]),
    h(Text, { color: T.textMuted }, label),
    elapsedStr ? h(Text, { color: T.textGhost }, elapsedStr) : null,
  );
}

function EventLine({ kind, title, detail }) {
  const cfg = {
    info:    { sym: '\u00b7', color: T.textGhost },
    think:   { sym: '\u25d0', color: T.textGhost },
    tool:    { sym: '\u2933', color: T.purple },
    ok:      { sym: '\u2713', color: T.green },
    warn:    { sym: '\u25b2', color: T.amber },
    error:   { sym: '\u2715', color: T.red },
  };
  const { sym, color } = cfg[kind] || cfg.info;

  const cleanTitle = String(title || '').trim();
  const detailLines = String(detail || '').split('\n').map(line => line.replace(/\t/g, '  ').replace(/\s+$/g, '')).filter(Boolean);

  return h(Box, { paddingLeft: 3, flexDirection: 'column' },
    h(Box, { gap: 1 },
      h(Text, { color }, sym),
      h(Text, { color: kind === 'tool' ? T.textDim : T.textMuted, wrap: 'wrap' }, cleanTitle),
    ),
    detailLines.length
      ? h(Box, { paddingLeft: 2, flexDirection: 'column' },
          ...detailLines.map((line, idx) => h(Text, { key: String(idx), color: T.textGhost, wrap: 'wrap' }, line)),
        )
      : null,
  );
}

function UserMessage({ text }) {
  const rawLines = String(text || '').split('\n');
  const lines = rawLines.slice(0, 40);
  const more = rawLines.length - lines.length;
  return h(Box, { paddingLeft: 3, paddingRight: 3, marginTop: 1, marginBottom: 0, flexDirection: 'row' },
    h(Box, { flexDirection: 'column' },
      h(Box, { gap: 1, marginBottom: 0 },
        h(Text, { color: T.accent, bold: true }, '\u29bf'),
        h(Text, { color: T.textDim, bold: true }, uiText('You', 'Tú')),
      ),
      h(Box, { paddingLeft: 2, flexDirection: 'column' },
        ...lines.map((line, i) => h(Text, { key: String(i), color: T.text, wrap: 'wrap' }, line)),
        more > 0 ? h(Text, { color: T.textGhost }, `... ${more} ${uiText('more lines', 'líneas más')}`) : null,
      ),
    ),
  );
}

function ThinkingBlock({ text, elapsed, live, width }) {
  const lines = text.split('\n').filter(l => l.trim()).slice(0, MAX_THINKING_LINES);
  const total  = text.split('\n').filter(l => l.trim()).length;
  const more   = total - MAX_THINKING_LINES;

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick(n => n + 1), 200);
    return () => clearInterval(t);
  }, [live]);

  const frames = T.spinFrames || SPIN_FRAMES;
  const ms = T.spinMs || SPIN_MS;
  const pulseChar = live ? frames[Math.floor(Date.now() / ms) % frames.length] : '\u25d0';

  const label = live
    ? pulseChar + '  ' + uiText('Thinking...', 'Pensando...')
    : '\u25d0  ' + uiText('Thought for ', 'Pensó durante ') + elapsed + 's';

  return h(Box, { flexDirection: 'column', paddingLeft: 3, marginTop: 1 },
    h(Text, { color: T.textGhost }, label),
    lines.length > 0
      ? h(Box, { flexDirection: 'column', paddingLeft: 1 },
          ...lines.map((line, i) =>
            h(Text, { key: String(i), color: T.textInvis, wrap: 'wrap' }, line),
          ),
          more > 0 ? h(Text, { color: T.textGhost }, '\u00b7\u00b7\u00b7 ' + more + ' ' + uiText('more lines', 'líneas más')) : null,
        )
      : null,
  );
}

function AnswerBlock({ text, live, width }) {
  if (!text) return null;
  const displayText = normalizeAssistantDisplayText(text);
  return h(Box, { flexDirection: 'column', paddingLeft: 3, paddingRight: 3, marginTop: 1 },
    h(Box, { gap: 1, marginBottom: 0 },
      h(Text, { color: T.accentSoft, bold: true }, '\u25c9'),
      h(Text, { color: T.textDim, bold: true }, APP_NAME),
    ),
    h(Box, { flexDirection: 'column', paddingLeft: 2 },
      h(MarkdownContent, { text: displayText, width: Math.max(40, (width || 80) - 8) }),
      live ? h(Text, { color: T.accent }, '\u258e') : null,
    ),
  );
}

function SystemMsg({ text }) {
  return h(Box, { flexDirection: 'column', paddingLeft: 5 },
    ...text.split('\n').map((line, i) =>
      h(Text, { key: String(i), color: T.textMuted, wrap: 'wrap' }, line),
    ),
  );
}

function QueuedMessage({ text }) {
  return h(Box, { paddingLeft: 5, gap: 1, marginTop: 0 },
    h(Text, { color: T.amber }, '\u{1F4E9}'),
    h(Text, { color: T.textGhost, italic: true, wrap: 'wrap' }, text),
  );
}

function ConfirmBar({ title, detail, lastMessage, draft }) {
  const detailLines = (detail || '').split('\n').filter(l => l.trim()).slice(0, 10);
  return h(Box, { flexDirection: 'column', paddingLeft: 2, paddingRight: 2, marginTop: 1, borderStyle: 'round', borderColor: T.borderLight },
    h(Box, { paddingLeft: 1, gap: 1 },
      h(Text, { color: T.amber, bold: true }, '\u26a0'),
      h(Text, { color: T.text, bold: true }, title),
    ),
    detailLines.length > 0
      ? h(Box, { flexDirection: 'column', paddingLeft: 2, marginTop: 0 },
          ...detailLines.map((line, i) =>
            h(Text, { key: String(i), color: T.textDim, wrap: 'wrap' }, line),
          ),
        )
      : null,
    lastMessage
      ? h(Box, { marginTop: 0, paddingLeft: 2 },
          h(Text, { color: T.textGhost }, uiText('Your message: ', 'Tu mensaje: ')),
          h(Text, { color: T.textDim, wrap: 'wrap' }, shortTextPreview(lastMessage, 80)),
        )
      : null,
    draft
      ? h(Box, { marginTop: 0, paddingLeft: 2 },
          h(Text, { color: T.textGhost }, uiText('Saved draft: ', 'Borrador guardado: ')),
          h(Text, { color: T.textDim, wrap: 'wrap' }, shortTextPreview(draft, 80)),
        )
      : null,
    h(Box, { marginTop: 0, paddingLeft: 2, gap: 2 },
      h(Text, { color: T.green, bold: true }, '[y]'),
      h(Text, { color: T.textMuted }, uiText('allow', 'permitir')),
      h(Text, { color: T.textInvis }, '\u00b7'),
      h(Text, { color: T.red, bold: true }, '[n]'),
      h(Text, { color: T.textMuted }, uiText('deny', 'denegar')),
    ),
  );
}

function SelectBar({ request, width }) {
  if (!request) return null;
  const items = Array.isArray(request.items) ? request.items : [];
  const total = items.length;
  const w = width || 100;
  const maxVisible = Math.max(3, Math.min(12, Math.floor((w - 6) / 1.5)));
  const safeIdx = Math.max(0, Math.min(request.selected || 0, total - 1));
  const half = Math.floor(maxVisible / 2);
  let start = Math.max(0, safeIdx - half);
  const end = Math.min(total, start + maxVisible);
  start = Math.max(0, end - maxVisible);
  const visible = items.slice(start, end);

  return h(Box, {
    flexDirection: 'column',
    paddingLeft: 2,
    paddingRight: 2,
    marginTop: 1,
    borderStyle: 'round',
    borderColor: T.borderLight,
  },
    h(Box, { paddingTop: 0, paddingBottom: 0, paddingLeft: 1 },
      h(Text, { color: T.amber, bold: true }, '\u25b8 '),
      h(Text, { color: T.text, bold: true }, request.title || 'Select'),
      request.subtitle
        ? h(Text, { color: T.textMuted }, '  ' + request.subtitle)
        : null,
    ),
    h(Box, { flexDirection: 'column', paddingTop: 0 },
      ...visible.map((item, i) => {
        const realIdx = start + i;
        const isSelected = realIdx === safeIdx;
        const label = request.getLabel ? request.getLabel(item, realIdx) : String(request.getValue ? request.getValue(item) : item);
        const active = request.isActive && request.isActive(item);
        const prefix = isSelected ? '\u25b8 ' : '  ';
        const activeTag = active ? ' \u25cf' : '  ';
        const number = String(realIdx + 1).padStart(2, ' ');
        const color = isSelected ? T.accent : (active ? T.green : T.textMuted);
        return h(Box, { key: realIdx, paddingLeft: 2 },
          h(Text, { color, bold: isSelected }, `${prefix}${number}${activeTag} ${label}`),
        );
      }),
      total > maxVisible
        ? h(Box, { paddingLeft: 2, marginTop: 0 },
            h(Text, { color: T.textMuted }, `... ${total} ${uiText('items', 'items')} ` + uiText('scroll ↑/↓', 'desplaza ↑/↓')),
          )
        : null,
    ),
    h(Box, { paddingTop: 0, paddingBottom: 0, paddingLeft: 1, gap: 1 },
      h(Text, { color: T.textMuted }, '\u2191/\u2193 ' + uiText('navigate', 'navegar')),
      h(Text, { color: T.textGhost }, '\u00b7'),
      h(Text, { color: T.textMuted }, uiText('Enter select', 'Enter seleccionar')),
      h(Text, { color: T.textGhost }, '\u00b7'),
      h(Text, { color: T.textMuted }, uiText('Esc cancel', 'Esc cancelar')),
    ),
  );
}

function StatusBar({ store, model, processing, width, turnCount }) {
  const [frame, setFrame] = useState(0);
  const frames = T.spinFrames || SPIN_FRAMES;
  const ms = T.spinMs || SPIN_MS;

  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => setFrame(f => (f + 1) % frames.length), ms);
    return () => clearInterval(t);
  }, [processing, frames.length, ms]);

  const line = '\u2500'.repeat(Math.max(10, Math.min(width - 4, 120)));
  const safeW = Math.max(width - 2, 20);
  const tokenEstimate = store.tokenEstimate || 0;
  const contextLimit = store.contextLimit || 0;

  function fmtK(n) {
    if (n < 1000) return `${n}`;
    if (n < 100000) return `${(n / 1000).toFixed(1)}K`;
    return `${(n / 1000).toFixed(0)}K`;
  }
  const tokenStr = tokenEstimate > 0
    ? (contextLimit > 0
        ? `${fmtK(tokenEstimate)}/${fmtK(contextLimit)}`
        : fmtK(tokenEstimate))
    : '';
  const tokenColor = contextLimit > 0 && tokenEstimate > contextLimit * 0.85
    ? T.amber
    : T.textInvis;

  return h(Box, { flexDirection: 'column', paddingLeft: 1, paddingRight: 1 },
    h(Box, {},
      h(Text, { color: T.border }, line),
    ),
    h(Box, { paddingLeft: 1, paddingTop: 0, gap: 1, justifyContent: 'space-between', width: safeW },
      h(Box, { gap: 1 },
        h(Text, { color: T.accent }, '\u25cf'),
        h(Text, { color: T.textGhost }, model),
        processing
          ? h(Text, { color: T.accentSoft }, frames[frame])
          : null,
        turnCount > 0
          ? h(Text, { color: T.textInvis }, '\u00b7 ' + turnCount + ' ' + uiText(turnCount === 1 ? 'turn' : 'turns', turnCount === 1 ? 'turno' : 'turnos'))
          : null,
      ),
      h(Box, { gap: 1 },
        tokenStr
          ? h(Text, { color: tokenColor }, tokenStr)
          : null,
        h(Text, { color: T.textInvis }, '/help'),
        h(Text, { color: T.textInvis }, '\u00b7'),
        h(Text, { color: T.textInvis }, uiText('esc exit', 'esc salir')),
      ),
    ),
  );
}

function PromptBar({ request, width }) {
  if (!request) return null;
  const hidden = Boolean(request.hidden);
  const displayValue = hidden && request.value
    ? '*'.repeat(request.value.length)
    : (request.value || '');

  return h(Box, {
    flexDirection: 'column',
    paddingLeft: 2,
    paddingRight: 2,
    marginTop: 1,
    borderStyle: 'round',
    borderColor: T.borderLight,
  },
    h(Box, { paddingTop: 0, paddingBottom: 0 },
      h(Text, { color: T.amber, bold: true }, '\u270e '),
      h(Text, { color: T.text, bold: true }, request.title || 'Input'),
      request.subtitle
        ? h(Text, { color: T.textGhost }, '  ' + request.subtitle)
        : null,
    ),
    h(Box, { paddingTop: 0, paddingBottom: 0 },
      h(Text, { color: T.textGhost }, (request.prompt || '>') + ' '),
      h(Text, { color: T.text, inverse: true }, displayValue.length > 0 ? displayValue.slice(-1) : ' '),
      h(Text, { color: T.textMuted }, displayValue.slice(0, -1) || ''),
    ),
    h(Box, { paddingTop: 0, paddingBottom: 0, gap: 1 },
      h(Text, { color: T.textGhost }, uiText('Type to enter', 'Escribe para ingresar')),
      h(Text, { color: T.textInvis }, '\u00b7'),
      h(Text, { color: T.textGhost }, 'Enter ' + uiText('confirm', 'confirmar')),
      h(Text, { color: T.textInvis }, '\u00b7'),
      h(Text, { color: T.textGhost }, 'Esc ' + uiText('cancel', 'cancelar')),
    ),
  );
}

function StaticItem({ item, width }) {
  switch (item.type) {
    case 'banner':   return h(Banner,        { model: item.model, resumed: item.resumed, width, cwd: item.cwd });
    case 'divider':  return h(Box, { paddingLeft: 2 }, h(Text, { color: T.textInvis }, ' '));
    case 'user':     return h(UserMessage,   { text: item.text });
    case 'thinking': return h(ThinkingBlock, { text: item.text, elapsed: item.elapsed, width });
    case 'answer':   return h(AnswerBlock,   { text: item.text, width });
    case 'event':    return h(EventLine,     { kind: item.kind, title: item.title, detail: item.detail });
    case 'system':   return h(SystemMsg,     { text: item.text });
    case 'queued':   return h(QueuedMessage, { text: item.text });
    default:         return null;
  }
}


function sanitizeInputChunk(input) {
  return String(input || '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001bP[\s\S]*?\u001b\\/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

function clampCursor(nextCursor, length) {
  return Math.max(0, Math.min(nextCursor, length));
}

function isBackspaceInput(input, key) {
  return Boolean(key?.backspace || key?.delete || input === '\b' || input === '\x7f' || input === '\u0008');
}

function InputBar({ onSubmit, processing, width = 100, draft = '', onDraftChange }) {
  const [value, setValue] = useState(draft || '');
  const [cursor, setCursor] = useState((draft || '').length);
  const [histIdx, setHistIdx] = useState(-1);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const historyRef = useRef([]);
  const savedRef = useRef('');
  const lastPasteMetaRef = useRef(null);
  const valueRef = useRef(value);
  const cursorRef = useRef(cursor);
  const histIdxRef = useRef(histIdx);
  const suggestIdxRef = useRef(suggestIdx);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    histIdxRef.current = histIdx;
  }, [histIdx]);

  useEffect(() => {
    suggestIdxRef.current = suggestIdx;
  }, [suggestIdx]);

  useEffect(() => {
    if (draft !== valueRef.current) {
      const nextValue = String(draft || '');
      valueRef.current = nextValue;
      cursorRef.current = nextValue.length;
      setValue(nextValue);
      setCursor(nextValue.length);
      setHistIdx(-1);
      histIdxRef.current = -1;
      setSuggestIdx(0);
      suggestIdxRef.current = 0;
    }
  }, [draft]);

  const commitValue = useCallback((nextValue, nextCursor = nextValue.length) => {
    const safeValue = String(nextValue || '');
    const safeCursor = clampCursor(nextCursor, safeValue.length);
    valueRef.current = safeValue;
    cursorRef.current = safeCursor;
    setValue(safeValue);
    setCursor(safeCursor);
    if (onDraftChange) onDraftChange(safeValue);
  }, [onDraftChange]);

  const showSuggestions = value.startsWith('/') && !value.includes(' ') && value.length > 0;
  const localSlash = [];
  const suggestions = showSuggestions
    ? [...SLASH_COMMANDS, ...localSlash].filter(c => ('/' + c.name).startsWith(value.toLowerCase()))
    : [];

  useInput((input, key) => {
    const currentValue = valueRef.current;
    const currentCursor = cursorRef.current;
    const currentShowSuggestions = currentValue.startsWith('/') && !currentValue.includes(' ') && currentValue.length > 0;
    const currentSuggestions = currentShowSuggestions
      ? [...SLASH_COMMANDS, ...localSlash].filter(c => ('/' + c.name).startsWith(currentValue.toLowerCase()))
      : [];

    if (key?.backspace || key?.delete || input === '\b' || input === '\x7f' || input === '\u0008') {
      if (currentCursor > 0) {
        const nextValue = currentValue.slice(0, currentCursor - 1) + currentValue.slice(currentCursor);
        commitValue(nextValue, currentCursor - 1);
        setSuggestIdx(0);
        suggestIdxRef.current = 0;
      } else if (currentValue.length > 0) {
        commitValue('', 0);
        setSuggestIdx(0);
        suggestIdxRef.current = 0;
      }
      return;
    }

    if (key.return) {
      let text = currentValue.trim();
      if (!text) return;
      if (currentShowSuggestions && currentSuggestions.length > 0 && text === '/') {
        const cmd = currentSuggestions[suggestIdxRef.current] || currentSuggestions[0];
        if (cmd) text = `/${cmd.name}`;
      }
      historyRef.current.unshift(text);
      if (historyRef.current.length > 100) historyRef.current.pop();
      commitValue('', 0);
      setHistIdx(-1);
      histIdxRef.current = -1;
      setSuggestIdx(0);
      suggestIdxRef.current = 0;
      onSubmit(text, lastPasteMetaRef.current);
      lastPasteMetaRef.current = null;
      return;
    }

    if (key.tab && currentSuggestions.length > 0) {
      const cmd = currentSuggestions[suggestIdxRef.current] || currentSuggestions[0];
      if (cmd) {
        const completed = `/${cmd.name} `;
        commitValue(completed, completed.length);
        setSuggestIdx(0);
        suggestIdxRef.current = 0;
      }
      return;
    }

    if (currentShowSuggestions && currentSuggestions.length > 0) {
      if (key.upArrow) {
        const next = Math.max(0, suggestIdxRef.current - 1);
        setSuggestIdx(next);
        suggestIdxRef.current = next;
        return;
      }
      if (key.downArrow) {
        const next = Math.min(currentSuggestions.length - 1, suggestIdxRef.current + 1);
        setSuggestIdx(next);
        suggestIdxRef.current = next;
        return;
      }
    }

    if (key.upArrow) {
      const hist = historyRef.current;
      if (hist.length === 0) return;
      if (histIdxRef.current === -1) savedRef.current = currentValue;
      const next = Math.min(histIdxRef.current + 1, hist.length - 1);
      setHistIdx(next);
      histIdxRef.current = next;
      commitValue(hist[next], hist[next].length);
      return;
    }

    if (key.downArrow) {
      if (histIdxRef.current <= 0) {
        setHistIdx(-1);
        histIdxRef.current = -1;
        commitValue(savedRef.current, savedRef.current.length);
        return;
      }
      const next = histIdxRef.current - 1;
      setHistIdx(next);
      histIdxRef.current = next;
      commitValue(historyRef.current[next], historyRef.current[next].length);
      return;
    }

    if (key.leftArrow) {
      const nextCursor = clampCursor(currentCursor - 1, currentValue.length);
      cursorRef.current = nextCursor;
      setCursor(nextCursor);
      return;
    }

    if (key.rightArrow) {
      const nextCursor = clampCursor(currentCursor + 1, currentValue.length);
      cursorRef.current = nextCursor;
      setCursor(nextCursor);
      return;
    }

    if (key.ctrl && input === 'a') {
      cursorRef.current = 0;
      setCursor(0);
      return;
    }
    if (key.ctrl && input === 'e') {
      const nextCursor = currentValue.length;
      cursorRef.current = nextCursor;
      setCursor(nextCursor);
      return;
    }

    if (key.ctrl && input === 'u') {
      const after = currentValue.slice(currentCursor);
      commitValue(after, 0);
      return;
    }

    if (key.ctrl && input === 'z') {
      onSubmit('/undo');
      return;
    }

    if (key.ctrl && input === 'y') {
      onSubmit('/redo');
      return;
    }

    if (key.ctrl && input === 'w') {
      const before = currentValue.slice(0, currentCursor);
      const after = currentValue.slice(currentCursor);
      const trimmed = before.replace(/\S+\s*$/, '');
      commitValue(trimmed + after, trimmed.length);
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      const normalizedInput = sanitizeInputChunk(input);
      if (!normalizedInput) return;
      const safeInput = normalizedInput.includes('\n')
        ? normalizedInput.replace(/\n+/g, ' ')
        : normalizedInput;
      lastPasteMetaRef.current = safeInput.length > 1 || normalizedInput.includes('\n')
        ? { kind: 'paste', length: safeInput.length, multiline: normalizedInput.includes('\n') }
        : null;
      const nextValue = currentValue.slice(0, currentCursor) + safeInput + currentValue.slice(currentCursor);
      const nextCursor = currentCursor + safeInput.length;
      commitValue(nextValue, nextCursor);
      setSuggestIdx(0);
      suggestIdxRef.current = 0;
    }
  });

  const hasText = value.length > 0;
  const maxInputCols = Math.max(20, (width || 100) - 12);
  let start = Math.max(0, cursor - Math.floor(maxInputCols * 0.7));
  if (value.length - start < maxInputCols) {
    start = Math.max(0, value.length - maxInputCols);
  }
  const visibleText = value.slice(start, start + maxInputCols);
  const cursorInVisible = Math.max(0, Math.min(cursor - start, visibleText.length));
  const before = visibleText.slice(0, cursorInVisible);
  const cursorChar = visibleText[cursorInVisible] || ' ';
  const after = visibleText.slice(cursorInVisible + 1);

  const promptColor = processing ? T.amber : T.accent;
  const placeholder = processing ? uiText(' Queued — type and it will run later...', ' En cola — escribe y se procesará después...') : uiText(' Type a message...', ' Escribe un mensaje...');

  const inputLine = h(Box, { paddingLeft: 3, paddingRight: 3, paddingTop: 0, paddingBottom: 0, marginTop: 1 },
    h(Text, { color: promptColor }, processing ? '\u{1F4E9} ' : '\u276f '),
    hasText
      ? h(Box, {},
          h(Text, { color: T.text }, before),
          h(Text, { color: promptColor, inverse: true }, cursorChar),
          after ? h(Text, { color: T.text }, after) : null,
        )
      : h(Box, {},
          h(Text, { color: promptColor, inverse: true }, ' '),
          h(Text, { color: T.textGhost }, placeholder),
        ),
  );

  if (suggestions.length === 0) return inputLine;

  const maxVisible = 8;
  const safeIdx = Math.min(suggestIdx, suggestions.length - 1);
  const windowStart = Math.max(0, Math.min(safeIdx - maxVisible + 1, suggestions.length - maxVisible));
  const visible = suggestions.slice(windowStart, windowStart + maxVisible);
  const hasMore = suggestions.length > maxVisible;

  return h(Box, { flexDirection: 'column' },
    inputLine,
    h(Box, { flexDirection: 'column', paddingLeft: 5, marginTop: 0 },
      hasMore && windowStart > 0
        ? h(Text, { color: T.textInvis }, '  \u2191 ' + uiText('more', 'más'))
        : null,
      ...visible.map((cmd, i) => {
        const realIdx = windowStart + i;
        const selected = realIdx === safeIdx;
        return h(Box, { key: cmd.name },
          h(Text, {
            color: selected ? T.accent : T.textMuted,
            bold: selected,
          }, selected ? '\u25b8 ' : '  '),
          h(Text, {
            color: selected ? T.accent : T.textMuted,
          }, `/${cmd.name}`),
          h(Text, { color: T.textGhost }, `  ${getTuiLang() === 'es' ? (cmd.descEs || cmd.desc) : cmd.desc}`),
        );
      }),
      hasMore && windowStart + maxVisible < suggestions.length
        ? h(Text, { color: T.textInvis }, '  \u2193 ' + uiText('more', 'más'))
        : null,
      h(Box, { paddingTop: 0 },
        h(Text, { color: T.textInvis }, uiText('Tab complete · ↑↓ navigate', 'Tab completar · ↑↓ navegar')),
      ),
    ),
  );
}

function App({ store, state, onSubmit }) {
  useStore(store);
  global.__zynCurrentLanguage = state?.language || 'en';
  const { exit } = useApp();
  const { width } = useDimensions();
  const themeVersion = store.themeVersion;

  const modelKey   = state?.activeModel || DEFAULT_MODEL_KEY;
  const modelLabel = (MODELS[modelKey]?.label || modelKey).toLowerCase();

  const handleInput = useCallback((text, meta) => {
    if (text === '/exit' || text === '/quit') {
      if (store.processing) {
        store.pendingExit = true;
        store.addEvent('info', uiText('exiting after current turn', 'saliendo al terminar el turno actual'));
        return;
      }
      exit();
      return;
    }
    onSubmit(text, meta);
  }, [onSubmit, exit, store]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') { exit(); return; }
    if (key.escape) {
      if (store.selectRequest) {
        store.cancelSelect();
        return;
      }
      if (store.inputRequest) {
        const val = store.inputRequest?.value || '';
        if (val.trim()) {
          store.inputDraft = val;
        }
        store.cancelInput();
        return;
      }
      if (store.processing) {
        const now = Date.now();
        if (now - store.lastEscapeAt < 2000) return;
        store.lastEscapeAt = now;
        if (typeof state.abortCurrentTurn === 'function') {
          state.abortCurrentTurn();
        }
        store.addEvent('warn', uiText('agent stopped', 'agente detenido'), uiText('Interrupted with ESC', 'Interrumpido con ESC'));
        return;
      }
      const now = Date.now();
      if (now - store.lastEscapeAt < 500) {
        store.lastEscapeAt = 0;
        exit();
        return;
      }
      store.lastEscapeAt = now;
      store.addEvent('info', uiText('press ESC again', 'pulsa ESC otra vez'), uiText('to exit', 'para salir'));
      return;
    }
    if (store.selectRequest) {
      if (key.upArrow || input === '\x1b[A' || input === '\x1bOA' || input === '\x1b[[A') { store.adjustSelect(-1); return; }
      if (key.downArrow || input === '\x1b[B' || input === '\x1bOB' || input === '\x1b[[B') { store.adjustSelect(1); return; }
      if (key.return || input === '\r' || input === '\n') {
        const sel = store.selectRequest;
        const item = sel.items[sel.selected];
        const value = sel.getValue ? sel.getValue(item, sel.selected) : item;
        store.resolveSelect(value);
        return;
      }
      if (key.leftArrow || input === '\x1b[D' || input === '\x1bOD' || input === '\x1b[[D') { store.adjustSelect(-1); return; }
      if (key.rightArrow || input === '\x1b[C' || input === '\x1bOC' || input === '\x1b[[C') { store.adjustSelect(1); return; }
      if (input === 'k') { store.adjustSelect(-1); return; }
      if (input === 'j') { store.adjustSelect(1); return; }
      if (/^[1-9]$/.test(input)) {
        const num = Number(input);
        if (num >= 1 && num <= store.selectRequest.items.length) {
          const sel = store.selectRequest;
          const item = sel.items[num - 1];
          const value = sel.getValue ? sel.getValue(item, num - 1) : item;
          store.resolveSelect(value);
          return;
        }
      }
      if (input === 'q' || input === 'Q' || input === '\x1b') { store.cancelSelect(); return; }
      return;
    }
    if (store.inputRequest) {
      if (key.return || input === '\r' || input === '\n') {
        store.appendInputChar('\r');
        return;
      }
      if (key.backspace || key.delete || input === '\x7f' || input === '\b') {
        store.appendInputChar('\x7f');
        return;
      }
      if (input && input.length > 0) {
        store.appendInputChar(input);
        return;
      }
      return;
    }
    if (!store.confirmRequest) return;
    if (input === 'y' || input === 's') store.resolveConfirm(true);
    else if (input === 'n' || key.return || input === '\r' || input === '\n') store.resolveConfirm(false);
  });

  const showInput   = !store.confirmRequest && !store.selectRequest && !store.inputRequest;
  const showConfirm = !!store.confirmRequest;
  const showSelect  = !!store.selectRequest;
  const showPrompt  = !!store.inputRequest;

  const dynamicArea = [];

  if (store.spinner && !store.liveThinking) {
    dynamicArea.push(
      h(SpinnerLine, { key: 'spinner', label: store.spinner.label, started: store.spinner.started })
    );
  }

  if (store.liveThinking) {
    dynamicArea.push(
      h(ThinkingBlock, { key: 'thinking', text: store.liveThinking.text, live: true, width })
    );
  }

  if (store.liveAnswer) {
    const liveText = normalizeAssistantDisplayText(store.liveAnswer.text);
    if (liveText) {
      dynamicArea.push(
        h(AnswerBlock, { key: 'answer', text: liveText, live: true, width })
      );
    }
  }

  if (showConfirm) {
    dynamicArea.push(
      h(ConfirmBar, { key: 'confirm', title: store.confirmRequest.title, detail: store.confirmRequest.detail, lastMessage: store.lastUserMessage, draft: store.inputDraft })
    );
  }

  if (showSelect) {
    dynamicArea.push(
      h(SelectBar, { key: 'select', request: store.selectRequest, width })
    );
  }

  if (showPrompt) {
    dynamicArea.push(
      h(PromptBar, { key: 'prompt', request: store.inputRequest, width })
    );
  }

  if (showInput) {
    dynamicArea.push(
      h(InputBar, { key: 'input', onSubmit: handleInput, processing: store.processing, width, draft: store.inputDraft, onDraftChange: (text) => store.setInputDraft(text) })
    );
  }

  return h(Box, { flexDirection: 'column', width: '100%', height: '100%' },
    h(Box, { flexDirection: 'column', flexGrow: 1, overflowY: 'hidden' },
      h(Static, { items: store.items }, (item) =>
        h(Box, { key: item.id, flexDirection: 'column' },
          h(StaticItem, { item, width }),
        ),
      ),
      ...dynamicArea,
    ),
    h(StatusBar, {
      store,
      model: modelLabel,
      processing: store.processing,
      width,
      turnCount: store.turnCount,
    }),
  );
}

function getUiBindings(store, state) {
  const { countTokens, estimateContextTokens, getContextLimit } = require('../config');
  return {
    beginThinkingStream:    () => store.beginThinking(),
    writeThinkingDelta:     (_st, delta) => store.appendThinking(delta),
    endThinkingStream:      () => store.endThinking(),
    beginAssistantStream:   () => store.beginAnswer(),
    writeAssistantDelta:    (_st, delta) => store.appendAnswer(delta),
    endAssistantStream:     () => store.endAnswer(),
    logEvent: (st, kind, title, detail) => {
      pushAction(st, kind, title, detail);
      store.addEvent(kind, title, detail || '');
    },
    startThinkingIndicator: (st, label) => {
      pushAction(st, 'think', label);
      store.setSpinner(label);
      return () => store.setSpinner(null);
    },
    pushAction: (st, kind, title, detail) => pushAction(st, kind, title, detail),
    paint: (text) => text,
    syncTokenEstimate: () => {
      const estimate = estimateContextTokens(state);
      const limit = getContextLimit(state.activeModel);
      store.setTokenEstimate(estimate, limit);
    },
  };
}

export async function startTUI(options = {}) {
  const { state, resumed, rehydrated } = await loadOrCreateSessionState(null, options);
  T = getTheme(state.theme || 'dark');
  const store = new UIStore();
  globalStore = store;

  state.rl = null;
  state.tuiConfirm = (title, detail) => store.requestConfirm(title, detail);
  state.tuiSelect = (options) => store.requestSelect(options);
  state.tuiInput = (options) => store.requestInput(options);
  state.getQueuedMessages = () => {
    const msgs = store.messageQueue.splice(0);
    if (msgs.length) store._emit();
    return msgs;
  };
  state.clearQueuedMessages = () => {
    if (store.messageQueue.length) {
      store.messageQueue = [];
      store._emit();
    }
  };

  const modelKey   = state.activeModel || DEFAULT_MODEL_KEY;
  const modelLabel = (MODELS[modelKey]?.label || modelKey).toLowerCase();
  const cwd = state.cwd || process.cwd();

  store.addItem({ type: 'banner', model: modelLabel, resumed, cwd });

  const completedBackgrounds = await listBackgroundResults(state.sessionId).catch(() => []);
  if (completedBackgrounds.length > 0) {
    for (const bg of completedBackgrounds) {
      const status = bg.result?.ok ? 'OK' : 'FAIL';
      const preview = bg.result?.ok
        ? String(bg.result.content || '').slice(0, 240)
        : (bg.result?.error || 'unknown');
      store.addItem({ type: 'system', text: `[background ${status}] task ${bg.taskId}\n${preview}` });
      await consumeBackgroundResult(bg.taskId);
    }
    store.addItem({ type: 'divider' });
  }

  if (rehydrated && Array.isArray(state.__resumedHistory) && state.__resumedHistory.length > 0) {
    const sessionTag = state.sessionId ? ` ${state.sessionId.slice(0, 8)}` : '';
    store.addItem({ type: 'system', text: uiText(`Resuming session${sessionTag} · ${state.__resumedHistory.length} messages replayed`, `Reanudando sesion${sessionTag} · ${state.__resumedHistory.length} mensajes completos`) });
    for (const msg of state.__resumedHistory) {
      if (!msg || typeof msg !== 'object') continue;
      if (msg.role === 'user' && msg.content) {
        store.addItem({ type: 'user', text: String(msg.content) });
      } else if (msg.role === 'assistant' && msg.content) {
        const text = String(msg.content);
        const clean = text.replace(/```json[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '').trim();
        if (clean) store.addItem({ type: 'answer', text: clean });
      } else if (msg.role === 'tool' && msg.tool) {
        store.addEvent('info', msg.tool, String(msg.result || '').slice(0, 240));
      } else if (msg.role === 'system' && msg.content) {
        store.addItem({ type: 'system', text: '· ' + String(msg.content) });
      } else {
        const fallback = String(msg.content || JSON.stringify(msg)).slice(0, 200);
        if (fallback) store.addItem({ type: 'system', text: `${msg.role || 'msg'}: ${fallback}` });
      }
    }
    store.addItem({ type: 'divider' });
  }

  async function handleSessionsCommand(store, state, input) {
    const { listSessions, loadSessionState } = require('../utils/sessionStorage');
    const sessions = await listSessions();
    if (!sessions || sessions.length === 0) {
      store.addEvent('info', uiText('no sessions', 'sin sesiones'), '');
      return;
    }
    const selected = await store.requestSelect({
      title: uiText('Select session', 'Seleccionar sesión'),
      items: sessions,
      getLabel: (s) => `${s.title || s.id?.slice(0, 8) || '?'}  [${s.id?.slice(0, 8) || '?'}]  ${s.messageCount || 0} msgs`,
    });
    if (!selected) return;
    const loadedState = await loadSessionState(selected, null);
    if (!loadedState) {
      store.addEvent('error', uiText('cannot load session', 'no se pudo cargar sesión'), '');
      return;
    }
    if (Array.isArray(loadedState.history)) {
      const lines = [];
      for (const msg of loadedState.history.slice(-20)) {
        if (msg.role === 'user' && msg.content) lines.push(`🧑 ${msg.content.slice(0, 200)}`);
        else if (msg.role === 'assistant' && msg.content) lines.push(`🤖 ${msg.content.slice(0, 200)}`);
      }
      store.addItem({ type: 'system', text: `📋 ${uiText('Session history', 'Historial de sesión')}:\n${lines.join('\n')}` });
    }
    store.addEvent('info', uiText('loaded session', 'sesión cargada'), `"${loadedState.title || selected}"`);
    state.sessionId = loadedState.sessionId;
    state.history = loadedState.history || [];
    state.memorySummary = loadedState.memorySummary || '';
    state.turnCount = loadedState.turnCount || 0;
    state.title = loadedState.title || 'New session';
    const { saveState } = require('../utils/sessionStorage');
    await saveState(state);
    if (typeof ui.syncTokenEstimate === 'function') ui.syncTokenEstimate();
  }

  const processInput = async (input) => {
    if (input === '/exit' || input === '/quit') {
      store.pendingExit = true;
      store.addEvent('info', uiText('bye', 'hasta luego'));
      return;
    }

    if (input === '/undo') {
      const turn = store.undoConversationTurn();
      if (turn && Array.isArray(state.history)) {
        for (let i = state.history.length - 1; i >= 0; i--) {
          const m = state.history[i];
          if ((m.role === 'user' && m.content === turn.user) || (m.role === 'assistant' && m.content === turn.assistant)) {
            state.history.splice(i, 1);
          }
        }
        const { saveState } = require('../utils/sessionStorage');
        await saveState(state);
      }
      store.addEvent('info', uiText('undo done', 'deshacer hecho'), turn ? shortTextPreview(turn.user, 80) : uiText('nothing to undo', 'nada que deshacer'));
      return;
    }

    if (input === '/redo') {
      const turn = store.redoConversationTurn();
      if (turn) {
        if (Array.isArray(state.history)) {
          state.history.push({ role: 'user', content: turn.user });
          state.history.push({ role: 'assistant', content: turn.assistant });
        }
        const { saveState } = require('../utils/sessionStorage');
        await saveState(state);
      }
      store.addEvent('info', uiText('redo done', 'rehacer hecho'), turn ? shortTextPreview(turn.user, 80) : uiText('nothing to redo', 'nada que rehacer'));
      return;
    }

    if (input === '/sessions' || input === '/session') {
      await handleSessionsCommand(store, state, input);
      return;
    }

    if (input.startsWith('/')) {
      const commandName = input.split(' ')[0].slice(1).toLowerCase();
      const lines = [];
      const origLog = console.log;
      const origError = console.error;
      console.log = (...args) => lines.push(stripAnsi(args.join(' ')));
      console.error = (...args) => lines.push(stripAnsi(args.join(' ')));

      try {
        const printMod = require('../cli/print');
        const selectorMod = require('../cli/selector');
        const deps = {
          appendTranscriptEntry,
          applyLoadedState,
          printBanner: printMod.printBanner,
          printHistory: printMod.printHistory,
          printHistoryReplay: printMod.printHistoryReplay,
          printMemory: printMod.printMemory,
          printSession: printMod.printSession,
          printSessions: printMod.printSessions,
          printStatus: printMod.printStatus,
          askSelect: (options) => selectorMod.askSelect(state, deps, options),
          askInput: (options) => selectorMod.askInput(state, deps, options),
          askConfirm: (options) => selectorMod.askConfirm(state, deps, options),
        };

        const handled = await handleLocalCommand(input, state, deps);
        if (handled && lines.length > 0) {
          const clean = lines.filter(l => l.trim()).join('\n');
          if (clean) store.addItem({ type: 'system', text: clean });
        }
        if (!handled) store.addEvent('warn', uiText('command not recognized', 'comando no reconocido'), input);
      } catch (err) {
        store.addEvent('error', uiText('error', 'error'), err.message);
      } finally {
        console.log = origLog;
        console.error = origError;
      }
      return;
    }

    store.addItem({ type: 'divider' });
    store.addItem({ type: 'user', text: input });
    store.lastUserMessage = input;

    const origError = console.error;
    console.error = () => {};

    try {
      const controller = new AbortController();
      state.abortCurrentTurn = () => {
        if (!controller.signal.aborted) {
          controller.abort();
          return true;
        }
        return false;
      };
      state.__bgDetach = { input, signal: controller.signal };
      const ui = getUiBindings(store, state);
      const result = await runAgentTurn(input, state, ui, { signal: controller.signal });
      if (!result.rendered && result.content) {
        store.addItem({ type: 'answer', text: result.content });
      }
      if (result.content) {
        store.addConversationTurn(input, result.content);
      }
      if (typeof ui.syncTokenEstimate === 'function') ui.syncTokenEstimate();
    } catch (err) {
      store.addEvent('error', 'error', err.message);
    } finally {
      console.error = origError;
      state.abortCurrentTurn = null;
      state.__bgDetach = null;
    }
  };

  let appInstance = null;

  const handleSubmit = async (input, meta = null) => {
    if (input.startsWith('/')) {
      await processInput(input);
      return;
    }

    if (store.processing) {
      store.enqueueMessage(input);
      return;
    }

    store.pushSubmittedMessage(input);
    store.setInputDraft('');

    store.processing = true;
    store.turnCount += 1;
    store._emit();

    await processInput(input);

    while (store.messageQueue.length > 0) {
      const next = store.messageQueue.shift();
      store.turnCount += 1;
      store._emit();
      await processInput(next);
    }

    store.processing = false;
    store._emit();

    if (store.pendingExit && appInstance) {
      appInstance.unmount();
    }
  };

  appInstance = render(h(App, { store, state, onSubmit: handleSubmit }), {
    exitOnCtrlC: false,
  });
  await appInstance.waitUntilExit();
}
