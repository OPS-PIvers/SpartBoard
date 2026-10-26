// The benchmark's tours: each step is the element a teacher clicks, recorded with the real clue capturer.

export interface BenchStep {
  /** Playwright selector for the step's target (open shadow roots are pierced). */
  target: string;
  /** Path pattern of the page the step plays on, when it differs from the start page. */
  path?: string;
  /** The iframe holding the target, by its id in the top page. */
  frame?: 'ed' | 'wd';
}

export interface BenchScenario {
  name: string;
  /** What the page stresses. */
  about: string;
  start: string;
  steps: BenchStep[];
}

export const SCENARIOS: BenchScenario[] = [
  {
    name: 'basic',
    about: 'light page, each click reveals the next control at once',
    start: '/basic.html',
    steps: [
      { target: '#create' },
      { target: '#createMenu >> text=Assignment' },
      { target: '#points' },
      { target: '#pointsMenu >> text="50"' },
      { target: '#due' },
      { target: '#dueMenu >> text=Tomorrow' },
      { target: '#assign' },
      { target: 'text=View assignment' },
    ],
  },
  {
    name: 'heavy',
    about:
      '12k-cell gradebook, a clock and presence dots mutating every 50-100ms',
    start: '/heavy.html',
    steps: [
      { target: '#filter' },
      { target: '#filterMenu >> text=Missing' },
      { target: '#sort' },
      { target: '#sortMenu >> text=Last name' },
      { target: '[aria-label="Comment on Student 230"]' },
      { target: '#post' },
      { target: '#export' },
      { target: '#exportMenu >> text=Download CSV' },
    ],
  },
  {
    name: 'spa',
    about:
      'pushState routes, skeletons, content arriving 400-700ms after the click',
    start: '/spa/home',
    steps: [
      { target: 'text=Open Biology 7', path: '/spa/home' },
      { target: '#tabs >> text=Classwork', path: '/spa/class/*' },
      { target: 'text=View Lab report', path: '/spa/class/*/work' },
      { target: 'text=Back to class', path: '/spa/class/*/work' },
      { target: '#tabs >> text=People', path: '/spa/class/*' },
      { target: 'text=Invite teachers', path: '/spa/class/*/people' },
    ],
  },
  {
    name: 'menu',
    about:
      'Docs-like menus opening on mousedown over a 1,500-paragraph document',
    start: '/menu.html',
    steps: [
      { target: '#m-insert' },
      { target: '#tbl' },
      { target: '#sizes >> text="3 x 3"' },
      { target: '#m-format' },
      { target: '#ps' },
      { target: '#styles >> text="Heading 1"' },
      { target: '#share' },
    ],
  },
  {
    name: 'shadow',
    about: '300 web components, targets inside open shadow roots',
    start: '/shadow.html',
    steps: [
      { target: 'sb-toolbar >> #np' },
      { target: 'sb-dialog >> #att' },
      { target: 'sb-dialog >> #gd' },
      { target: '[aria-label="Share post 120"]' },
      { target: 'sb-card[n="120"] >> text=Copy link' },
      { target: 'sb-toolbar >> text=Filter' },
    ],
  },
  {
    name: 'iframe',
    about:
      'steps moving between the top page, a same-site and a cross-site iframe',
    start: '/iframe.html',
    steps: [
      { target: '#open' },
      { target: 'text=Insert image', frame: 'ed' },
      { target: 'text=By URL', frame: 'ed' },
      { target: '#settings' },
      { target: '#c', frame: 'wd' },
      { target: '#save' },
    ],
  },
  {
    name: 'scroll',
    about: 'targets far apart in a scrolling container under a sticky header',
    start: '/scroll.html',
    steps: [
      { target: '[aria-label="Add lesson 20 to plan"]' },
      { target: '[aria-label="Add lesson 90 to plan"]' },
      { target: '[aria-label="Add lesson 160 to plan"]' },
      { target: '#top' },
      { target: '[aria-label="Add lesson 3 to plan"]' },
      { target: '[aria-label="Add lesson 60 to plan"]' },
    ],
  },
];
