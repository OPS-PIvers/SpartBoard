// AI-shaped versioned reads for tests and the /quiz-import-versions-dev harness, modelled on QUIZ_IMPORT_VERSIONS' reference file.
import type {
  AiExtractedRubric,
  AiExtractedVersion,
  ExtractedTestSet,
} from '@/utils/quizDocumentImport/types';

/** Where the two maps print on every page that has them, as page fractions. */
export const MAP_BOXES = [
  { x: 0.08, y: 0.16, width: 0.4, height: 0.28 },
  { x: 0.52, y: 0.16, width: 0.4, height: 0.28 },
] as const;

/** Pages (1-based) of the version pages that print the maps. */
export const MAP_PAGES = { a: 1, b: 3, split1: 9, split2: 11 } as const;

const INTRO =
  'Religion diffuses through both relocation and expansion diffusion. Use the two maps to answer the parts below.';

const frq = (
  label: string,
  start: number,
  parts: string[],
  maps: boolean,
  intro = INTRO
): AiExtractedVersion => ({
  label,
  pages: { start, end: start + 1 },
  title: label,
  warnings: [],
  questions: [
    {
      number: 1,
      text: [intro, ...parts].join('\n'),
      type: 'free-response',
      options: [],
      correctAnswer: '',
      warnings: [],
      ...(maps
        ? { figures: MAP_BOXES.map((box) => ({ page: start, ...box })) }
        : {}),
    },
  ],
});

const rubric = (
  label: string,
  start: number,
  points: number[],
  warnings: string[] = []
): AiExtractedRubric => ({
  label,
  pages: { start, end: start },
  title: label,
  printedTotal: 10,
  criteria: points.map((p, i) => ({
    letter: String.fromCharCode(65 + i),
    prompt: `Part ${String.fromCharCode(65 + i)}`,
    points: p,
    credit: [],
    notes: [],
  })),
  warnings,
});

export function frqTestSet(): ExtractedTestSet {
  return {
    kind: 'test-set',
    title: 'Unit 3 FRQ',
    versions: [
      frq(
        'Version A',
        1,
        [
          'A. Identify the hearth of the religion shown on Map 1.',
          'B. Define relocation diffusion.',
          'C. Explain how relocation diffusion spread the religion shown on Map 1.',
          'D. Explain how expansion diffusion spread the religion shown on Map 2.',
          'E. Describe one way a sacred site shapes the cultural landscape.',
          'F. Explain one limitation of using Map 2 to show where a religion is practiced today.',
        ],
        true
      ),
      frq(
        'Version B',
        3,
        [
          'A. Identify the religion with the largest area shown on Map 2.',
          'B. Define hierarchical diffusion.',
          'C. Explain how trade routes helped the religion on Map 1 spread.',
          'D. Explain one modern factor that spreads religion today.',
          'E. Describe how Chrsitian missionaries changed one region on Map 2.',
          'F. Explain why a religion can stay strong far from its hearth.',
        ],
        true
      ),
      frq(
        'Unit 3 Version C',
        5,
        [
          'A. Identify one universalizing religion.',
          'B. Describe one ethnic religion and where it is practiced.',
          'C. Explain how language and religion can strengthen each other.',
          'D. Define syncretism.',
          'E. Explain one example of syncretism in a cultural landscape.',
          'F. Explain one reason religious conflict happens at boundaries.',
        ],
        false,
        'Answer every part about religion and culture.'
      ),
      frq(
        'Unit 3 REASSESSMENT',
        7,
        [
          'A. Identify one hearth of a universalizing religion.',
          'B. Describe contagious diffusion.',
          'C. Explain one way colonialism spread a religion.',
          'D. Define secularism.',
          'E. Explain how secularism changes a cultural landscape.',
          'F. Explain one reason a religion declines in a region.',
        ],
        false,
        'Answer every part about the diffusion of religion.'
      ),
      frq(
        'Version Split Pt 1',
        9,
        [
          'A. Identify the hearth of the religion shown on Map 1.',
          'B. Define relocation diffusion.',
          'C. Explain how relocation diffusion spread the religion shown on Map 1.',
        ],
        true
      ),
      frq(
        'Version Split Pt 2',
        11,
        [
          'D. Explain how expansion diffusion spread the religion shown on Map 2.',
          'E. Describe one way a sacred site shapes the cultural landscape.',
          'F. Explain one limitation of using Map 2 to show where a religion is practiced today.',
        ],
        true
      ),
    ],
    rubrics: [
      rubric('Rubric 1', 13, [1, 1, 2, 2, 2, 2]),
      rubric(
        'Rubric 2',
        14,
        [1, 1, 2, 2, 2, 2],
        [
          'Row D credits colonialism, but the prompt asks for a modern factor.',
          'Possible typo: "Chrsitian".',
        ]
      ),
      rubric('Rubric 3', 15, [1, 2, 2, 1, 2, 2]),
      rubric('Rubric 4', 16, [1, 2, 2, 1, 2, 2]),
      rubric('RUBRIC Version Split', 17, [1, 1, 2, 2, 2, 2]),
    ],
    groups: [
      { kind: 'parallel', name: 'Unit 3 FRQ', versions: [0, 1] },
      { kind: 'retake', name: 'Unit 3 FRQ Retake', versions: [2, 3] },
      { kind: 'split', name: 'Unit 3 FRQ Split', versions: [4, 5] },
    ],
    figures: [
      MAP_PAGES.a,
      MAP_PAGES.b,
      MAP_PAGES.split1,
      MAP_PAGES.split2,
    ].flatMap((page) =>
      MAP_BOXES.map((box, i) => ({
        page,
        ...box,
        label: `MAP #${i + 1}`,
        versions: [0, 1, 4, 5],
      }))
    ),
    warnings: [],
  };
}

const MC: [string, string[], string][] = [
  [
    'Which is a universalizing religion?',
    ['Hinduism', 'Buddhism', 'Judaism', 'Shinto'],
    'Buddhism',
  ],
  [
    'Relocation diffusion happens when',
    [
      'people move and carry an idea',
      'an idea spreads from a hub',
      'an idea spreads person to person nearby',
      'an idea is resisted',
    ],
    'people move and carry an idea',
  ],
  [
    'A lingua franca is',
    [
      'a dead language',
      'a language used between speakers of different languages',
      'a dialect',
      'an official language',
    ],
    'a language used between speakers of different languages',
  ],
  [
    'Syncretism is',
    [
      'the blending of two cultures',
      'the loss of a culture',
      'a religious boundary',
      'a folk custom',
    ],
    'the blending of two cultures',
  ],
];

const mcVersion = (label: string, order: number[], shift: number) => ({
  label,
  pages: { start: 1, end: 1 },
  title: label,
  warnings: [],
  questions: order.map((i, n) => {
    const [text, options, answer] = MC[i];
    const turned = options.map((_, k) => options[(k + shift) % options.length]);
    return {
      number: n + 1,
      text,
      type: 'MC' as const,
      options: turned.map((t, k) => ({
        letter: String.fromCharCode(65 + k),
        text: t,
      })),
      correctAnswer: answer,
      warnings: [],
    };
  }),
});

export function mcReorderedTestSet(): ExtractedTestSet {
  return {
    kind: 'test-set',
    title: 'Unit 3 Quiz',
    versions: [
      mcVersion('Version A', [0, 1, 2, 3], 0),
      mcVersion('Version B', [2, 0, 3, 1], 1),
    ],
    rubrics: [],
    groups: [{ kind: 'parallel', name: 'Unit 3 Quiz', versions: [0, 1] }],
    figures: [],
    warnings: [],
  };
}
