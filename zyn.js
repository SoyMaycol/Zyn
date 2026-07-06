#!/usr/bin/env node
const { main } = require('./src/cli/runtime');
main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
