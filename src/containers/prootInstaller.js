const { spawnSync } = require('child_process');

function hasCommand(cmd) {
  const probe = spawnSync('sh', ['-lc', `command -v ${cmd}`], { stdio: 'ignore' });
  return probe.status === 0;
}

function detectPlatform() {
  const platform = process.platform;
  if (platform !== 'linux' && platform !== 'android') {
    throw new Error(`Unsupported platform for PRoot: ${platform}`);
  }
  return platform;
}

function resolveInstallCommand() {
  if (hasCommand('apt-get')) return ['sudo', 'apt-get', 'update', '&&', 'sudo', 'apt-get', 'install', '-y', 'proot'];
  if (hasCommand('apt')) return ['sudo', 'apt', 'install', '-y', 'proot'];
  if (hasCommand('dnf')) return ['sudo', 'dnf', 'install', '-y', 'proot'];
  if (hasCommand('yum')) return ['sudo', 'yum', 'install', '-y', 'proot'];
  if (hasCommand('pacman')) return ['sudo', 'pacman', '-S', '--noconfirm', 'proot'];
  if (hasCommand('zypper')) return ['sudo', 'zypper', '--non-interactive', 'install', 'proot'];
  if (hasCommand('apk')) return ['sudo', 'apk', 'add', 'proot'];
  if (hasCommand('pkg')) return ['pkg', 'install', '-y', 'proot'];
  return null;
}

function ensureProotInstalled() {
  detectPlatform();

  if (hasCommand('proot')) {
    return { installed: true, method: 'existing', command: null };
  }

  const cmd = resolveInstallCommand();
  if (!cmd) {
    throw new Error('Could not determine package manager to install PRoot.');
  }

  return {
    installed: false,
    method: 'package-manager',
    command: cmd.join(' ')
  };
}

module.exports = {
  ensureProotInstalled,
  hasCommand,
  detectPlatform
};
