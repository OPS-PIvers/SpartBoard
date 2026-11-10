// The benchmark's tours: each step is the element a teacher clicks, recorded with the real clue capturer.

export interface BenchStep {
  /** Playwright selector for the step's target (open shadow roots are pierced). */
  target: string;
  /** Path pattern of the page the step plays on, when it differs from the start page. */
  path?: string;
  /** The iframe holding the target, by its id in the top page. */
  frame?: 'ed' | 'wd';
  /** How the learner plays it: `skip` never clicks it, `rush` clicks it right after the last click without waiting for its spotlight (TOURS_10X.md P7). */
  play?: 'skip' | 'rush';
  /** Off-target controls the learner presses first, while the step is lit; each press is timed. */
  presses?: string[];
  /** The control comes later than the waiting chip's delay, so the chip shows and then reopens (TOURS_10X.md P4). */
  waits?: boolean;
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
  {
    name: 'slow',
    about:
      'a slow site: loaders tick beside each next control for 0.9-2.5s, and a page that takes 1.2s to answer',
    start: '/slow/1',
    steps: [
      { target: '#load', path: '/slow/1' },
      { target: '#open', path: '/slow/1' },
      { target: '#more', path: '/slow/1' },
      { target: '#done', path: '/slow/2' },
    ],
  },
  {
    name: 'late',
    about:
      'controls drawn late, then pushed down by a banner and replaced by a re-render',
    start: '/late.html',
    steps: [
      { target: '[data-tab="grading"]' },
      { target: '#weights' },
      { target: '[data-tab="general"]' },
      { target: '#rename' },
      { target: '[data-tab="sharing"]' },
      { target: '#invite' },
    ],
  },
  {
    name: 'ahead',
    about:
      'a learner clicking one, two and three steps ahead of the tour, then three steps in quick succession',
    start: '/ahead.html',
    steps: [
      { target: '#bold' },
      { target: '#italic', play: 'skip' },
      { target: '#underline' },
      { target: '#left' },
      { target: '#center', play: 'skip' },
      { target: '#right', play: 'skip' },
      { target: '#justify' },
      { target: '#image' },
      { target: '#video', play: 'skip' },
      { target: '#table', play: 'skip' },
      { target: '#link', play: 'skip' },
      { target: '#quiz' },
      { target: '#copy' },
      { target: '#email', play: 'rush' },
      { target: '#classroom', play: 'rush' },
      { target: '#print' },
      { target: '#publish' },
    ],
  },
  {
    name: 'heavyahead',
    about:
      'the gradebook: presses on cells and headers no step watches, and a click two steps ahead',
    start: '/heavy.html',
    steps: [
      { target: '#filter', presses: ['th >> nth=4', 'td >> nth=300'] },
      { target: '#filterMenu >> text=Missing' },
      {
        target: '[aria-label="Comment on Student 230"]',
        presses: ['td >> nth=900', '#clock', 'td >> nth=1500'],
      },
      { target: '#post' },
      { target: '#sort', presses: ['th >> nth=9'] },
      { target: '#sortMenu >> text=Last name', play: 'skip' },
      { target: '#export' },
      { target: '#exportMenu >> text=Download CSV' },
    ],
  },
  {
    name: 'waiting',
    about:
      'a control that arrives 4.5s after the click, past the waiting chip delay, then reopens',
    start: '/wait.html',
    steps: [
      { target: '#start' },
      { target: '#report', waits: true },
      { target: '#close' },
    ],
  },
];
