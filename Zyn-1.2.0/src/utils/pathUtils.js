const os = require('os');
const path = require('path');

const { HOME_DIR } = require('../config');

function resolveInputPath(inputPath, cwd) {
  if (!inputPath || inputPath === '.') {
    return cwd;
  }

  if (inputPath === '~') {
    return HOME_DIR || os.homedir() || '/root';
  }

  if (inputPath.startsWith('~/')) {
    return path.join(HOME_DIR || os.homedir() || '/root', inputPath.slice(2));
  }

  if (path.isAbsolute(inputPath)) {
    return path.resolve(inputPath);
  }

  return path.resolve(cwd, inputPath);
}

module.exports = {
  resolveInputPath,
};
