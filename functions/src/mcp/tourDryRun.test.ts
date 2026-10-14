import { describe, expect, it } from 'vitest';
import { dryRunTour, type DryRunStep, type DryRunSetup } from './tourDryRun';

const step = (
  anchor: string,
  action = 'observe',
  extra: Partial<DryRunStep> & { value?: unknown; slot?: number } = {}
): DryRunStep => {
  const { value, slot, ...rest } = extra;
  return {
    id: `s-${anchor}-${action}`,
    label: anchor,
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
      expect.stringContaining('only shows once "classes.edit-roster"'),
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
});
