const fs = require('fs');
const path = require('path');

const fsp = fs.promises;

const {
  EXPORTS_DIR,
  TRANSCRIPTS_DIR,
} = require('../config');

function getTranscriptPath(sessionId) {
  return path.join(TRANSCRIPTS_DIR, `${sessionId}.jsonl`);
}

async function ensureTranscriptStorage() {
  await fsp.mkdir(TRANSCRIPTS_DIR, { recursive: true });
  await fsp.mkdir(EXPORTS_DIR, { recursive: true });
}

async function appendTranscriptEntry(sessionId, entry) {
  await ensureTranscriptStorage();
  const transcriptPath = getTranscriptPath(sessionId);
  const line = JSON.stringify({
    at: new Date().toISOString(),
    ...entry,
  });
  await fsp.appendFile(transcriptPath, `${line}\n`, 'utf8');
  return transcriptPath;
}

async function readTranscriptEntries(sessionId) {
  await ensureTranscriptStorage();
  const transcriptPath = getTranscriptPath(sessionId);

  try {
    const content = await fsp.readFile(transcriptPath, 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

function entryToText(entry) {
  const label = entry.type ?? 'entry';
  const header = `[${entry.at}] ${label}`;

  if (entry.type === 'tool') {
    return `${header}\n${entry.tool}\n${JSON.stringify(entry.args ?? {}, null, 2)}\n\n${entry.result ?? ''}`;
  }

  if (entry.type === 'tool_error') {
    return `${header}\n${entry.tool}\n${entry.error ?? ''}`;
  }

  return `${header}\n${entry.content ?? ''}`;
}

async function formatTranscriptPreview(sessionId, limit = 20) {
  const entries = await readTranscriptEntries(sessionId);

  if (entries.length === 0) {
    return 'Sin transcript todavia.';
  }

  return entries
    .slice(-limit)
    .map(entryToText)
    .join('\n\n');
}

async function exportTranscriptText(sessionId, outputPath = '') {
  await ensureTranscriptStorage();
  const entries = await readTranscriptEntries(sessionId);
  const targetPath = outputPath || path.join(EXPORTS_DIR, `${sessionId}.txt`);
  const body = entries.map(entryToText).join('\n\n');
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  await fsp.writeFile(targetPath, body, 'utf8');
  return targetPath;
}

module.exports = {
  appendTranscriptEntry,
  ensureTranscriptStorage,
  exportTranscriptText,
  formatTranscriptPreview,
  getTranscriptPath,
  readTranscriptEntries,
};
