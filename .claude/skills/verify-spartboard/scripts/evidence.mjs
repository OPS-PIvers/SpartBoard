#!/usr/bin/env node
// Evidence folder helper for verify-spartboard runs. Run from the repo root.
//   node .claude/skills/verify-spartboard/scripts/evidence.mjs new <feature-id> [entry-point]  -> prints run dir
//   node .claude/skills/verify-spartboard/scripts/evidence.mjs add <run-dir> <source-file> <name>
//   node .claude/skills/verify-spartboard/scripts/evidence.mjs note <run-dir> "<text>"
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [cmd, ...args] = process.argv.slice(2);
const git = (c) => {
  try {
    return execFileSync('git', c.split(' '), { encoding: 'utf8' }).trim();
  } catch {
    return '?';
  }
};
const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

if (cmd === 'new') {
  const [feature, entry = 'default'] = args;
  if (!feature) die('usage: new <feature-id> [entry-point]');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const dir = path.join('.claude', 'verify-runs', `${stamp}-${feature}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'run.md'),
    `# ${feature} via ${entry}\n\n- started: ${new Date().toISOString()}\n- checkout: ${git('rev-parse --abbrev-ref HEAD')} @ ${git('rev-parse --short HEAD')}\n\n## Log\n\n`
  );
  console.log(dir);
} else if (cmd === 'add') {
  const [dir, src, name] = args;
  if (!dir || !src || !name) die('usage: add <run-dir> <source-file> <name>');
  if (!fs.existsSync(src)) die(`no such file: ${src}`);
  const dest = path.join(dir, name.includes('.') ? name : name + path.extname(src));
  fs.copyFileSync(src, dest);
  fs.appendFileSync(path.join(dir, 'run.md'), `- artifact: ${path.basename(dest)}\n`);
  console.log(dest);
} else if (cmd === 'note') {
  const [dir, ...text] = args;
  if (!dir || !text.length) die('usage: note <run-dir> "<text>"');
  fs.appendFileSync(path.join(dir, 'run.md'), `- ${text.join(' ')}\n`);
} else {
  die('commands: new | add | note');
}
