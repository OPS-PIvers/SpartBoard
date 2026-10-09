import { TOOLS } from '@/config/tools';

const TOOL_LABEL = new Map<string, string>(TOOLS.map((t) => [t.type, t.label]));

// Where in the app an anchor lives, from its id prefix; widget prefixes use the widget's name.
const AREA_BY_PREFIX: Record<string, string> = {
  dock: 'Dock',
  library: 'Widget library',
  widget: 'Widget toolbar',
  settings: 'Widget settings',
  'widget-defaults': 'Widget settings',
  sidebar: 'Menu and top bar',
  annotate: 'Menu and top bar',
  board: 'Board',
  'board-actions': 'Board',
  'board-nav': 'Board',
  boards: 'Boards and sharing',
  'share-link': 'Boards and sharing',
  'sub-share': 'Boards and sharing',
  profile: 'Profile & Settings',
  appearance: 'Profile & Settings',
  behavior: 'Profile & Settings',
  language: 'Profile & Settings',
  'connected-apps': 'Profile & Settings',
  classes: 'My Classes',
  'roster-editor': 'My Classes',
  'classlink-import': 'My Classes',
  'schoology-link': 'My Classes',
  'assign-destination': 'Assign',
  'assign-step': 'Assign',
  'assign-stepper': 'Assign',
  'library-shell': 'Libraries',
  editor: 'Libraries',
  modal: 'Dialogs',
  quiz: 'Quiz',
  'quiz-editor': 'Quiz',
  'quiz-settings': 'Quiz',
  'review-start': 'Review',
  'review-game': 'Review',
  projects: 'Projects',
  'projects-editor': 'Projects',
  'help-center': 'Help Center',
  admin: 'Admin settings',
  teams: 'Teams',
  plcs: 'Teams',
  'admin-plc': 'Admin settings',
};

/** The area heading an anchor id sorts under in the list. */
export function anchorArea(id: string): string {
  const [prefix, rest = ''] = id.split('.');
  if (prefix === 'widget-settings') {
    const type = rest.split('.')[0];
    return `${TOOL_LABEL.get(type) ?? humanize(type)} settings`;
  }
  if (prefix.startsWith('activity-wall')) return 'Activity Wall';
  if (prefix.startsWith('plc-')) return 'Teams';
  return AREA_BY_PREFIX[prefix] ?? TOOL_LABEL.get(prefix) ?? humanize(prefix);
}

/** A widget type's display name, for on-screen rows inside a widget. */
export const toolName = (type: string): string =>
  TOOL_LABEL.get(type) ?? humanize(type);

/** A registry label without its "in the ..." location, which the area heading already says. */
export function anchorName(label: string): string {
  const head = label
    .replace(/^(A|An|The) /, '')
    .split(/ (?:in|inside) | (?:on|for) (?:the |a |an )/)[0]
    .split(/, by /)[0];
  return head.charAt(0).toUpperCase() + head.slice(1);
}

const humanize = (s: string) => {
  const words = s.replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};
