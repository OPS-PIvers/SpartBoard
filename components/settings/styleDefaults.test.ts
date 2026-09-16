import { describe, expect, it } from 'vitest';
import { computeStyleDefaults } from './styleDefaults';

const widgetDefaults = {
  content: '',
  bgColor: '#fef9c3',
  fontFamily: 'global',
  fontColor: '#334155',
};

describe('computeStyleDefaults', () => {
  it('matches when the widget still shows the built-in defaults', () => {
    const state = computeStyleDefaults(
      { content: 'Hi', bgColor: '#fef9c3' },
      widgetDefaults,
      undefined,
      undefined
    );
    expect(state.differs).toBe(false);
    expect(state.keys).toEqual(['bgColor', 'fontColor', 'fontFamily']);
  });

  it('saves only keys that differ from the building baseline, never content', () => {
    const state = computeStyleDefaults(
      { content: 'Lesson notes', bgColor: '#dcfce7', fontColor: '#334155' },
      widgetDefaults,
      { fontColor: '#334155' },
      undefined
    );
    expect(state.differs).toBe(true);
    expect(state.toSave).toEqual({ bgColor: '#dcfce7' });
  });

  it('compares against my saved default and resets to it', () => {
    const state = computeStyleDefaults(
      { fontColor: '#000000', textSizePreset: 'large' },
      widgetDefaults,
      undefined,
      { fontColor: '#ffffff' }
    );
    expect(state.differs).toBe(true);
    expect(state.resetPatch).toEqual({
      bgColor: '#fef9c3',
      fontColor: '#ffffff',
      fontFamily: 'global',
      textSizePreset: undefined,
    });
  });

  it('keeps a saved value for a key this widget never set', () => {
    const state = computeStyleDefaults(
      { bgColor: '#dcfce7' },
      widgetDefaults,
      undefined,
      { fontColor: '#ffffff' }
    );
    expect(state.toSave).toEqual({ bgColor: '#dcfce7', fontColor: '#ffffff' });
  });

  it('treats an unset key as the baseline value', () => {
    const state = computeStyleDefaults(
      { fontFamily: undefined },
      widgetDefaults,
      undefined,
      undefined
    );
    expect(state.differs).toBe(false);
  });

  it('lets building defaults win over widget defaults in the baseline', () => {
    const state = computeStyleDefaults(
      { fontColor: '#2563eb' },
      widgetDefaults,
      { fontColor: '#2563eb' },
      undefined
    );
    expect(state.differs).toBe(false);
    expect(state.toSave).toEqual({});
  });
});
