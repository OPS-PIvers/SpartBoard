import { describe, it, expect } from 'vitest';
import {
  ROLLOUT_ONLY_SWITCHES,
  countAccessMatches,
  featuresTabFeatures,
  groupChildLabel,
  matchesSearch,
  previewFeatures,
  previewGroupChildren,
  switchForFeature,
} from './accessSearch';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { ROLLOUT_SWITCHES } from '@/config/rolloutSwitches';
import type { GlobalFeature } from '@/types';

describe('matchesSearch', () => {
  it('needs every word, in any field, ignoring case', () => {
    expect(matchesSearch('quiz ALOUD', ['Quiz read-aloud', 'id'])).toBe(true);
    expect(matchesSearch('quiz spotify', ['Quiz read-aloud'])).toBe(false);
    expect(matchesSearch('  ', ['anything'])).toBe(true);
  });
});

describe('countAccessMatches', () => {
  it('counts matches on each Access tab without mounting it', () => {
    const counts = countAccessMatches('paper answer');
    expect(counts.features).toBe(0);
    expect(counts.previews).toBeGreaterThan(0);
  });

  it('finds Record on the widget tab, not Global Settings', () => {
    const counts = countAccessMatches('record');
    expect(counts.widgets).toBeGreaterThan(0);
  });
});

describe('rollout switches on the Previews tab', () => {
  it('shows every switch, either on its flag row or under District switches', () => {
    for (const sw of ROLLOUT_SWITCHES) {
      const shown = sw.feature
        ? switchForFeature(sw.feature) === sw
        : ROLLOUT_ONLY_SWITCHES.includes(sw);
      expect(shown, sw.title).toBe(true);
    }
  });
});

describe('preview groups', () => {
  it('nests every Import add-on under Import anything while it is in preview', () => {
    const all = previewFeatures();
    const kids = previewGroupChildren('universal-import', all);
    expect(kids).toContain('import-google-forms');
    expect(
      kids.every((id) => FEATURE_DEFAULTS[id].requires === 'universal-import')
    ).toBe(true);
    expect(previewGroupChildren('universal-import', kids)).toEqual([]);
    expect(previewGroupChildren('paper-answer-sheets', all)).toEqual([]);
  });

  it('nests the paid Speech to text extras under Speech to text', () => {
    const all = previewFeatures();
    expect(previewGroupChildren('speech-to-text', all)).toEqual([
      'speech-to-text-ai-transcription',
      'speech-to-text-tidy-up',
    ]);
    expect(groupChildLabel('speech-to-text-ai-transcription')).toBe(
      'AI transcription'
    );
    expect(groupChildLabel('speech-to-text-tidy-up')).toBe('Tidy up');
  });

  it('lists them under Features > Students once graduated', () => {
    const graduated = new Set<GlobalFeature>([
      'speech-to-text-ai-transcription',
      'speech-to-text-tidy-up',
    ]);
    for (const id of graduated) {
      expect(previewFeatures(graduated)).not.toContain(id);
      expect(featuresTabFeatures(graduated)).toContain(id);
      expect(FEATURE_DEFAULTS[id].category).toBe('students');
    }
  });

  it('drops the parent prefix from a nested label', () => {
    expect(groupChildLabel('import-extension-send')).toBe(
      'Send from the Chrome extension'
    );
    expect(groupChildLabel('import-pdf')).toBe('PDF');
  });
});
