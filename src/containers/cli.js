#!/usr/bin/env node
const path = require('path');
const { PRootManager } = require('./prootManager');
const { ensureProotInstalled } = require('./prootInstaller');

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const [k, v] = token.slice(2).split('=');
      flags[k] = v ?? argv[i + 1];
      if (v == null) i += 1;
    }
  }
  return flags;
}

async function main() {
  const [, , action, ...rest] = process.argv;
  const flags = parseFlags(rest);
  const baseDir = flags.baseDir || process.env.PROOT_MANAGER_DIR || path.join(process.cwd(), '.proot-containers');
  const manager = new PRootManager({ baseDir });

  if (action === 'doctor') {
    const check = ensureProotInstalled();
    console.log(JSON.stringify(check, null, 2));
    return;
  }

  if (action === 'create') {
    manager.createContainer({
      id: flags.id,
      rootfsSource: flags.rootfs,
      rootId: flags.root !== 'false',
      limits: { ramMb: flags.ramMb, diskMb: flags.diskMb }
    });
    console.log(`Created: ${flags.id}`);
    return;
  }

  if (action === 'delete') {
    manager.deleteContainer(flags.id);
    console.log(`Deleted: ${flags.id}`);
    return;
  }

  if (action === 'list') {
    console.log(JSON.stringify(manager.listContainers(), null, 2));
    return;
  }

  if (action === 'limits') {
    const out = manager.setLimits(flags.id, { ramMb: flags.ramMb, diskMb: flags.diskMb });
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (action === 'exec') {
    const commandIndex = rest.indexOf('--cmd');
    const command = commandIndex >= 0 ? rest.slice(commandIndex + 1) : ['/bin/sh'];
    manager.run(flags.id, command, { interactive: true });
    return;
  }

  console.log('Usage: proot-manager <doctor|create|delete|list|limits|exec> [flags]');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
