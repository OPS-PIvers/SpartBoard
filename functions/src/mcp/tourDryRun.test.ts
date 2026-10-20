import { describe, expect, it } from 'vitest';
import {
  dryRunTour,
  meetsBookends,
  type DryRunStep,
  type DryRunSetup,
} from './tourDryRun';

const step = (
  anchor: string,
  action = 'observe',
  extra: Partial<DryRunStep> & { value?: unknown; slot?: number } = {}
): DryRunStep => {
  const { value, slot, ...rest } = extra;
  return {
    id: `s-${anchor}-${action}`,
    label: `Go to ${anchor}`,
    text: 'Do this.',
    tour: {
      anchor,
      action,
      ...(value !== undefined ? { value } : {}),
      ...(slot !== undefined ? { slot } : {}),
    },
    ...rest,
  };
};

const board: DryRunSetup = { widgets: [] };
const messages = (list: { message: string }[]) => list.map((p) => p.message);

describe('dryRunTour', () => {
  it('passes a tour that opens each panel before pointing into it', () => {
    const report = dryRunTour(
      [
        step('board.whole'),
        step('sidebar.open-menu', 'click'),
        step('sidebar.classes', 'click'),
      ],
      board
    );
    expect(report.errors).toEqual([]);
  });

  it('refuses a step whose panel no earlier step opens, naming the path', () => {
    const report = dryRunTour(
      [
        step('board.whole'),
        step('sidebar.classes', 'click'),
        step('board.whole'),
      ],
      board
    );
    expect(messages(report.errors)).toEqual([
      expect.stringContaining('only shows once "sidebar.open-menu" is clicked'),
    ]);
  });

  it('accepts a second way into a panel', () => {
    const open = [
      step('sidebar.open-menu', 'click'),
      step('sidebar.classes', 'click'),
    ];
    const viaNew = dryRunTour(
      [...open, step('classes.new-class', 'click'), step('roster-editor.save')],
      board
    );
    expect(viaNew.errors).toEqual([]);
    const notOpened = dryRunTour([...open, step('roster-editor.save')], board);
    expect(messages(notOpened.errors)).toEqual([
      expect.stringContaining('only shows once "classes.edit-roster:classes"'),
    ]);
  });

  it('lets the runner open a drawer the anchor requires', () => {
    const report = dryRunTour(
      [
        step('board.whole'),
        step('settings.field:clock#clockStyle'),
        step('board.whole'),
      ],
      { widgets: ['clock'] }
    );
    expect(report.errors).toEqual([]);
  });

  it('refuses unknown anchors, bare per-type refs and made-up field keys', () => {
    const report = dryRunTour(
      [
        step('nope.button', 'click'),
        step('dock.item', 'click'),
        step('settings.field:clock#notAField'),
      ],
      { widgets: ['clock'] }
    );
    expect(messages(report.errors)).toEqual([
      expect.stringContaining('"nope.button" is not a registered anchor'),
      expect.stringContaining('write "dock.item:<type>"'),
      expect.stringContaining('"clock#notAField" is not a field'),
    ]);
  });

  it('refuses a widget control when the widget is not on the board', () => {
    const report = dryRunTour(
      [
        step('board.whole'),
        step('settings.field:clock#clockStyle'),
        step('board.whole'),
      ],
      board
    );
    expect(messages(report.errors)).toEqual([
      expect.stringContaining(
        'the clock widget, which is not on the board yet'
      ),
    ]);
  });

  it('counts a widget added from the dock earlier in the tour as on the board', () => {
    const report = dryRunTour(
      [
        step('dock.item:clock', 'click'),
        step('settings.field:clock#clockStyle'),
        step('board.whole'),
      ],
      board
    );
    expect(report.errors).toEqual([]);
  });

  it('warns on a slot nothing binds and a type step left to the teacher', () => {
    const report = dryRunTour(
      [
        step('board.whole', 'observe', { slot: 2 }),
        step('sidebar.open-menu', 'type', { value: '' }),
        step('board.whole'),
      ],
      board
    );
    expect(report.errors).toEqual([]);
    expect(messages(report.warnings)).toEqual([
      expect.stringContaining('slot 2 is not a widget'),
      expect.stringContaining('Autopilot hands it to the teacher'),
    ]);
  });

  it('warns that the quiz editor has no Save button', () => {
    const report = dryRunTour([step('editor.save:quiz', 'click')], board);
    expect(messages(report.warnings)).toContainEqual(
      expect.stringContaining('the quiz editor saves as you go')
    );
  });

  it('warns that the video activity editor has no Save button', () => {
    const report = dryRunTour(
      [step('editor.save:video-activity', 'click')],
      board
    );
    expect(messages(report.warnings)).toContainEqual(
      expect.stringContaining('end with editor.close:video-activity')
    );
  });

  it('does not warn on menu positions or Help Center rows', () => {
    const report = dryRunTour(
      [
        step('library-shell.new:quiz', 'click'),
        step('library-shell.new-menu-item:quiz#item-1', 'click'),
        step('board-actions.help', 'click'),
        step('help-center.tab:help#guides', 'click'),
        step('help-center.guides.item:help#row-1', 'click'),
      ],
      { widgets: ['quiz'] }
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('warns on fallback steps, missing text, list positions and tour length', () => {
    const report = dryRunTour(
      [
        { id: 'a', tour: { anchor: '', action: 'click' } },
        step('library-shell.card-open:quiz#row-1', 'click'),
      ],
      { widgets: ['quiz'] }
    );
    expect(report.errors).toEqual([]);
    expect(messages(report.warnings)).toEqual([
      expect.stringContaining('has no text'),
      expect.stringContaining('English role and name only'),
      expect.stringContaining('points at a position in a list'),
      expect.stringContaining('The tour has 2 steps'),
    ]);
  });

  it('allows list positions in a list an earlier step opened empty', () => {
    const rows = (opener: string) =>
      messages(
        dryRunTour(
          [
            step('sidebar.classes', 'click'),
            step(opener, 'click'),
            step('roster-editor.first-name:roster-editor#row-1', 'type', {
              value: 'Ada',
            }),
          ],
          board
        ).warnings
      ).filter((m) => m.includes('position in a list'));
    expect(rows('classes.new-class')).toEqual([]);
    expect(rows('classes.import-classlink')).toHaveLength(1);
  });

  it('warns that Autopilot leaves a real-account click to the teacher', () => {
    const report = dryRunTour(
      [
        step('board.whole'),
        step('assign-modal.confirm', 'click'),
        step('board.whole'),
      ],
      board
    );
    expect(messages(report.warnings)).toEqual([
      expect.stringContaining("changes the teacher's real account"),
    ]);
  });

  it('refuses a computed key that does not match its pattern, naming the form', () => {
    const quiz = { widgets: ['quiz'] };
    const wrong = dryRunTour(
      [step('quiz-editor.option:quiz#A', 'type', { value: 'Paris' })],
      quiz
    );
    expect(messages(wrong.errors)).toEqual([
      expect.stringContaining(
        '"quiz#A" is not a key of "quiz-editor.option". Keys look like quiz#a for option A'
      ),
    ]);
    const right = dryRunTour(
      [step('quiz-editor.option:quiz#a', 'type', { value: 'Paris' })],
      quiz
    );
    expect(messages(right.errors).join()).not.toContain('is not a key');
  });

  it('refuses select on a cycle button and names the real choice', () => {
    const report = dryRunTour(
      [step('random.mode', 'select', { value: 'groups' })],
      { widgets: ['random'] }
    );
    expect(messages(report.errors)).toEqual([
      expect.stringContaining(
        `moves to the next option on each click, so "select" can't pick one. Point the step at "settings.field:random#mode"`
      ),
    ]);
  });

  it('accepts select on a segmented settings field', () => {
    const report = dryRunTour(
      [step('settings.field:random#mode', 'select', { value: 'groups' })],
      { widgets: ['random'] }
    );
    expect(report.errors).toEqual([]);
  });

  it('refuses select on a number field or a switch', () => {
    const number = dryRunTour(
      [step('settings.field:calendar#daysVisible', 'select', { value: '5' })],
      { widgets: ['calendar'] }
    );
    expect(messages(number.errors)).toEqual([
      expect.stringContaining('is a number field, not a choice'),
    ]);
    const toggle = dryRunTour(
      [step('settings.toggle:random#soundEnabled', 'select', { value: 'on' })],
      { widgets: ['random'] }
    );
    expect(messages(toggle.errors)).toEqual([
      expect.stringContaining('use "toggle"'),
    ]);
  });
});

const say = (text: string, label = 'Open the menu'): DryRunStep => ({
  ...step('board.whole'),
  label,
  text,
});

describe('dryRunTour authoring checks', () => {
  const bookended = [
    step('board.whole'),
    step('sidebar.open-menu', 'click'),
    step('board.whole'),
  ];

  it('reports bookends only when asked, as an error or a warning', () => {
    const open = [step('sidebar.open-menu', 'click'), step('board.whole')];
    const shut = [step('board.whole'), step('sidebar.open-menu', 'click')];
    expect(dryRunTour(open, board).errors).toEqual([]);
    expect(
      messages(dryRunTour(open, board, { bookends: 'error' }).errors)
    ).toEqual([expect.stringContaining('the first step should observe')]);
    expect(
      messages(dryRunTour(shut, board, { bookends: 'warn' }).warnings)
    ).toContainEqual(expect.stringContaining('the last step should be'));
    expect(dryRunTour(bookended, board, { bookends: 'error' }).errors).toEqual(
      []
    );
    expect(meetsBookends(bookended)).toBe(true);
    expect(meetsBookends(open)).toBe(false);
  });

  it('flags voice problems in text and labels', () => {
    const report = dryRunTour(
      [
        say('Click **Assign** — then pick a class.'),
        say('Tip: drag the corner.'),
        say(Array.from({ length: 31 }, () => 'word').join(' ')),
        say('Just click **Assign**.'),
        say('Click it.', 'Open'),
        say('Click it.', 'The settings gear'),
        say('Click it.', 'Open the menu and pick a class'),
        say('Click **Assign**.'),
      ],
      board
    );
    expect(messages(report.warnings)).toEqual([
      expect.stringContaining('em dash'),
      expect.stringContaining('"Tip:" or "Note:"'),
      expect.stringContaining('over 30 words'),
      expect.stringContaining('says "Just"'),
      expect.stringContaining('label is 1 word'),
      expect.stringContaining('label starts with "The"'),
      expect.stringContaining('label is 7 words'),
    ]);
  });

  it('flags a staged widget the Dock also adds, or that no step points at', () => {
    const doubled = dryRunTour(
      [
        step('board.whole'),
        step('dock.item:clock', 'click'),
        step('board.whole'),
      ],
      { widgets: ['clock'] }
    );
    expect(messages(doubled.warnings)).toEqual([
      expect.stringContaining('tour_widgets already stages one'),
    ]);
    const unused = dryRunTour(bookended, { widgets: ['timer'] });
    expect(messages(unused.warnings)).toEqual([
      expect.stringContaining('stages "timer", but no step points at it'),
    ]);
    const lookOnly = dryRunTour([step('board.whole'), step('board.whole')], {
      widgets: ['timer'],
    });
    expect(messages(lookOnly.warnings)).not.toContainEqual(
      expect.stringContaining('no step points at it')
    );
  });

  it('flags a material no step opens', () => {
    const report = dryRunTour(bookended, {
      widgets: [],
      materials: [{ kind: 'quiz', source: 'created', label: 'A quiz' }],
    });
    expect(messages(report.warnings)).toEqual([
      expect.stringContaining('no step opens the quiz'),
    ]);
  });

  it('warns on a step inside a panel an earlier step closed', () => {
    const into = [
      step('dock.open-tools', 'click'),
      step('dock.more-widgets', 'click'),
      step('library.close', 'click'),
    ];
    const closed = dryRunTour([...into, step('library.search')], board);
    expect(closed.errors).toEqual([]);
    expect(messages(closed.warnings)).toEqual([
      expect.stringContaining(
        'is on a panel that steps[2] ("Go to library.close") closed'
      ),
    ]);
    const reopened = dryRunTour(
      [...into, step('dock.more-widgets', 'click'), step('library.search')],
      board
    );
    expect(reopened.warnings).toEqual([]);
  });

  it('closes the sidebar menu and the panels opened from it', () => {
    const report = dryRunTour(
      [
        step('sidebar.open-menu', 'click'),
        step('sidebar.classes', 'click'),
        step('sidebar.close-menu', 'click'),
        step('classes.new-class', 'click'),
      ],
      board
    );
    expect(messages(report.warnings)).toEqual([
      expect.stringContaining('click "sidebar.classes" first'),
    ]);
  });

  it('closes the editor a Close button sits in', () => {
    const report = dryRunTour(
      [
        step('library-shell.new:quiz', 'click'),
        step('library-shell.new-menu-item:quiz#item-1', 'click'),
        step('quiz-editor.add-question:quiz', 'click'),
        step('editor.close:quiz', 'click'),
        step('quiz-editor.add-question:quiz'),
      ],
      {
        widgets: ['quiz'],
        materials: [{ kind: 'quiz', source: 'created', label: 'A quiz' }],
      }
    );
    expect(report.errors).toEqual([]);
    expect(messages(report.warnings)).toEqual([
      expect.stringContaining('closed, and no step after that opens it again'),
    ]);
  });

  it('warns on settings steps on two widgets back to back', () => {
    const report = dryRunTour(
      [
        step('settings.field:clock#clockStyle'),
        step('settings.field:random#mode'),
      ],
      { widgets: ['clock', 'random'] }
    );
    expect(messages(report.warnings)).toContainEqual(
      expect.stringContaining('settings step on a different widget')
    );
    const between = dryRunTour(
      [
        step('settings.field:clock#clockStyle'),
        step('widget.settings-opener:random', 'click'),
        step('settings.field:random#mode'),
      ],
      { widgets: ['clock', 'random'] }
    );
    expect(messages(between.warnings)).not.toContainEqual(
      expect.stringContaining('settings step on a different widget')
    );
  });
});
