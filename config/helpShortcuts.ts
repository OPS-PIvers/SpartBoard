// Typed keyboard-shortcut and gesture data for the Help center's Shortcuts tab — see the P1-1 PR description's audit table. Keep in sync with the actual bindings, not the reverse.

export type HelpShortcutGroup = 'board' | 'widget';

export interface HelpShortcut {
  id: string;
  keys: string[];
  group: HelpShortcutGroup;
  labelKey: string;
}

export interface HelpGesture {
  id: string;
  group: HelpShortcutGroup;
  labelKey: string;
  descriptionKey: string;
}

export const HELP_SHORTCUTS: HelpShortcut[] = [
  {
    id: 'open-help',
    keys: ['Ctrl/⌘', '/'],
    group: 'board',
    labelKey: 'helpCenter.shortcuts.open-help',
  },
  {
    id: 'switch-boards',
    keys: ['Alt', '←/→'],
    group: 'board',
    labelKey: 'helpCenter.shortcuts.switch-boards',
  },
  {
    id: 'zoom-board',
    keys: ['Ctrl/⌘', 'Scroll'],
    group: 'board',
    labelKey: 'helpCenter.shortcuts.zoom-board',
  },
  {
    id: 'undo',
    keys: ['Ctrl/⌘', 'Z'],
    group: 'board',
    labelKey: 'helpCenter.shortcuts.undo',
  },
  {
    id: 'redo',
    keys: ['Ctrl/⌘', 'Shift', 'Z'],
    group: 'board',
    labelKey: 'helpCenter.shortcuts.redo',
  },
  {
    id: 'pin-widget',
    keys: ['Alt', 'P'],
    group: 'widget',
    labelKey: 'helpCenter.shortcuts.pin-widget',
  },
  {
    id: 'widget-settings',
    keys: ['Alt', 'S'],
    group: 'widget',
    labelKey: 'helpCenter.shortcuts.widget-settings',
  },
  {
    id: 'annotate',
    keys: ['Alt', 'D'],
    group: 'widget',
    labelKey: 'helpCenter.shortcuts.annotate',
  },
  {
    id: 'maximize',
    keys: ['Alt', 'M'],
    group: 'widget',
    labelKey: 'helpCenter.shortcuts.maximize',
  },
  {
    id: 'reset-size',
    keys: ['Alt', 'R'],
    group: 'widget',
    labelKey: 'helpCenter.shortcuts.reset-size',
  },
  {
    id: 'minimize-focused',
    keys: ['Esc'],
    group: 'widget',
    labelKey: 'helpCenter.shortcuts.minimize-focused',
  },
  {
    id: 'minimize-all',
    keys: ['Shift', 'Esc'],
    group: 'board',
    labelKey: 'helpCenter.shortcuts.minimize-all',
  },
  {
    id: 'close-focused',
    keys: ['Delete'],
    group: 'widget',
    labelKey: 'helpCenter.shortcuts.close-focused',
  },
  {
    id: 'clear-board',
    keys: ['Shift/Alt', 'Delete/Backspace'],
    group: 'board',
    labelKey: 'helpCenter.shortcuts.clear-board',
  },
  {
    id: 'annotation-delete-selected',
    keys: ['Delete/Backspace'],
    group: 'widget',
    labelKey: 'helpCenter.shortcuts.annotation-delete-selected',
  },
  {
    id: 'annotation-nudge',
    keys: ['Arrow keys'],
    group: 'widget',
    labelKey: 'helpCenter.shortcuts.annotation-nudge',
  },
];

export const HELP_GESTURES: HelpGesture[] = [
  {
    id: 'two-finger-swipe-lr',
    group: 'board',
    labelKey: 'helpCenter.gestures.two-finger-swipe-lr',
    descriptionKey: 'helpCenter.gestures.two-finger-swipe-lrDescription',
  },
  {
    id: 'two-finger-swipe-up',
    group: 'board',
    labelKey: 'helpCenter.gestures.two-finger-swipe-up',
    descriptionKey: 'helpCenter.gestures.two-finger-swipe-upDescription',
  },
  {
    id: 'one-finger-drag',
    group: 'board',
    labelKey: 'helpCenter.gestures.one-finger-drag',
    descriptionKey: 'helpCenter.gestures.one-finger-dragDescription',
  },
  {
    id: 'one-finger-swipe-edge',
    group: 'board',
    labelKey: 'helpCenter.gestures.one-finger-swipe-edge',
    descriptionKey: 'helpCenter.gestures.one-finger-swipe-edgeDescription',
  },
  {
    id: 'one-finger-double-tap',
    group: 'board',
    labelKey: 'helpCenter.gestures.one-finger-double-tap',
    descriptionKey: 'helpCenter.gestures.one-finger-double-tapDescription',
  },
  {
    id: 'widget-two-finger-swipe-down-restore',
    group: 'widget',
    labelKey: 'helpCenter.gestures.widget-two-finger-swipe-down-restore',
    descriptionKey:
      'helpCenter.gestures.widget-two-finger-swipe-down-restoreDescription',
  },
  {
    id: 'widget-two-finger-swipe-up',
    group: 'widget',
    labelKey: 'helpCenter.gestures.widget-two-finger-swipe-up',
    descriptionKey: 'helpCenter.gestures.widget-two-finger-swipe-upDescription',
  },
  {
    id: 'two-finger-long-press',
    group: 'widget',
    labelKey: 'helpCenter.gestures.two-finger-long-press',
    descriptionKey: 'helpCenter.gestures.two-finger-long-pressDescription',
  },
  {
    id: 'one-finger-long-press',
    group: 'widget',
    labelKey: 'helpCenter.gestures.one-finger-long-press',
    descriptionKey: 'helpCenter.gestures.one-finger-long-pressDescription',
  },
];
