import { describe, it, expect } from 'vitest';
import { detectWidgetType } from './smartPaste';
import { EmbedConfig, ChecklistConfig } from '../types';

describe('detectWidgetType (Smart Paste)', () => {
  it('detects Google Slides and converts to preview URL', () => {
    const input =
      'https://docs.google.com/presentation/d/14weFpoSvOXRuO8DfhyB3cCEzX48VnCNmqShAdUh_esk/edit?slide=id.g3c33466b1b1_0_0#slide=id.g3c33466b1b1_0_0';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'create-widget') {
      expect(result.type).toBe('embed');
      const config = result.config as EmbedConfig;
      expect(config.url).toContain(
        '/presentation/d/14weFpoSvOXRuO8DfhyB3cCEzX48VnCNmqShAdUh_esk/preview'
      );
    } else {
      throw new Error('Expected create-widget action');
    }
  });

  it('detects Google Docs and converts to edit with minimal UI', () => {
    const input = 'https://docs.google.com/document/d/1abc123/view';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'create-widget') {
      expect(result.type).toBe('embed');
      const config = result.config as EmbedConfig;
      // From urlHelpers.ts: parsed.pathname = `/document/d/${docId}/edit`; parsed.searchParams.set('rm', 'minimal');
      expect(config.url).toContain('/document/d/1abc123/edit');
      expect(config.url).toContain('rm=minimal');
    } else {
      throw new Error('Expected create-widget action');
    }
  });

  it('detects YouTube and converts to embed URL', () => {
    const input = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'create-widget') {
      expect(result.type).toBe('embed');
      const config = result.config as EmbedConfig;
      expect(config.url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    } else {
      throw new Error('Expected create-widget action');
    }
  });

  it('detects Google Drive file URL and converts to preview embed', () => {
    const input = 'https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsT/view';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'create-widget') {
      expect(result.type).toBe('embed');
      const config = result.config as EmbedConfig;
      expect(config.url).toBe(
        'https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsT/preview'
      );
    } else {
      throw new Error('Expected create-widget action');
    }
  });

  it('detects Google Drive open?id= URL and converts to preview embed', () => {
    const input = 'https://drive.google.com/open?id=1aBcDeFgHiJkLmNoPqRsT';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'create-widget') {
      expect(result.type).toBe('embed');
      const config = result.config as EmbedConfig;
      expect(config.url).toBe(
        'https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsT/preview'
      );
    } else {
      throw new Error('Expected create-widget action');
    }
  });

  it('detects Google Vids URL and converts to preview embed', () => {
    const input = 'https://vids.google.com/vids/some_vid_id-123';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'create-widget') {
      expect(result.type).toBe('embed');
      const config = result.config as EmbedConfig;
      expect(config.url).toBe(
        'https://vids.google.com/vids/some_vid_id-123/preview'
      );
    } else {
      throw new Error('Expected create-widget action');
    }
  });

  it('detects Google Vids URL with user segment and converts to preview embed', () => {
    const input = 'https://vids.google.com/u/0/vids/some_vid_id-123';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'create-widget') {
      expect(result.type).toBe('embed');
      const config = result.config as EmbedConfig;
      expect(config.url).toBe(
        'https://vids.google.com/vids/some_vid_id-123/preview'
      );
    } else {
      throw new Error('Expected create-widget action');
    }
  });

  it('does not treat Google Drive folder URLs as embeddable', () => {
    const input =
      'https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsT';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    expect(result?.action).toBe('prompt-url-or-qr');
  });

  it('detects other URLs and returns prompt-url-or-qr action', () => {
    const input = 'https://google.com';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'prompt-url-or-qr') {
      expect(result.url).toBe('https://google.com');
    } else {
      throw new Error('Expected prompt-url-or-qr action');
    }
  });

  it('detects HTML content', () => {
    const input = '<html><title>My App</title><body>Hello</body></html>';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'create-mini-app') {
      expect(result.title).toBe('My App');
      expect(result.html).toBe(input);
    } else {
      throw new Error('Expected create-mini-app action');
    }
  });

  it('detects HTML starting with <!DOCTYPE html>', () => {
    const input =
      '<!DOCTYPE html><html><title>Full Doc</title><body>Hello</body></html>';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'create-mini-app') {
      expect(result.title).toBe('Full Doc');
      expect(result.html).toBe(input);
    } else {
      throw new Error('Expected create-mini-app action');
    }
  });

  it('detects Share Links', () => {
    const input = 'https://myapp.com/share/12345';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'import-board') {
      expect(result.url).toBe(input);
    } else {
      throw new Error('Expected import-board action');
    }
  });

  it('detects ambiguous checklists and prompts the user', () => {
    const input = 'Buy milk\nWalk the dog\nFinish the review';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'prompt-text-or-checklist') {
      expect(result.text).toBe(input);
    } else {
      throw new Error('Expected prompt-text-or-checklist action');
    }
  });

  it('detects paragraph-separated checklists', () => {
    const input = 'First item\n\nSecond item\n\nThird item';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'create-widget') {
      expect(result.type).toBe('checklist');
      const config = result.config as ChecklistConfig;
      expect(config.items).toHaveLength(3);
      expect(config.items[0].text).toBe('First item');
    } else {
      throw new Error('Expected create-widget action');
    }
  });

  it('detects quiz share URLs', () => {
    const input = 'https://spartboard.web.app/share/quiz/abc123';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'import-quiz') {
      expect(result.shareId).toBe('abc123');
    } else {
      throw new Error('Expected import-quiz action');
    }
  });

  it('detects quiz share URLs with bare domain', () => {
    const input = 'spartboard.web.app/share/quiz/xyz789';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'import-quiz') {
      expect(result.shareId).toBe('xyz789');
    } else {
      throw new Error('Expected import-quiz action');
    }
  });

  it('does not treat quiz share URLs as board imports', () => {
    const input = 'https://spartboard.web.app/share/quiz/abc123';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    expect(result?.action).toBe('import-quiz');
    expect(result?.action).not.toBe('import-board');
  });

  it('still detects board share URLs correctly', () => {
    const input = 'https://myapp.com/share/boardId123';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'import-board') {
      expect(result.url).toBe(input);
    } else {
      throw new Error('Expected import-board action');
    }
  });

  it('defaults to text widget for long prose', () => {
    const input =
      'This is a very long paragraph that should definitely be treated as a text widget rather than a checklist, even if it has multiple lines that are not clearly separated into a list format. It contains multiple sentences and is quite long in terms of character count per line or paragraph.';
    const result = detectWidgetType(input);

    expect(result).not.toBeNull();
    if (result?.action === 'create-widget') {
      expect(result.type).toBe('text');
    } else {
      throw new Error('Expected create-widget action');
    }
  });
});
