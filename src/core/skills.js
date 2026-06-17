const fs = require('fs');
const path = require('path');
const { DATA_ROOT } = require('../config');

const SKILLS_DIR = path.join(DATA_ROOT, 'skills');
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatter(raw) {
  if (!raw) return { meta: {}, body: '' };
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return { meta: {}, body: raw.trim() };
  const [, header, body] = match;
  const meta = {};
  for (const line of header.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (key) meta[key] = value;
  }
  return { meta, body: body.trim() };
}

function readSkillFolder(folderPath) {
  const skillPath = path.join(folderPath, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  const raw = fs.readFileSync(skillPath, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  const name = meta.name || path.basename(folderPath);
  const description = meta.description || '';

  const extraFiles = [];
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name !== 'SKILL.md') {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.js', '.py', '.ts', '.mjs', '.sh', '.yaml', '.json', '.txt', '.md'].includes(ext)) {
          const filePath = path.join(folderPath, entry.name);
          const content = fs.readFileSync(filePath, 'utf8');
          extraFiles.push({ name: entry.name, content, ext });
        }
      }
    }
  } catch {}

  let fullBody = body;
  if (extraFiles.length > 0) {
    fullBody += '\n\n## Code Files\nThe following code files are available in this skill folder:\n';
    for (const f of extraFiles) {
      fullBody += `\n### ${f.name}\n\`\`\`${f.ext.slice(1)}\n${f.content}\n\`\`\`\n`;
    }
  }

  return {
    name,
    description,
    title: body.split('\n').find(line => line.startsWith('# '))?.replace(/^#+\s*/, '') || name,
    body: fullBody,
    extraFiles,
  };
}

function listSkillFolders() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function loadSkill(name) {
  const folderPath = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(folderPath)) return null;
  return readSkillFolder(folderPath);
}

function loadAllSkills() {
  return listSkillFolders();
}

function listSkills() {
  return listSkillFolders()
    .map(name => loadSkill(name))
    .filter(Boolean)
    .map(skill => ({
      name: skill.name,
      title: skill.title,
      description: skill.description,
    }));
}

function buildSkillsPrompt({ include, extraSkills = [] } = {}) {
  const names = include || loadAllSkills();
  const seen = new Set();
  const parts = [];

  for (const name of names) {
    if (seen.has(name)) continue;
    const skill = loadSkill(name);
    if (skill) {
      seen.add(name);
      parts.push(skill.body);
    }
  }

  for (const name of extraSkills) {
    if (seen.has(name)) continue;
    const skill = loadSkill(name);
    if (skill) {
      seen.add(name);
      parts.push(skill.body);
    }
  }

  return parts.join('\n\n');
}

function buildSkillsIndexPrompt() {
  const skills = listSkills();
  if (skills.length === 0) return '';
  const lines = [
    '## Available Skills',
    'Each skill lives in `data/skills/<name>/SKILL.md` with YAML frontmatter (name + description).',
    'Only the index below is preloaded. The full body of a skill is loaded ON DEMAND via the',
    '`load_skill` tool — call it with the exact `name` when a skill is relevant to the task.',
    '',
  ];
  for (const skill of skills) {
    const desc = skill.description || skill.title || skill.name;
    lines.push(`- \`${skill.name}\` — ${desc}`);
  }
  return lines.join('\n');
}

module.exports = {
  FRONTMATTER_RE,
  SKILLS_DIR,
  buildSkillsIndexPrompt,
  buildSkillsPrompt,
  listSkillFolders,
  listSkills,
  loadAllSkills,
  loadSkill,
  parseFrontmatter,
  readSkillFolder,
};
