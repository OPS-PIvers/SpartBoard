// Starts the vite-verify server (dummy Firebase, auth bypass) from its .claude/launch.json entry, for terminals without preview_start.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const launch = JSON.parse(
  readFileSync(new URL('../.claude/launch.json', import.meta.url), 'utf8')
);
const config = launch.configurations.find((c) => c.name === 'vite-verify');
if (!config) {
  console.error('No vite-verify entry in .claude/launch.json.');
  process.exit(1);
}
const child = spawn(config.runtimeExecutable, config.runtimeArgs, {
  env: { ...process.env, ...config.env },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
