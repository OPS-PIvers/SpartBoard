import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Player, student-app and interaction files whose visible strings go through i18n (GL plan P8-8).
const FILES = [
  'components/guidedLearning/GuidedLearningStudentApp.tsx',
  'components/guidedLearning/GuidedLearningPeriodLockedScreen.tsx',
  'components/widgets/GuidedLearning/components/GuidedLearningPlayer.tsx',
  'components/widgets/GuidedLearning/components/GuidedLearningStage.tsx',
  'components/widgets/GuidedLearning/components/interactions/AudioInteraction.tsx',
  'components/widgets/GuidedLearning/components/interactions/BannerInteraction.tsx',
  'components/widgets/GuidedLearning/components/interactions/QuestionInteraction.tsx',
  'components/widgets/GuidedLearning/components/interactions/SpotlightInteraction.tsx',
  'components/widgets/GuidedLearning/components/interactions/TextPopoverInteraction.tsx',
  'components/widgets/GuidedLearning/components/interactions/TooltipInteraction.tsx',
  'components/widgets/GuidedLearning/components/interactions/VideoInteraction.tsx',
  'components/widgets/GuidedLearning/components/player/FooterOverflow.tsx',
  'components/widgets/GuidedLearning/components/player/ResumePrompt.tsx',
  'components/widgets/GuidedLearning/components/player/SpeedControl.tsx',
  'components/widgets/GuidedLearning/components/player/StepOutline.tsx',
  'components/widgets/GuidedLearning/components/player/WatchScrubber.tsx',
];

/** Source with comments removed (block, JSX and line comments). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Likely user-facing English: JSX text, text attributes and sentence-like literals. */
function hardcodedEnglish(src: string): string[] {
  const code = stripComments(src);
  const hits: string[] = [];
  const patterns = [
    // JSX text between tags on one line, or a line of bare text inside JSX.
    /(?<![=\-\s])>\s*([A-Za-z][^<>{}\n]*[A-Za-z.!?:])\s*</g,
    /^\s+([A-Z][a-z']+(?: [A-Za-z'.,!?:]+)+)\s*$/gm,
    // Text attributes given as a plain string.
    /\b(?:aria-label|title|placeholder|alt|label|message)="([^"]*[A-Za-z]{2,}[^"]*)"/g,
    // Sentence-like string literals: a capitalised word followed by more words.
    /'([A-Z][a-z']*(?: [A-Za-z'.,!?:…-]+)+)'/g,
    /"([A-Z][a-z']*(?: [A-Za-z'.,!?:…-]+)+)"/g,
    /`([A-Z][a-z]+ [^`]*)`/g,
    // A number or name followed by a word, as in ` · ${n} steps`.
    /`[^`a-z-]*\$\{[^}]+\}\s+([a-z]{3,})`/g,
    // Single-word labels passed as fallbacks or ternary branches.
    /(?:\?\?|\?|:)\s*'([A-Z][a-z]+)'/g,
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) hits.push(m[1].trim());
  }
  return hits;
}

describe('Guided Learning player and student app strings', () => {
  it.each(FILES)('%s has no hard-coded English', (file) => {
    const src = readFileSync(resolve(__dirname, '..', file), 'utf8');
    expect(hardcodedEnglish(src)).toEqual([]);
  });

  // These surfaces are dark, where slate-400/500 text falls below AA (components/CLAUDE.md).
  it.each(FILES)(
    '%s has no slate-400/500 text on its dark surfaces',
    (file) => {
      const src = readFileSync(resolve(__dirname, '..', file), 'utf8');
      expect(src.match(/\btext-slate-(?:400|500|600)\b/g) ?? []).toEqual([]);
    }
  );

  it('catches the kinds of string the check is for', () => {
    expect(
      new Set(
        hardcodedEnglish(
          [
            '<p>Answer recorded</p>',
            '<button aria-label="Close player" />',
            'setSeatError("Couldn\'t join your class.");',
            "{step.label ?? 'Audio'}",
            '<p>',
            '  Keep this tab open',
            '</p>',
            '`Step ${n}`',
            '` · ${count} steps`',
          ].join('\n')
        )
      )
    ).toEqual(
      new Set([
        'Answer recorded',
        'Keep this tab open',
        'Close player',
        "Couldn't join your class.",
        'Step ${n}',
        'Audio',
        'steps',
      ])
    );
  });
});
