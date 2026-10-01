// Content for the dev-only Gradebook demo seed (devGradebookDemo.ts).

export const PREFIX = 'gbdemo-';

export interface DemoClass {
  slug: string;
  title: string;
  names: [string, string][];
}

export const CLASSES: DemoClass[] = [
  {
    slug: `${PREFIX}science-p2`,
    title: 'Science 8 Period 2',
    names: [
      ['Sofia', 'Aguilar'],
      ['Liam', 'Bennett'],
      ['Grace', 'Chen'],
      ['Owen', 'Dahl'],
      ['Maya', 'Ellison'],
      ['Yusuf', 'Farah'],
      ['Isabella', 'Gomez'],
      ['Ethan', 'Hansen'],
      ['Amina', 'Ibrahim'],
      ['Noah', 'Johnson'],
      ['Ava', 'Kowalski'],
      ['Elias', 'Lindqvist'],
      ['Kalia', 'Moua'],
      ['Priya', 'Nair'],
    ],
  },
  {
    slug: `${PREFIX}science-p5`,
    title: 'Science 8 Period 5',
    names: [
      ['Mateo', 'Ortiz'],
      ['Harper', 'Quinn'],
      ['Jonah', 'Reyes'],
      ['Zoe', 'Sandoval'],
      ['Caleb', 'Thao'],
      ['Leah', 'Underwood'],
      ['Dmitri', 'Volkov'],
      ['Nora', 'Whitfield'],
      ['Samuel', 'Xiong'],
      ['Chloe', 'Yang'],
      ['Marcus', 'Young'],
      ['Fatima', 'Zahid'],
    ],
  },
];

export const demoEmail = ([first, last]: [string, string]): string =>
  `${first}.${last}@gradebook-demo.invalid`.toLowerCase();

export interface DemoTarget {
  id: string;
  kind: 'personal';
  code: string;
  label: string;
}

export const TARGETS: DemoTarget[] = [
  ['LT1', 'I can measure mass and volume with the right tools and units.'],
  ['LT2', 'I can calculate density and use it to identify a substance.'],
  ['LT3', 'I can describe solids, liquids and gases by particle motion.'],
  ['LT4', 'I can explain phase changes in terms of energy.'],
  ['LT5', 'I can use the periodic table to describe an element.'],
  ['LT6', 'I can tell a chemical change from a physical change.'],
  ['LT7', 'I can explain conservation of mass in a reaction.'],
].map(([code, label]) => ({
  id: `${PREFIX}${code.toLowerCase()}`,
  kind: 'personal',
  code,
  label,
}));

export const tag = (code: string): DemoTarget => {
  const t = TARGETS.find((x) => x.code === code);
  if (!t) throw new Error(`Unknown target ${code}`);
  return { ...t };
};

/** [text, correct answer, wrong answers, target code] */
export type DemoQuestion = [string, string, string[], string];

export interface DemoAssignment {
  key: string;
  kind: 'quiz' | 'video-activity' | 'guided-learning';
  title: string;
  /** Due date in days from today. */
  due: number;
  category: 'achievement' | 'practice';
  counts?: boolean;
  points?: number;
  questions?: DemoQuestion[];
  columnTargets?: string[];
  steps?: number;
  attemptLimit?: number;
  attemptPolicy?: 'latest' | 'highest' | 'average';
  unpublished?: boolean;
  freeResponse?: { text: string; points: number; target: string };
}

export const ASSIGNMENTS: DemoAssignment[] = [
  {
    key: 'a01',
    kind: 'quiz',
    title: 'Lab Safety Check',
    due: -26,
    category: 'practice',
    counts: false,
    points: 1,
    questions: [
      [
        'What should you do first if a chemical splashes in your eye?',
        'Rinse at the eyewash station',
        ['Rub it with a towel', 'Finish the lab', 'Wait for it to stop'],
        'LT1',
      ],
      [
        'When should safety goggles be worn?',
        'Whenever chemicals or heat are in use',
        [
          'Only when heating',
          'Only during cleanup',
          'Only if you wear glasses',
        ],
        'LT1',
      ],
      [
        'How should you smell a substance in lab?',
        'Waft the vapor toward your nose',
        ['Sniff it directly', 'Taste a small amount', 'Pour it on your hand'],
        'LT1',
      ],
      [
        'Where does broken glass go?',
        'The broken glass box',
        ['The trash can', 'The sink', 'Your lab partner'],
        'LT1',
      ],
      [
        'What is the first thing to do if there is a fire?',
        'Tell the teacher right away',
        ['Open a window', 'Throw water on it', 'Keep working'],
        'LT1',
      ],
      [
        'Long hair in lab should be:',
        'Tied back',
        ['Left down', 'Covered with a hat', 'Sprayed with water'],
        'LT1',
      ],
      [
        'Which tool measures liquid volume most precisely?',
        'Graduated cylinder',
        ['Beaker', 'Flask', 'Test tube'],
        'LT1',
      ],
      [
        'Leftover chemicals should be:',
        'Disposed of as the teacher directs',
        ['Poured back in the bottle', 'Taken home', 'Mixed together'],
        'LT1',
      ],
    ],
  },
  {
    key: 'a02',
    kind: 'guided-learning',
    title: 'Metric Measurement Tour',
    due: -23,
    category: 'practice',
    columnTargets: ['LT1'],
    steps: 6,
  },
  {
    key: 'a03',
    kind: 'video-activity',
    title: 'Density in Action',
    due: -21,
    category: 'practice',
    points: 1,
    questions: [
      [
        'Why does the oil float on the water?',
        'Oil is less dense than water',
        ['Oil is heavier', 'Oil is warmer', 'Water pushes it up by magnetism'],
        'LT2',
      ],
      [
        'Density is mass divided by:',
        'Volume',
        ['Weight', 'Area', 'Temperature'],
        'LT2',
      ],
      [
        'A 20 g block has a volume of 10 cm³. Its density is:',
        '2 g/cm³',
        ['200 g/cm³', '0.5 g/cm³', '30 g/cm³'],
        'LT2',
      ],
      [
        'Which tool did the scientist use to find mass?',
        'Balance',
        ['Ruler', 'Thermometer', 'Graduated cylinder'],
        'LT1',
      ],
      [
        'If you cut a gold bar in half, its density:',
        'Stays the same',
        ['Halves', 'Doubles', 'Becomes zero'],
        'LT2',
      ],
    ],
  },
  {
    key: 'a04',
    kind: 'quiz',
    title: 'Density Quiz',
    due: -19,
    category: 'achievement',
    points: 2,
    questions: [
      [
        'A rock has mass 30 g and volume 10 cm³. What is its density?',
        '3 g/cm³',
        ['300 g/cm³', '0.33 g/cm³', '40 g/cm³'],
        'LT2',
      ],
      [
        'Which object will sink in water (1 g/cm³)?',
        'A bolt at 7.8 g/cm³',
        ['Cork at 0.24 g/cm³', 'Ice at 0.92 g/cm³', 'Wax at 0.9 g/cm³'],
        'LT2',
      ],
      [
        'How can you find the volume of an irregular rock?',
        'Water displacement',
        ['Measure its length', 'Weigh it twice', 'Heat it'],
        'LT1',
      ],
      [
        'The unit g/mL is used for:',
        'Density',
        ['Mass', 'Speed', 'Length'],
        'LT2',
      ],
      [
        'A liquid has density 0.8 g/mL. 50 mL has a mass of:',
        '40 g',
        ['62.5 g', '50 g', '0.016 g'],
        'LT2',
      ],
      [
        'Reading a graduated cylinder, you read the:',
        'Bottom of the meniscus',
        ['Top of the meniscus', 'Side of the glass', 'Highest mark'],
        'LT1',
      ],
    ],
  },
  {
    key: 'a05',
    kind: 'guided-learning',
    title: 'States of Matter Explorer',
    due: -16,
    category: 'practice',
    columnTargets: ['LT3'],
    steps: 8,
  },
  {
    key: 'a06',
    kind: 'video-activity',
    title: 'Phase Changes',
    due: -14,
    category: 'practice',
    points: 1,
    questions: [
      [
        'What happens to particles as ice melts?',
        'They move faster and spread out',
        ['They stop moving', 'They get smaller', 'They disappear'],
        'LT4',
      ],
      [
        'Liquid to gas is called:',
        'Evaporation',
        ['Condensation', 'Freezing', 'Deposition'],
        'LT4',
      ],
      [
        'Which state has a fixed shape and volume?',
        'Solid',
        ['Liquid', 'Gas', 'Plasma'],
        'LT3',
      ],
      [
        'Water droplets on a cold can form by:',
        'Condensation',
        ['Melting', 'Evaporation', 'Sublimation'],
        'LT4',
      ],
      [
        'During melting, the temperature of ice water:',
        'Stays the same',
        ['Keeps rising', 'Drops quickly', 'Goes to zero kelvin'],
        'LT4',
      ],
      [
        'Gas particles are:',
        'Far apart and moving quickly',
        ['Packed tightly', 'Not moving', 'Arranged in rows'],
        'LT3',
      ],
    ],
  },
  {
    key: 'a07',
    kind: 'quiz',
    title: 'Atoms and Elements Quiz',
    due: -12,
    category: 'achievement',
    points: 1,
    attemptLimit: 2,
    attemptPolicy: 'highest',
    questions: [
      [
        'The atomic number tells you the number of:',
        'Protons',
        ['Neutrons', 'Electron shells', 'Isotopes'],
        'LT5',
      ],
      [
        'Elements in the same column share:',
        'Similar properties',
        ['The same mass', 'The same color', 'The same number of neutrons'],
        'LT5',
      ],
      ['What is the symbol for sodium?', 'Na', ['So', 'Sd', 'S'], 'LT5'],
      [
        'Where are metals found on the periodic table?',
        'On the left and middle',
        ['Only on the right', 'Only the top row', 'Only the bottom rows'],
        'LT5',
      ],
      [
        'Which particle has a negative charge?',
        'Electron',
        ['Proton', 'Neutron', 'Nucleus'],
        'LT5',
      ],
      [
        'A row on the periodic table is called a:',
        'Period',
        ['Group', 'Family', 'Block'],
        'LT5',
      ],
      [
        'Which element is a noble gas?',
        'Neon',
        ['Oxygen', 'Iron', 'Carbon'],
        'LT5',
      ],
      [
        'The nucleus contains:',
        'Protons and neutrons',
        ['Only electrons', 'Protons and electrons', 'Nothing'],
        'LT5',
      ],
      [
        'Carbon has atomic number 6. How many protons does it have?',
        '6',
        ['12', '3', '14'],
        'LT5',
      ],
      [
        'Which is a nonmetal?',
        'Sulfur',
        ['Copper', 'Aluminum', 'Magnesium'],
        'LT5',
      ],
      [
        'Atomic mass is mostly from:',
        'Protons and neutrons',
        ['Electrons', 'Empty space', 'Energy levels'],
        'LT5',
      ],
      [
        'Metals are usually:',
        'Good conductors',
        ['Brittle', 'Dull', 'Poor conductors'],
        'LT5',
      ],
    ],
  },
  {
    key: 'a08',
    kind: 'guided-learning',
    title: 'Periodic Table Walkthrough',
    due: -9,
    category: 'practice',
    columnTargets: ['LT5'],
    steps: 7,
  },
  {
    key: 'a09',
    kind: 'video-activity',
    title: 'Chemical or Physical?',
    due: -7,
    category: 'practice',
    points: 1,
    questions: [
      [
        'Burning paper is a:',
        'Chemical change',
        ['Physical change', 'Phase change', 'Mixture'],
        'LT6',
      ],
      [
        'Which is a sign of a chemical change?',
        'A gas forms unexpectedly',
        ['Ice melts', 'Paper is cut', 'Sugar dissolves'],
        'LT6',
      ],
      [
        'Crushing a can is a:',
        'Physical change',
        ['Chemical change', 'Nuclear change', 'Reaction'],
        'LT6',
      ],
      [
        'Rust forming on a bike is:',
        'A chemical change',
        ['A physical change', 'Evaporation', 'Melting'],
        'LT6',
      ],
      [
        'Baking a cake is a chemical change because:',
        'New substances form',
        ['It gets warm', 'It changes shape', 'It is mixed'],
        'LT6',
      ],
      [
        'Dissolving salt in water is:',
        'A physical change',
        ['A chemical change', 'Combustion', 'Rusting'],
        'LT6',
      ],
    ],
  },
  {
    key: 'a10',
    kind: 'quiz',
    title: 'Unit 1 Test',
    due: -4,
    category: 'achievement',
    points: 2,
    unpublished: true,
    questions: [
      [
        'Density of 60 g in 20 cm³ is:',
        '3 g/cm³',
        ['1200 g/cm³', '0.33 g/cm³', '80 g/cm³'],
        'LT2',
      ],
      [
        'Which measurement needs a balance?',
        'Mass',
        ['Volume', 'Length', 'Temperature'],
        'LT1',
      ],
      [
        'Particles in a liquid:',
        'Slide past each other',
        ['Are fixed in place', 'Fill any container fully', 'Do not touch'],
        'LT3',
      ],
      [
        'Freezing releases energy because particles:',
        'Slow down and lock in place',
        ['Speed up', 'Split apart', 'Gain mass'],
        'LT4',
      ],
      ['Sublimation is solid to:', 'Gas', ['Liquid', 'Plasma', 'Solid'], 'LT4'],
      [
        'Oxygen is in group 16. Its neighbor to the left is:',
        'Nitrogen',
        ['Fluorine', 'Sulfur', 'Neon'],
        'LT5',
      ],
      [
        'Elements in group 1 are:',
        'Very reactive metals',
        ['Noble gases', 'Halogens', 'Nonmetals'],
        'LT5',
      ],
      [
        'Which is a chemical change?',
        'Milk going sour',
        ['Boiling water', 'Tearing paper', 'Melting butter'],
        'LT6',
      ],
      [
        'Mixing vinegar and baking soda makes bubbles. This shows:',
        'A gas is produced',
        ['A phase change', 'A physical mixture only', 'No reaction'],
        'LT6',
      ],
      [
        'In a closed container, the mass after a reaction is:',
        'The same as before',
        ['Greater', 'Less', 'Zero'],
        'LT7',
      ],
    ],
    freeResponse: {
      text: 'Explain whether toasting bread is a chemical or physical change. Use evidence.',
      points: 5,
      target: 'LT6',
    },
  },
  {
    key: 'a11',
    kind: 'video-activity',
    title: 'Conservation of Mass Lab Video',
    due: -2,
    category: 'practice',
    points: 1,
    questions: [
      [
        'Why was the bag sealed before mixing?',
        'So no gas could escape',
        ['To keep it cold', 'To make it faster', 'To change the color'],
        'LT7',
      ],
      [
        'The mass before and after in the sealed bag was:',
        'The same',
        ['Higher after', 'Lower after', 'Zero'],
        'LT7',
      ],
      [
        'In the open cup the mass went down because:',
        'Gas escaped into the air',
        ['Atoms were destroyed', 'The scale broke', 'Water froze'],
        'LT7',
      ],
      [
        'Atoms in a reaction are:',
        'Rearranged, not created or destroyed',
        ['Destroyed', 'Created', 'Turned into energy'],
        'LT7',
      ],
      [
        'The bubbles showed a:',
        'Chemical change',
        ['Physical change', 'Phase change', 'Mixture'],
        'LT6',
      ],
    ],
  },
  {
    key: 'a12',
    kind: 'quiz',
    title: 'Reaction Rates Exit Ticket',
    due: 2,
    category: 'practice',
    points: 1,
    unpublished: true,
    questions: [
      [
        'Raising temperature usually makes a reaction:',
        'Faster',
        ['Slower', 'Stop', 'Unchanged'],
        'LT7',
      ],
      [
        'Crushing a tablet speeds up fizzing because:',
        'More surface area is exposed',
        ['It gets heavier', 'It cools down', 'It loses mass'],
        'LT7',
      ],
      [
        'A catalyst:',
        'Speeds up a reaction without being used up',
        ['Stops a reaction', 'Is always a gas', 'Adds mass'],
        'LT7',
      ],
      [
        'More concentrated acid reacts:',
        'Faster',
        ['Slower', 'The same', 'Not at all'],
        'LT7',
      ],
      [
        'Which will dissolve fastest?',
        'Powdered sugar in hot water',
        [
          'A sugar cube in cold water',
          'A sugar cube in hot water',
          'Rock candy in cold water',
        ],
        'LT7',
      ],
    ],
  },
];

export const FR_ANSWERS = [
  'Toasting is a chemical change because the bread turns brown and smells different, so a new substance formed.',
  'It is chemical. You cannot un-toast bread and the color change shows a reaction.',
  'Chemical change because heat makes the sugars react and it turns brown.',
  'I think physical because it just gets hot and hard.',
  'Chemical, the bread changes color and gives off a smell which are signs of a new substance.',
];

export type WorkState = 'none' | 'progress' | 'late' | 'done';

export interface DemoMark {
  a: string;
  s: number;
  want: WorkState[];
  override?: number;
  flags?: string[];
  suppressedAuto?: string[];
  publishOverride?: 'published' | 'unpublished';
  comment?: [string, boolean];
}

// `want` picks a student whose work is in that state, starting at index `s`.
export const MARKS: Record<string, DemoMark[]> = {
  [`${PREFIX}science-p2`]: [
    {
      a: 'a04',
      s: 2,
      want: ['progress', 'done'],
      override: 11,
      suppressedAuto: ['missing'],
      comment: ['Took it on paper after the lab make-up.', false],
    },
    {
      a: 'a05',
      s: 3,
      want: ['none', 'done'],
      flags: ['excused', 'absent'],
      suppressedAuto: ['missing'],
      comment: ['Out sick the whole week.', false],
    },
    {
      a: 'a06',
      s: 5,
      want: ['progress', 'done'],
      flags: ['incomplete'],
      comment: ['Finish the last two questions for full credit.', true],
    },
    {
      a: 'a07',
      s: 9,
      want: ['none'],
      flags: ['missing'],
      comment: ['Reminder sent home.', false],
    },
    {
      a: 'a08',
      s: 10,
      want: ['late'],
      suppressedAuto: ['late'],
      comment: ['Extension approved.', false],
    },
    {
      a: 'a10',
      s: 12,
      want: ['done'],
      publishOverride: 'published',
      comment: ['Went over the test together at conferences.', true],
    },
    {
      a: 'a09',
      s: 13,
      want: ['done'],
      comment: ['Great evidence on the rust question!', true],
    },
    {
      a: 'a03',
      s: 1,
      want: ['done'],
      comment: ['Nice work on the density calculations.', true],
    },
    {
      a: 'a10',
      s: 4,
      want: ['done'],
      comment: ['Strong explanation on the written response.', true],
    },
    { a: 'a02', s: 6, want: ['done'], flags: ['absent'] },
    {
      a: 'a01',
      s: 11,
      want: ['done'],
      override: 8,
      comment: ['Safety contract signed; full credit.', false],
    },
    {
      a: 'a11',
      s: 8,
      want: ['none', 'done'],
      flags: ['excused'],
      suppressedAuto: ['missing'],
      comment: ['Joined the class this week.', false],
    },
  ],
  [`${PREFIX}science-p5`]: [
    {
      a: 'a04',
      s: 0,
      want: ['done'],
      comment: ['Check units on question 5.', true],
    },
    {
      a: 'a05',
      s: 4,
      want: ['none', 'done'],
      flags: ['excused'],
      suppressedAuto: ['missing'],
      comment: ['Field trip.', false],
    },
    {
      a: 'a07',
      s: 6,
      want: ['done'],
      override: 11,
      comment: ['Oral retake counted.', false],
    },
    {
      a: 'a09',
      s: 2,
      want: ['progress', 'done'],
      flags: ['incomplete'],
      comment: ['Needs to finish the video.', true],
    },
    {
      a: 'a10',
      s: 9,
      want: ['done'],
      comment: ['Awesome growth since the Density Quiz!', true],
    },
    {
      a: 'a06',
      s: 10,
      want: ['none', 'progress'],
      flags: ['missing', 'absent'],
    },
    {
      a: 'a03',
      s: 7,
      want: ['done'],
      comment: ['Rewatch the float test at 1:30.', true],
    },
  ],
};
