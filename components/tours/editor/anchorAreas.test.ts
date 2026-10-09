import { describe, expect, it } from 'vitest';
import { anchorArea, anchorName } from './anchorAreas';

describe('anchorAreas', () => {
  it('drops the location from a registry label', () => {
    expect(anchorName('Revoke invite button in the PLC edit modal')).toBe(
      'Revoke invite button'
    );
    expect(anchorName('A student row in the roster editor')).toBe(
      'Student row'
    );
    expect(anchorName('Turn on sound toggle in Timer settings')).toBe(
      'Turn on sound toggle'
    );
  });

  it('names the area from the id prefix', () => {
    expect(anchorArea('dock.item')).toBe('Dock');
    expect(anchorArea('plc-notes.title')).toBe('Teams');
    expect(anchorArea('widget-settings.time-tool.mode')).toBe('Timer settings');
  });
});
