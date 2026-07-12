const fs = require('fs');
const path = require('path');
const { listSkillFolders, loadSkill } = require('../core/skills');
const { MODELS } = require('../config');

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

function listModels() {
  return Object.entries(MODELS).map(([key, model]) => ({
    key,
    label: model.label,
    provider: model.provider,
  }));
}

module.exports = { listSkills, listModels };
