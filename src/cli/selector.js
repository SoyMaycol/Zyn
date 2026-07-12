const readline = require('readline');

function stripAnsi(text) {
  return String(text || '').replace(/\x1b\[[0-9;]*m/g, '');
}

function pad(text, width) {
  const stripped = stripAnsi(text);
  const padding = Math.max(0, width - stripped.length);
  return `${text}${' '.repeat(padding)}`;
}

function renderOption(index, item, isSelected, isActive, width) {
  const prefix = isSelected ? '>' : ' ';
  const activeTag = isActive ? ' *' : '  ';
  const label = `${prefix}${activeTag} ${item}`;
  return pad(label, width);
}

async function classicSelect({ title, items, getValue, getLabel, isActive, width, prompt }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const total = items.length;
  let selected = Number.isInteger(prompt?.initialIndex) ? prompt.initialIndex : 0;

  const w = width || Math.min(process.stdout.columns || 80, 70);
  const top = `┌─ ${title} ${'─'.repeat(Math.max(0, w - title.length - 4))}┐`;
  const bot = `└${'─'.repeat(w - 1)}┘`;

  if (!process.stdin.isTTY) {
    console.log(`\n  ${title}`);
    items.forEach((item, i) => {
      const label = getLabel ? getLabel(item, i) : String(getValue ? getValue(item) : item);
      const tag = isActive && isActive(item) ? ' *' : '';
      console.log(`    ${i + 1}) ${label}${tag}`);
    });
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = (await rl.question(`\n  Choose [1-${total}] or q to cancel: `)).trim().toLowerCase();
      if (!answer || answer === 'q' || answer === 'quit' || answer === 'cancel') return null;
      const num = Number(answer);
      if (!Number.isInteger(num) || num < 1 || num > total) return null;
      return getValue ? getValue(items[num - 1]) : items[num - 1];
    } finally {
      rl.close();
    }
  }

  process.stdout.write('\n');
  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    if (process.stdin.setRawMode) process.stdin.setRawMode(true);
    process.stdin.resume();

    const draw = () => {
      const lines = [];
      lines.push(`\x1b[2m${top}\x1b[0m`);
      items.forEach((item, i) => {
        const isSel = i === selected;
        const label = getLabel ? getLabel(item, i) : String(getValue ? getValue(item) : item);
        const row = renderOption(i + 1, label, isSel, isActive ? isActive(item) : false, w - 4);
        if (isSel) lines.push(`\x1b[36m│ ${row} │\x1b[0m`);
        else lines.push(`│ ${row} │`);
      });
      lines.push(`\x1b[2m${bot}\x1b[0m`);
      lines.push(`  \x1b[2m↑/↓ move · Enter select · Esc cancel\x1b[0m`);
      process.stdout.write(`\x1b[${lines.length}A\x1b[2K`);
      for (let i = 0; i < lines.length; i += 1) {
        process.stdout.write(lines[i] + '\n');
      }
    };

    let firstDraw = true;
    const onData = (chunk) => {
      const key = chunk.toString('utf8');
      if (key === '\x1b' || key === '\x1b\x1b') {
        cleanup(null);
        return;
      }
      if (key === '\r' || key === '\n') {
        cleanup(getValue ? getValue(items[selected]) : items[selected]);
        return;
      }
      if (key === '\x1b[A' || key === 'k') {
        selected = (selected - 1 + total) % total;
        draw();
        return;
      }
      if (key === '\x1b[B' || key === 'j') {
        selected = (selected + 1) % total;
        draw();
        return;
      }
      if (/^[1-9]$/.test(key)) {
        const num = Number(key);
        if (num >= 1 && num <= total) {
          selected = num - 1;
          draw();
        }
        return;
      }
      if (key === 'q' || key === 'Q') {
        cleanup(null);
        return;
      }
      if (key === '\x03') {
        cleanup(null);
        process.exit(0);
        return;
      }
    };

    const cleanup = (result) => {
      process.stdin.removeListener('data', onData);
      if (process.stdin.setRawMode) process.stdin.setRawMode(Boolean(wasRaw));
      if (!wasRaw) process.stdin.pause();
      const totalLines = items.length + 3;
      process.stdout.write(`\x1b[${totalLines}A\x1b[2K`);
      for (let i = 0; i < totalLines; i += 1) {
        process.stdout.write('\x1b[2K\n');
      }
      process.stdout.write(`\x1b[${totalLines}A`);
      resolve(result);
    };

    process.stdin.on('data', onData);
    draw();
  });
}

async function classicInput({ title, prompt, hidden = false, defaultValue = '' }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write(`\n  ${title}\n`);
    const masked = hidden;
    if (masked) {
      const mutedRl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
      return await new Promise((resolve) => {
        process.stdout.write(`  ${prompt}: `);
        let value = '';
        const wasRaw = process.stdin.isRaw;
        if (process.stdin.setRawMode) process.stdin.setRawMode(true);
        process.stdin.resume();
        const onData = (chunk) => {
          const key = chunk.toString('utf8');
          if (key === '\r' || key === '\n') {
            process.stdin.removeListener('data', onData);
            if (process.stdin.setRawMode) process.stdin.setRawMode(Boolean(wasRaw));
            if (!wasRaw) process.stdin.pause();
            process.stdout.write('\n');
            resolve(value);
          } else if (key === '\x1b' || key === '\x1b\x1b' || key === '\x03') {
            process.stdin.removeListener('data', onData);
            if (process.stdin.setRawMode) process.stdin.setRawMode(Boolean(wasRaw));
            if (!wasRaw) process.stdin.pause();
            process.stdout.write('\n');
            resolve(null);
          } else if (key === '\x7f' || key === '\b') {
            if (value.length > 0) {
              value = value.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else if (key.length === 1 && key.charCodeAt(0) >= 32) {
            value += key;
            process.stdout.write('*');
          }
        };
        process.stdin.on('data', onData);
      });
    }
    const value = await rl.question(`  ${prompt}${defaultValue ? ` [${defaultValue}]` : ''}: `);
    return (value || defaultValue || '').trim();
  } catch (err) {
    if (err && (err.code === 'ABORT_ERR' || err.message === 'aborted')) return null;
    throw err;
  } finally {
    rl.close();
  }
}

async function classicConfirm({ title, detail }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('');
    console.log(`  ${title}`);
    if (detail) for (const line of detail.split('\n')) console.log(`    ${line}`);
    const answer = (await rl.question(`  [y/N]: `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes' || answer === 's' || answer === 'si';
  } finally {
    rl.close();
  }
}

async function confirmAsSelect(state, options) {
  const title = options?.title || 'Confirm';
  const detail = options?.detail || '';
  const choice = await askSelect(state, null, {
    title,
    subtitle: detail,
    items: [
      { key: true, label: 'Yes' },
      { key: false, label: 'No' },
    ],
    initialIndex: 1,
    getLabel: (item) => item.label,
    getValue: (item) => item.key,
  });
  return choice === true;
}

function askSelect(state, deps, options) {
  if (state && typeof state.tuiSelect === 'function') {
    return state.tuiSelect(options);
  }
  return classicSelect(options);
}

function askInput(state, deps, options) {
  if (state && typeof state.tuiInput === 'function') {
    return state.tuiInput(options);
  }
  return classicInput(options);
}

function askConfirm(state, deps, options) {
  if (state && typeof state.tuiSelect === 'function') {
    return confirmAsSelect(state, options);
  }
  if (state && typeof state.tuiConfirm === 'function') {
    return state.tuiConfirm(options.title, options.detail || '');
  }
  return classicConfirm(options);
}

module.exports = {
  askSelect,
  askInput,
  askConfirm,
  classicSelect,
  classicInput,
  classicConfirm,
  stripAnsi,
  pad,
};
