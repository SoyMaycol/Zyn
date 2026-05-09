const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { ensureProotInstalled } = require('./prootInstaller');

class PRootManager {
  constructor({ baseDir }) {
    this.baseDir = path.resolve(baseDir || path.join(process.cwd(), '.proot-containers'));
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  containerDir(id) {
    return path.join(this.baseDir, id);
  }

  rootfsDir(id) {
    return path.join(this.containerDir(id), 'rootfs');
  }

  configPath(id) {
    return path.join(this.containerDir(id), 'config.json');
  }

  createContainer({ id, rootfsSource, binds = [], rootId = true, limits = {} }) {
    if (!id) throw new Error('Container id is required.');
    if (!rootfsSource) throw new Error('rootfsSource is required (directory or tarball).');

    const dir = this.containerDir(id);
    if (fs.existsSync(dir)) throw new Error(`Container already exists: ${id}`);

    fs.mkdirSync(this.rootfsDir(id), { recursive: true });

    if (fs.statSync(rootfsSource).isDirectory()) {
      execSync(`cp -a "${rootfsSource}"/. "${this.rootfsDir(id)}"`);
    } else {
      execSync(`tar -xpf "${rootfsSource}" -C "${this.rootfsDir(id)}"`);
    }

    const config = { id, rootId, binds, limits, createdAt: new Date().toISOString() };
    fs.writeFileSync(this.configPath(id), JSON.stringify(config, null, 2));
    return config;
  }

  deleteContainer(id) {
    if (!id) throw new Error('Container id is required.');
    fs.rmSync(this.containerDir(id), { recursive: true, force: true });
  }

  listContainers() {
    return fs.readdirSync(this.baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const id = d.name;
        const cfgPath = this.configPath(id);
        const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : { id };
        return { id, ...cfg };
      });
  }

  setLimits(id, limits) {
    const cfgPath = this.configPath(id);
    if (!fs.existsSync(cfgPath)) throw new Error(`Container not found: ${id}`);
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    cfg.limits = { ...(cfg.limits || {}), ...limits };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    return cfg;
  }

  run(id, command, { interactive = true, extraBinds = [] } = {}) {
    ensureProotInstalled();

    const cfgPath = this.configPath(id);
    if (!fs.existsSync(cfgPath)) throw new Error(`Container not found: ${id}`);
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

    const args = ['-r', this.rootfsDir(id), '--kill-on-exit'];
    if (cfg.rootId) args.push('-0');

    [...(cfg.binds || []), ...extraBinds].forEach(bind => {
      if (typeof bind === 'string') {
        args.push('-b', bind);
      } else {
        const suffix = bind.readOnly ? '!' : '';
        args.push('-b', `${bind.hostPath}:${bind.guestPath}${suffix}`);
      }
    });

    let spawnCmd = 'proot';
    let spawnArgs = [...args, ...command];

    if (cfg.limits?.ramMb) {
      const ramKb = Number(cfg.limits.ramMb) * 1024;
      const inline = `ulimit -v ${ramKb}; exec proot ${spawnArgs.map(a => `'${String(a).replace(/'/g, `'\\''`)}'`).join(' ')}`;
      spawnCmd = 'sh';
      spawnArgs = ['-lc', inline];
    }

    const child = spawn(spawnCmd, spawnArgs, {
      stdio: interactive ? 'inherit' : 'pipe',
      detached: true,
      env: process.env
    });

    if (cfg.limits?.diskMb) {
      const limitBytes = Number(cfg.limits.diskMb) * 1024 * 1024;
      const timer = setInterval(() => {
        try {
          const used = Number(execSync(`du -sb "${this.rootfsDir(id)}" | cut -f1`).toString().trim());
          if (used > limitBytes) {
            process.kill(-child.pid, 'SIGKILL');
          }
        } catch (_) {
          // Ignore transient failures.
        }
      }, 8000);

      child.on('exit', () => clearInterval(timer));
    }

    return child;
  }
}

module.exports = { PRootManager };
