// Finds the Firestore emulator jar, which carries Firebase's own rules compiler.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export function findEmulatorJar() {
  const fromEnv = process.env.FIRESTORE_EMULATOR_JAR;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;
  const dir = path.join(homedir(), '.cache', 'firebase', 'emulators');
  if (!existsSync(dir)) return null;
  const jars = readdirSync(dir)
    .filter((f) => /^cloud-firestore-emulator-v[\d.]+\.jar$/.test(f))
    .sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  return jars.length ? path.join(dir, jars[jars.length - 1]) : null;
}
