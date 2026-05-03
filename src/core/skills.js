const fs = require('fs');
const path = require('path');
const { DATA_ROOT, USER_SKILLS_DIR } = require('../config');

const ASSET_SKILLS_DIR = path.join(DATA_ROOT, 'skills');
const SKILL_DIRS = [USER_SKILLS_DIR, ASSET_SKILLS_DIR];
const CORE_SKILLS = ['core', 'tools', 'reasoning', 'methodology', 'code-style', 'domains'];

function loadSkill(name) {
  for (const dir of SKILL_DIRS) {
    const filePath = path.join(dir, `${name}.md`);
    try {
      return fs.readFileSync(filePath, 'utf8').trim();
    } catch {}
  }
  return null;
}

function loadAllSkills() {
  const names = new Set();

  for (const dir of SKILL_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.md')) {
        names.add(file.replace('.md', ''));
      }
    }
  }

  return [...names].sort((a, b) => {
    const ai = CORE_SKILLS.indexOf(a);
    const bi = CORE_SKILLS.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

function buildSkillsPrompt({ include, extraSkills = [] } = {}) {
  const names = include || loadAllSkills();
  const parts = [];

  for (const name of names) {
    const content = loadSkill(name);
    if (content) parts.push(content);
  }

  for (const name of extraSkills) {
    if (!names.includes(name)) {
      const content = loadSkill(name);
      if (content) parts.push(content);
    }
  }

  return parts.join('\n\n');
}

function listSkills() {
  const names = loadAllSkills();
  return names.map(name => {
    const content = loadSkill(name);
    const firstLine = content?.split('\n').find(l => l.startsWith('# '));
    const title = firstLine ? firstLine.replace(/^#+\s*/, '') : name;
    return { name, title };
  });
}

module.exports = {
  ASSET_SKILLS_DIR,
  SKILL_DIRS,
  buildSkillsPrompt,
  listSkills,
  loadAllSkills,
  loadSkill,
};
