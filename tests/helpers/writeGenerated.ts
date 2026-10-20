import { writeFileSync } from 'fs';
import { format, resolveConfig } from 'prettier';

/** Writes a generated source file the way the pre-commit hook would format it, so a rerun leaves no diff. */
export async function writeGenerated(file: string, text: string) {
  const config = await resolveConfig(file);
  writeFileSync(file, await format(text, { ...config, filepath: file }));
}
