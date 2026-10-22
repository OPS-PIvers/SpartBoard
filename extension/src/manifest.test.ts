import { describe, expect, it } from 'vitest';
import manifestJson from '../manifest.json';
import { manifestFor, type Manifest } from './manifest';

const base: Manifest = manifestJson;

describe('manifest', () => {
  it('declares exactly the permissions the store justification lists', () => {
    expect(base.permissions).toEqual([
      'scripting',
      'storage',
      'alarms',
      'webNavigation',
      'sidePanel',
      'identity',
      'identity.email',
    ]);
    expect(base.host_permissions).toEqual(['<all_urls>']);
    expect(base.minimum_chrome_version).toBe('116');
  });

  it('ships no always-on content scripts (T8)', () => {
    expect(base).not.toHaveProperty('content_scripts');
    expect(base).not.toHaveProperty('web_accessible_resources');
  });

  it('lets only the prod hosts message the prod listing', () => {
    expect(manifestFor(base, 'prod').externally_connectable).toEqual({
      matches: [
        'https://spartboard.web.app/*',
        'https://spartboard.firebaseapp.com/*',
      ],
    });
  });

  it('gives the dev listing its own name and exact dev hosts', () => {
    const dev = manifestFor(base, 'dev');
    expect(dev.name).toBe('SpartBoard (dev)');
    expect(dev.externally_connectable.matches).toContain(
      'http://localhost:3004/*'
    );
    expect(dev.externally_connectable.matches).not.toContain(
      'https://spartboard.web.app/*'
    );
    for (const match of dev.externally_connectable.matches) {
      expect(match).not.toMatch(/\*\./);
    }
  });
});
