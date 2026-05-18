import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use stable version in development to avoid false positive update notifications
const isDev =
  process.env.NODE_ENV === 'development' ||
  process.env.npm_lifecycle_event === 'dev';

const publicDir = path.resolve(__dirname, '../public');

// Try to derive the release id from the curated changelog so the toast,
// the served version, and the modal all show the same value. Fall back to
// a timestamp if the changelog is missing or empty.
const readLatestChangelogVersion = () => {
  try {
    const changelogPath = path.join(publicDir, 'changelog.json');
    if (!fs.existsSync(changelogPath)) return null;
    const raw = fs.readFileSync(changelogPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.entries)) {
      console.warn(
        'changelog.json is missing an "entries" array, falling back to timestamp.'
      );
      return null;
    }
    const first = parsed.entries[0]?.version;
    return typeof first === 'string' && first.length > 0 ? first : null;
  } catch (error) {
    console.warn(
      'Could not read changelog.json, falling back to timestamp:',
      error.message
    );
    return null;
  }
};

const timestamp = new Date().getTime().toString();
const version = isDev ? 'dev' : (readLatestChangelogVersion() ?? timestamp);
const buildDate = isDev ? 'dev' : new Date().toISOString();

const versionInfo = {
  version,
  buildDate,
};

try {
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Ensure public/.gitignore exists and includes version.json
  const publicGitignorePath = path.join(publicDir, '.gitignore');
  if (!fs.existsSync(publicGitignorePath)) {
    fs.writeFileSync(publicGitignorePath, 'version.json\n');
    console.log('Created public/.gitignore with version.json');
  } else {
    // Check if version.json is in the ignore file
    const content = fs.readFileSync(publicGitignorePath, 'utf8');
    const hasVersionIgnore = content
      .split('\n')
      .map((line) => line.trim())
      .includes('version.json');

    if (!hasVersionIgnore) {
      const prefix = content.endsWith('\n') || content.length === 0 ? '' : '\n';
      fs.appendFileSync(publicGitignorePath, `${prefix}version.json\n`);
      console.log('Added version.json to public/.gitignore');
    }
  }

  fs.writeFileSync(
    path.join(publicDir, 'version.json'),
    JSON.stringify(versionInfo, null, 2)
  );

  console.log(`Generated version.json: ${versionInfo.version}`);
} catch (error) {
  console.error('Failed to generate version.json:', error);
  process.exit(1);
}
