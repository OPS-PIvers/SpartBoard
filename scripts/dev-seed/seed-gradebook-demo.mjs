// Seeds a demo Gradebook (two classes, twelve assignments, flags, comments, targets) into one teacher's spartboard-dev account.
// Usage: node scripts/dev-seed/seed-gradebook-demo.mjs [--apply | --remove] [--email you@orono.k12.mn.us] [--student-email test.student@orono.k12.mn.us] [--open-student-grades]
// Dev creds: gcloud auth application-default login. Dev only: refuses any other project.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHmac } from 'crypto';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const argAfter = (flag) =>
  args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const apply = args.includes('--apply');
const remove = args.includes('--remove');
const openStudentGrades = args.includes('--open-student-grades');
const teacherEmail = (
  argAfter('--email') ?? 'paul.ivers@orono.k12.mn.us'
).toLowerCase();
const studentEmail = argAfter('--student-email')?.toLowerCase() ?? null;
const orgId = argAfter('--org') ?? 'orono';
const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = emulator
  ? (argAfter('--project') ?? 'demo-gradebook')
  : 'spartboard-dev';
if (argAfter('--project') && !emulator) {
  console.error('This script only writes to spartboard-dev.');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const PREFIX = 'gbdemo-';
const SETTINGS_ID = `${PREFIX}settings`;
const PERIOD_SET_ID = `${PREFIX}periods`;
const DAY = 86_400_000;
const NOW = Date.now();
const COLLECTION = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
  'guided-learning': 'guided_learning_sessions',
};

// ── Deterministic randomness, so a rerun rewrites the same data ──────────

function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(key) {
  let a = hashSeed(key);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const endOfDay = (offsetDays) => {
  const d = new Date(NOW + offsetDays * DAY);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
};
const ymd = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Classes and students ─────────────────────────────────────────────────

// The import dialog names a test-class student after the email's local part, so the local part is the display name.
const CLASSES = [
  {
    slug: `${PREFIX}science-p2`,
    title: 'Science 8 Period 2',
    names: [
      'Sofia Aguilar',
      'Liam Bennett',
      'Grace Chen',
      'Owen Dahl',
      'Maya Ellison',
      'Yusuf Farah',
      'Isabella Gomez',
      'Ethan Hansen',
      'Amina Ibrahim',
      'Noah Johnson',
      'Ava Kowalski',
      'Elias Lindqvist',
      'Kalia Moua',
      'Priya Nair',
    ],
  },
  {
    slug: `${PREFIX}science-p5`,
    title: 'Science 8 Period 5',
    names: [
      'Mateo Ortiz',
      'Harper Quinn',
      'Jonah Reyes',
      'Zoe Sandoval',
      'Caleb Thao',
      'Leah Underwood',
      'Dmitri Volkov',
      'Nora Whitfield',
      'Samuel Xiong',
      'Chloe Yang',
      'Marcus Young',
      'Fatima Zahid',
    ],
  },
];
const demoEmail = (name) => `${name}@gradebook-demo.invalid`;

// ── Learning targets ─────────────────────────────────────────────────────

const TARGETS = [
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
const T = Object.fromEntries(TARGETS.map((t) => [t.code, t]));
const tag = (code) => ({
  id: T[code].id,
  kind: 'personal',
  code,
  label: T[code].label,
});

// ── Assignments: [text, correct, wrongs, target] ─────────────────────────

const ASSIGNMENTS = [
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

// ── Student behaviour model ──────────────────────────────────────────────

function studentProfile(uid) {
  const r = rng(`profile:${uid}`);
  const ability = 0.52 + r() * 0.44;
  const growth = (r() - 0.35) * 0.02;
  const diligence = r();
  const offsets = Object.fromEntries(
    TARGETS.map((t) => [t.code, (r() - 0.5) * 0.24])
  );
  return { ability, growth, diligence, offsets };
}

function pCorrect(profile, target, index, r) {
  return clamp(
    profile.ability +
      (profile.offsets[target] ?? 0) +
      profile.growth * index +
      (r() - 0.5) * 0.18,
    0.08,
    0.98
  );
}

// ── Firestore helpers ────────────────────────────────────────────────────

class Writer {
  constructor() {
    this.batch = db.batch();
    this.n = 0;
    this.total = 0;
  }
  set(ref, data) {
    this.batch.set(ref, data);
    return this.bump();
  }
  delete(ref) {
    this.batch.delete(ref);
    return this.bump();
  }
  async bump() {
    this.total++;
    if (++this.n >= 400) await this.flush();
  }
  async flush() {
    if (this.n === 0) return;
    await this.batch.commit();
    this.batch = db.batch();
    this.n = 0;
  }
}

function hmacSecret() {
  if (process.env.STUDENT_PSEUDONYM_HMAC_SECRET)
    return process.env.STUDENT_PSEUDONYM_HMAC_SECRET;
  try {
    // Untrimmed: functions hash with the exact secret bytes, trailing whitespace included.
    return execSync(
      'gcloud secrets versions access latest --secret=STUDENT_PSEUDONYM_HMAC_SECRET --project=spartboard-dev',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch {
    console.error(
      'Could not read STUDENT_PSEUDONYM_HMAC_SECRET. Run `gcloud auth login`, or set it in the environment.'
    );
    process.exit(1);
  }
}

// Same formula as computeStudentUid(`test:${email}`) in functions/src/classlinkShared.ts.
const studentUid = (secret, email) =>
  createHmac('sha256', secret)
    .update(`sid:test:${email.toLowerCase()}`)
    .digest('hex');

async function findTeacher() {
  const snap = await db
    .collection('users')
    .where('email', '==', teacherEmail)
    .limit(1)
    .get();
  if (snap.empty) {
    console.error(
      `No users/{uid} doc with email ${teacherEmail} on ${projectId}. Sign in to https://spartboard-dev.web.app once, then rerun.`
    );
    process.exit(1);
  }
  return { uid: snap.docs[0].id, data: snap.docs[0].data() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sessionId = (cls, a) => `${cls.slug}-${a.key}`;

// ── Content builders ─────────────────────────────────────────────────────

function quizKeyQuestions(a) {
  const qs = a.questions.map(([text, correct, wrong, target], i) => ({
    id: `${a.key}-q${i + 1}`,
    type: 'MC',
    text,
    correctAnswer: correct,
    incorrectAnswers: wrong,
    points: a.points,
    targets: [tag(target)],
  }));
  if (a.freeResponse) {
    qs.push({
      id: `${a.key}-fr`,
      type: 'free-response',
      text: a.freeResponse.text,
      correctAnswer: '',
      incorrectAnswers: [],
      points: a.freeResponse.points,
      targets: [tag(a.freeResponse.target)],
    });
  }
  return qs;
}

function publicQuestions(keyQs, r) {
  return keyQs.map(
    ({ id, type, text, points, correctAnswer, incorrectAnswers }) => {
      const choices =
        type === 'MC'
          ? [correctAnswer, ...incorrectAnswers].sort(() => r() - 0.5)
          : [];
      return { id, type, text, points, choices };
    }
  );
}

// A student's answers for one attempt; `bonus` lifts a retake.
function answerQuestions(keyQs, profile, index, r, submittedAt, bonus = 0) {
  return keyQs
    .filter((q) => q.type === 'MC')
    .map((q, i) => {
      const right =
        r() <
        clamp(pCorrect(profile, q.targets[0].code, index, r) + bonus, 0, 0.99);
      return {
        questionId: q.id,
        answer: right
          ? q.correctAnswer
          : q.incorrectAnswers[Math.floor(r() * q.incorrectAnswers.length)],
        answeredAt: submittedAt - (keyQs.length - i) * 45_000,
        isCorrect: right,
      };
    });
}

const FR_ANSWERS = [
  'Toasting is a chemical change because the bread turns brown and smells different, so a new substance formed.',
  'It is chemical. You cannot un-toast bread and the color change shows a reaction.',
  'Chemical change because heat makes the sugars react and it turns brown.',
  'I think physical because it just gets hot and hard.',
  'Chemical, the bread changes color and gives off a smell which are signs of a new substance.',
];

// ── Plan: every doc the seed writes ──────────────────────────────────────

function planClass(cls, classIndex, roster, teacherUid, secret) {
  const students = cls.names.map((name) => {
    const email = demoEmail(name);
    return { name, email, uid: studentUid(secret, email) };
  });
  if (studentEmail && classIndex === 0) {
    students.push({
      name: studentEmail.split('@')[0],
      email: studentEmail,
      uid: studentUid(secret, studentEmail),
      real: true,
    });
  }
  const sessions = [];
  const retakes = [];

  ASSIGNMENTS.forEach((a, index) => {
    const sid = sessionId(cls, a);
    const dueAt = endOfDay(a.due);
    const openAt = dueAt - 6 * DAY;
    const createdAt = openAt - 3_600_000;
    const past = dueAt < NOW;
    const publishedAt =
      a.unpublished || !past ? null : Math.min(NOW - 3_600_000, dueAt + DAY);
    const r = rng(`session:${sid}`);
    const base = {
      teacherUid,
      rosterIds: [roster.id],
      classIds: [cls.slug],
      classId: cls.slug,
      periodNames: [roster.name],
      createdAt,
      openAt,
      dueAt,
      closeAt: null,
      mode: 'assignment',
      gbDemo: true,
      ...(publishedAt ? { scorePublishedAt: publishedAt } : {}),
    };
    const s = { a, sid, dueAt, index, docs: [], columnTargets: [], state: {} };

    let keyQs = [];
    if (a.kind === 'quiz') {
      keyQs = quizKeyQuestions(a);
      s.session = {
        ...base,
        id: sid,
        assignmentId: sid,
        quizId: `${PREFIX}${a.key}`,
        quizTitle: a.title,
        status: past ? 'ended' : 'active',
        sessionMode: 'student',
        widgetKind: 'quiz',
        currentQuestionIndex: 0,
        startedAt: openAt,
        endedAt: past ? dueAt : null,
        code: String(100000 + Math.floor(r() * 899999)),
        totalQuestions: keyQs.length,
        publicQuestions: publicQuestions(keyQs, r),
        attemptLimit: a.attemptLimit ?? 1,
      };
      s.keyRef = db.doc(
        `users/${teacherUid}/quiz_assignments/${sid}/key/answers`
      );
      s.key = { questions: keyQs, updatedAt: createdAt };
    } else if (a.kind === 'video-activity') {
      keyQs = a.questions.map(([text, correct, wrong, target], i) => ({
        id: `${a.key}-q${i + 1}`,
        type: 'MC',
        text,
        correctAnswer: correct,
        incorrectAnswers: wrong,
        points: a.points,
        timestamp: 30 + i * 45,
        targets: [tag(target)],
      }));
      s.session = {
        ...base,
        id: sid,
        activityId: `${PREFIX}${a.key}`,
        activityTitle: a.title,
        assignmentName: a.title,
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        questions: [],
        publicQuestions: publicQuestions(keyQs, r).map((q, i) => ({
          ...q,
          timestamp: keyQs[i].timestamp,
        })),
        status: past ? 'ended' : 'active',
        allowedPins: [],
      };
      s.keyRef = db.doc(`video_activity_sessions/${sid}/key/answers`);
      s.key = { questions: keyQs, updatedAt: createdAt };
    } else {
      const steps = [];
      for (let i = 0; i < a.steps; i++) {
        steps.push({
          id: `${a.key}-s${i + 1}`,
          xPct: 20 + ((i * 13) % 60),
          yPct: 25 + ((i * 17) % 50),
          imageIndex: 0,
          interactionType: 'question',
          question: {
            type: 'multiple-choice',
            text: `Checkpoint ${i + 1}`,
            choices: ['A', 'B', 'C', 'D'],
          },
        });
      }
      s.session = {
        ...base,
        id: sid,
        title: a.title,
        mode: 'guided',
        imageUrls: [],
        publicSteps: steps,
      };
      s.stepIds = steps.map((st) => st.id);
      s.columnTargets = (a.columnTargets ?? []).map(tag);
    }
    s.ref = db.collection(COLLECTION[a.kind]).doc(sid);

    students.forEach((st, si) => {
      const profile = studentProfile(st.uid);
      const sr = rng(`work:${sid}:${st.uid}`);
      const roll = sr();
      s.state[st.uid] = 'none';
      const missingChance = 0.03 + (1 - profile.diligence) * 0.1;
      if (past && roll < missingChance) return;
      if (!past && roll < 0.4) return;
      const inProgress = past && roll < missingChance + 0.025;
      const late = past && !inProgress && sr() < (1 - profile.diligence) * 0.22;
      const submittedAt = late
        ? dueAt + Math.floor((1 + sr() * 2) * DAY)
        : Math.min(
            NOW - 600_000,
            dueAt - Math.floor(sr() * 4 * DAY) - 3_600_000
          );
      const ref = s.ref.collection('responses').doc(st.uid);
      s.state[st.uid] = inProgress ? 'progress' : late ? 'late' : 'done';

      if (a.kind === 'guided-learning') {
        const answered = inProgress
          ? s.stepIds.slice(0, Math.ceil(s.stepIds.length / 2))
          : s.stepIds;
        const answers = answered.map((stepId) => ({
          stepId,
          answer: 'A',
          isCorrect: sr() < pCorrect(profile, a.columnTargets[0], index, sr),
          answeredAt: submittedAt,
        }));
        s.docs.push({
          ref,
          data: {
            studentUid: st.uid,
            classId: cls.slug,
            startedAt: submittedAt - 20 * 60_000,
            answers,
            completedAt: inProgress ? null : submittedAt,
          },
        });
        return;
      }

      let answers = answerQuestions(keyQs, profile, index, sr, submittedAt);
      if (inProgress) answers = answers.slice(0, Math.ceil(answers.length / 2));

      if (a.kind === 'video-activity') {
        s.docs.push({
          ref,
          data: {
            studentUid: st.uid,
            name: st.name,
            classId: cls.slug,
            joinedAt: submittedAt - 25 * 60_000,
            answers,
            completedAt: inProgress ? null : submittedAt,
          },
        });
        return;
      }

      const data = {
        studentUid: st.uid,
        classId: cls.slug,
        joinedAt: submittedAt - 30 * 60_000,
        status: inProgress ? 'in-progress' : 'completed',
        answers: answers.map(({ isCorrect: _c, ...rest }) => rest),
        submittedAt: inProgress ? null : submittedAt,
        completedAttempts: inProgress ? 0 : 1,
      };
      if (a.freeResponse && !inProgress) {
        const text = FR_ANSWERS[Math.floor(sr() * FR_ANSWERS.length)];
        data.answers.push({
          questionId: `${a.key}-fr`,
          answer: text,
          answeredAt: submittedAt - 30_000,
        });
        // Three students per class wait on grading, so the column shows ungraded work.
        if (si % 5 !== 2) {
          const pts = clamp(
            Math.round(profile.ability * 5 + (sr() - 0.5) * 2),
            1,
            5
          );
          data.grading = {
            [`${a.key}-fr`]: {
              pointsAwarded: pts,
              gradedAt: Math.min(NOW - 1_800_000, submittedAt + DAY),
              gradedBy: teacherUid,
            },
          };
        }
      }
      s.docs.push({ ref, data });

      // Retake: the weaker attempts on the Atoms quiz try again and do better.
      if (a.attemptLimit > 1 && !inProgress) {
        const pct =
          answers.filter((x) => x.isCorrect).length /
          Math.max(1, answers.length);
        if (pct < 0.7 && sr() < 0.8) {
          const retakeAt = Math.min(NOW - 600_000, submittedAt + 2 * DAY);
          const retake = answerQuestions(
            keyQs,
            profile,
            index,
            sr,
            retakeAt,
            0.2
          );
          retakes.push({
            sid,
            uid: st.uid,
            ref,
            data: {
              ...data,
              answers: retake.map(({ isCorrect: _c, ...rest }) => ({
                ...rest,
                takeIndex: 1,
              })),
              submittedAt: retakeAt,
              completedAttempts: 2,
            },
          });
        }
      }
    });
    sessions.push(s);
  });
  return { cls, roster, students, sessions, retakes };
}

// Hand-placed flags, overrides and comments; `want` picks a student whose work is in that state, starting at `s`.
const MARKS = {
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

// First student from `m.s` onward whose work matches the earliest possible `want`.
function pickStudent(p, s, m, taken) {
  const n = p.students.length;
  for (const want of m.want) {
    for (let k = 0; k < n; k++) {
      const st = p.students[(m.s + k) % n];
      if (st.real || taken.has(`${s.sid}__${st.uid}`)) continue;
      if (s.state[st.uid] === want) return st;
    }
  }
  return null;
}

// ── Seed ─────────────────────────────────────────────────────────────────

async function ensureFlagRow(featureId, accessLevel) {
  const ref = db.doc(`global_permissions/${featureId}`);
  const snap = await ref.get();
  const cur = snap.data();
  if (cur && cur.accessLevel === accessLevel && cur.enabled === true) return;
  if (cur && accessLevel !== 'public') {
    console.log(
      `  global_permissions/${featureId} already saved (${cur.accessLevel}); left as is.`
    );
    return;
  }
  await ref.set({
    featureId,
    accessLevel,
    betaUsers: cur?.betaUsers ?? [],
    enabled: true,
    buildings: [],
  });
  console.log(`  Saved flag row ${featureId} (${accessLevel}).`);
}

async function seed() {
  const secret = hmacSecret();
  const teacher = await findTeacher();
  const uid = teacher.uid;
  console.log(`Teacher ${teacherEmail} is ${uid} on ${projectId}.`);

  const w = new Writer();
  for (const cls of CLASSES) {
    const memberEmails = cls.names.map(demoEmail);
    if (studentEmail && cls === CLASSES[0]) memberEmails.push(studentEmail);
    await w.set(db.doc(`organizations/${orgId}/testClasses/${cls.slug}`), {
      title: cls.title,
      subject: 'Science',
      memberEmails,
      createdAt: NOW,
      createdBy: teacherEmail,
    });
  }
  await w.flush();

  console.log('Flags:');
  await ensureFlagRow('gradebook', 'admin');
  await ensureFlagRow(
    'student-gradebook',
    openStudentGrades ? 'public' : 'admin'
  );

  const rosterSnap = await db.collection(`users/${uid}/rosters`).get();
  const rosters = CLASSES.map((cls) =>
    rosterSnap.docs.find((d) => d.data().testClassId === cls.slug)
  );
  if (rosters.some((r) => !r)) {
    console.log(`
The demo classes are ready to import. On https://spartboard-dev.web.app open My Classes,
choose Import from ClassLink, and import both of these (each shows with a Test label):
${CLASSES.map((c) => `  - ${c.title}`).join('\n')}
Then run this script again with --apply.`);
    return;
  }

  const switchRef = db.doc('admin_settings/gradebook_index');
  const wasOn = (await switchRef.get()).data()?.enabled === true;
  if (!wasOn) {
    await switchRef.set({ enabled: true }, { merge: true });
    console.log(
      'Turned on admin_settings/gradebook_index; waiting 65s for the functions to see it.'
    );
    await sleep(65_000);
  }

  // Personal learning targets, merged into the teacher's own list.
  const ltRef = db.doc(`users/${uid}/userProfile/learningTargets`);
  const ltSnap = await ltRef.get();
  const kept = (ltSnap.data()?.targets ?? []).filter(
    (t) => !String(t.id).startsWith(PREFIX)
  );
  await ltRef.set(
    {
      targets: [
        ...kept,
        ...TARGETS.map((t) => ({
          id: t.id,
          code: t.code,
          label: t.label,
          subject: 'science',
          grades: ['8'],
          createdAt: NOW,
          updatedAt: NOW,
        })),
      ],
      updatedAt: NOW,
    },
    { merge: true }
  );

  await w.set(db.doc(`users/${uid}/gradebook_settings/${SETTINGS_ID}`), {
    name: 'Science 8',
    flags: [
      {
        id: 'missing',
        name: 'Missing',
        key: 'M',
        color: 'rose',
        value: 0,
        visibility: 'students',
        builtIn: true,
      },
      {
        id: 'excused',
        name: 'Excused',
        key: 'X',
        color: 'slate',
        value: 'excluded',
        visibility: 'students',
        builtIn: true,
      },
      {
        id: 'late',
        name: 'Late',
        key: 'L',
        color: 'amber',
        value: null,
        visibility: 'teacher',
        builtIn: true,
      },
      {
        id: 'incomplete',
        name: 'Incomplete',
        key: 'I',
        color: 'orange',
        value: null,
        visibility: 'students',
        builtIn: false,
      },
      {
        id: 'absent',
        name: 'Absent',
        key: 'A',
        color: 'sky',
        value: null,
        visibility: 'teacher',
        builtIn: false,
      },
    ],
    categoriesEnabled: true,
    categories: [
      { id: 'achievement', name: 'Assessments', weight: 70 },
      { id: 'practice', name: 'Practice', weight: 30 },
    ],
    scale: { source: 'district' },
    method: 'decaying',
    studentVisibility: {
      scores: true,
      flags: true,
      comments: true,
      standards: true,
    },
    autoFlags: true,
    ownerUid: uid,
    editorUids: [],
    isDefault: false,
    updatedAt: NOW,
  });

  const plans = CLASSES.map((cls, i) =>
    planClass(
      cls,
      i,
      { id: rosters[i].id, name: rosters[i].data().name ?? cls.title },
      uid,
      secret
    )
  );

  for (const p of plans) {
    await w.set(db.doc(`users/${uid}/gradebook_classes/${p.roster.id}`), {
      rosterId: p.roster.id,
      ownerUid: uid,
      editorUids: [],
      configRef: { source: 'personal', configId: SETTINGS_ID },
      sort: null,
      nameFormat: 'first-last',
      cellFormat: 'percent',
      cardLayouts: {},
      updatedAt: NOW,
    });
    for (const s of p.sessions) {
      await w.set(s.ref, s.session);
      if (s.keyRef) await w.set(s.keyRef, s.key);
      await w.set(db.doc(`gradebook_columns/${s.sid}`), {
        kind: s.a.kind,
        sessionId: s.sid,
        ownerUid: uid,
        editorUids: [],
        category: s.a.category,
        countsTowardOverall: s.a.counts !== false,
        maxPointsOverride: null,
        attemptPolicy: s.a.attemptPolicy ?? 'latest',
        targets: s.columnTargets,
        hiddenInRosterIds: [],
        updatedAt: NOW,
      });
    }
  }
  await w.flush();
  // Sessions first so each response trigger finds its session.
  for (const p of plans)
    for (const s of p.sessions)
      for (const d of s.docs) await w.set(d.ref, d.data);
  await w.flush();

  let hist = 0;
  let marks = 0;
  for (const p of plans) {
    const taken = new Set();
    for (const m of MARKS[p.cls.slug] ?? []) {
      const s = p.sessions.find((x) => x.a.key === m.a);
      const st = s ? pickStudent(p, s, m, taken) : null;
      if (!st) continue;
      const markId = `${s.sid}__${st.uid}`;
      taken.add(markId);
      marks++;
      const at = Math.min(NOW - 3_600_000, s.dueAt + DAY + m.s * 600_000);
      const mark = {
        kind: s.a.kind,
        sessionId: s.sid,
        studentUid: st.uid,
        ownerUid: uid,
        editorUids: [],
        rosterIds: [p.roster.id],
        override: m.override !== undefined ? { points: m.override, at } : null,
        comment: m.comment
          ? { text: m.comment[0], shared: m.comment[1], at }
          : null,
        flags: m.flags ?? [],
        suppressedAuto: m.suppressedAuto ?? [],
        publishOverride: m.publishOverride ?? null,
        updatedAt: at,
      };
      const markRef = db.doc(`gradebook_marks/${markId}`);
      await w.set(markRef, mark);
      const entry = (field, after) =>
        w
          .set(markRef.collection('history').doc(`${PREFIX}${field}`), {
            ownerUid: uid,
            byUid: uid,
            at,
            field,
            before: field === 'flags' ? [] : null,
            after,
            batchId: null,
          })
          .then(() => hist++);
      if (mark.override) await entry('override', mark.override);
      if (mark.comment) await entry('comment', mark.comment);
      if (mark.flags.length || mark.suppressedAuto.length)
        await entry('flags', mark.flags);
      if (mark.publishOverride) await entry('publish', mark.publishOverride);
    }
  }
  await w.flush();

  const periodsSnap = await db
    .collection('grading_period_sets')
    .where('orgId', '==', orgId)
    .get();
  const buildings = Array.isArray(teacher.data.buildings)
    ? teacher.data.buildings
    : [];
  if (periodsSnap.empty && buildings.length > 0) {
    const q1Start = endOfDay(-35);
    const q1End = endOfDay(40);
    await db.doc(`grading_period_sets/${PERIOD_SET_ID}`).set({
      name: 'Demo quarters',
      orgId,
      buildingIds: buildings,
      periods: [
        { id: 'q1', label: 'Quarter 1', start: ymd(q1Start), end: ymd(q1End) },
        {
          id: 'q2',
          label: 'Quarter 2',
          start: ymd(q1End + DAY),
          end: ymd(q1End + 80 * DAY),
        },
      ],
      updatedAt: NOW,
    });
    console.log('Added demo grading periods (Quarter 1, Quarter 2).');
  }

  // Retakes land after the first attempt is on the row, so the row keeps both attempts.
  const retakes = plans.flatMap((p) => p.retakes);
  if (retakes.length > 0) {
    process.stdout.write(
      `Waiting for first attempts before ${retakes.length} retakes`
    );
    const deadline = Date.now() + 150_000;
    let pending = retakes;
    while (pending.length > 0 && Date.now() < deadline) {
      await sleep(5_000);
      process.stdout.write('.');
      const snaps = await db.getAll(
        ...pending.map((x) => db.doc(`grade_index/${x.sid}__${x.uid}`))
      );
      pending = pending.filter(
        (_, i) => !(snaps[i].data()?.attempts?.length >= 1)
      );
    }
    console.log(
      pending.length
        ? ` ${pending.length} not indexed yet; their rows will show only the retake.`
        : ' done.'
    );
    for (const x of retakes) await w.set(x.ref, x.data);
    await w.flush();
  }

  // Safety net: the scheduled recompute rebuilds every demo session.
  for (const p of plans)
    for (const s of p.sessions)
      await w.set(db.doc(`grade_index_sessions/${s.sid}`), {
        kind: s.a.kind,
        sessionId: s.sid,
        dirtyAt: NOW - 30 * DAY + s.index,
      });
  await w.flush();

  const expected = plans.reduce(
    (n, p) => n + p.sessions.reduce((m, s) => m + s.docs.length, 0),
    0
  );
  const sids = plans.flatMap((p) => p.sessions.map((s) => s.sid));
  let built = 0;
  for (let i = 0; i < sids.length; i += 30) {
    const snap = await db
      .collection('grade_index')
      .where('sessionId', 'in', sids.slice(i, i + 30))
      .get();
    built += snap.size;
  }
  console.log(`
Seeded ${plans.length} classes, ${sids.length} assignments, ${expected} student submissions,
${marks} marks (${hist} history entries), ${w.total} writes in all.
Grade rows built so far: ${built}/${expected}. The rest arrive within 5 minutes (gradeIndexRecompute).
Open https://spartboard-dev.web.app/gradebook`);
}

// ── Remove ───────────────────────────────────────────────────────────────

async function removeAll() {
  const secret = hmacSecret();
  const teacher = await findTeacher();
  const uid = teacher.uid;
  const w = new Writer();

  const studentUids = new Set();
  for (const cls of CLASSES) {
    const ref = db.doc(`organizations/${orgId}/testClasses/${cls.slug}`);
    const emails =
      (await ref.get()).data()?.memberEmails ?? cls.names.map(demoEmail);
    for (const e of emails) studentUids.add(studentUid(secret, e));
    await w.delete(ref);
  }

  const sids = [];
  for (const [kind, coll] of Object.entries(COLLECTION)) {
    const snap = await db.collection(coll).where('gbDemo', '==', true).get();
    for (const d of snap.docs) {
      if (d.data().teacherUid !== uid || !d.id.startsWith(PREFIX)) continue;
      sids.push(d.id);
      await db.recursiveDelete(d.ref);
      if (kind === 'quiz')
        await db.recursiveDelete(
          db.doc(`users/${uid}/quiz_assignments/${d.id}`)
        );
    }
  }
  const sweepRows = async () => {
    for (let i = 0; i < sids.length; i += 30) {
      const snap = await db
        .collection('grade_index')
        .where('sessionId', 'in', sids.slice(i, i + 30))
        .get();
      for (const d of snap.docs) await w.delete(d.ref);
    }
    for (const suid of studentUids)
      for (const cls of CLASSES)
        await w.delete(db.doc(`student_grades/${suid}/classes/${cls.slug}`));
    await w.flush();
  };
  await sweepRows();

  const marks = await db
    .collection('gradebook_marks')
    .where('ownerUid', '==', uid)
    .get();
  for (const d of marks.docs)
    if (d.id.startsWith(PREFIX)) await db.recursiveDelete(d.ref);
  for (const sid of sids) {
    await w.delete(db.doc(`gradebook_columns/${sid}`));
    await w.delete(db.doc(`grade_index_sessions/${sid}`));
  }

  const rosterSnap = await db.collection(`users/${uid}/rosters`).get();
  for (const d of rosterSnap.docs)
    if (CLASSES.some((c) => c.slug === d.data().testClassId))
      await w.delete(db.doc(`users/${uid}/gradebook_classes/${d.id}`));
  await w.delete(db.doc(`users/${uid}/gradebook_settings/${SETTINGS_ID}`));
  await w.delete(db.doc(`grading_period_sets/${PERIOD_SET_ID}`));
  await w.flush();

  const ltRef = db.doc(`users/${uid}/userProfile/learningTargets`);
  const lt = (await ltRef.get()).data();
  if (lt?.targets)
    await ltRef.set(
      {
        targets: lt.targets.filter((t) => !String(t.id).startsWith(PREFIX)),
        updatedAt: NOW,
      },
      { merge: true }
    );

  // Delete triggers can rewrite a row or projection moments later; sweep once more.
  console.log('Waiting 20s for triggers, then sweeping again.');
  await sleep(20_000);
  await sweepRows();
  console.log(`Removed ${sids.length} demo sessions and their gradebook data.
Left in place: the flag rows, the Gradebook score index switch, and the two imported
classes in My Classes (delete those there, since their student lists live in your Drive).`);
}

if (remove) await removeAll();
else if (apply) await seed();
else {
  console.log(`Dry run for ${teacherEmail} on ${projectId}. Nothing written.
Would write: ${CLASSES.length} test classes (${CLASSES.map((c) => c.names.length).join(' + ')} students${studentEmail ? ` + ${studentEmail}` : ''}),
${ASSIGNMENTS.length} assignments per class (${['quiz', 'video-activity', 'guided-learning'].map((k) => `${ASSIGNMENTS.filter((a) => a.kind === k).length} ${k}`).join(', ')}),
${TARGETS.length} learning targets, ${Object.values(MARKS).flat().length} marks, the gradebook flag rows and the score index switch.
Pass --apply to seed or --remove to delete it all.`);
}
