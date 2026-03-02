import { GradeLevel, RoutineStructure, RoutineAudience } from '../types';

export type { RoutineStructure, RoutineAudience };

export interface InstructionalStep {
  text: string;
  icon?: string;
  stickerUrl?: string;
  imageUrl?: string;
  color?: string;
  label?: string;
  attachedWidget?: {
    type: string;
    label: string;
    config?: Record<string, unknown>;
  };
}

export interface InstructionalRoutine {
  id: string;
  name: string;
  grades: string;
  gradeLevels: GradeLevel[];
  icon: string;
  color: string;
  steps: InstructionalStep[];
  structure?: RoutineStructure;
  audience?: RoutineAudience;
  layout?: 'list' | 'grid' | 'hero';
}

export const ROUTINES: InstructionalRoutine[] = [
  {
    id: 'chalk-talk',
    name: 'Chalk Talk',
    grades: '3-5',
    gradeLevels: ['3-5'],
    icon: 'MessagesSquare',
    color: 'blue',
    steps: [
      {
        text: 'Read the question on the board.',
        icon: 'Eye',
        color: 'blue',
        label: 'Read',
      },
      {
        text: 'Write your answer quietly.',
        icon: 'Pencil',
        color: 'slate',
        label: 'Write',
      },
      {
        text: 'Read and answer what your friends wrote.',
        icon: 'MessageSquare',
        color: 'indigo',
        label: 'Respond',
      },
    ],
  },
  {
    id: 'choral-reading',
    name: 'Choral Reading',
    grades: 'K-5',
    gradeLevels: ['k-2', '3-5'],
    icon: 'Users',
    color: 'indigo',
    steps: [
      {
        text: 'Read the text together in one voice.',
        icon: 'Volume2',
        color: 'blue',
        label: 'Read',
      },
      {
        text: 'Listen to stay at the same speed.',
        icon: 'Ear',
        color: 'indigo',
        label: 'Listen',
      },
    ],
  },
  {
    id: 'echo-reading',
    name: 'Echo Reading',
    grades: 'K-5',
    gradeLevels: ['k-2', '3-5'],
    icon: 'Volume2',
    color: 'violet',
    steps: [
      {
        text: 'Listen to the teacher read.',
        icon: 'Ear',
        color: 'blue',
        label: 'Listen',
      },
      {
        text: 'Read the same part back exactly the same way.',
        icon: 'Volume2',
        color: 'indigo',
        label: 'Repeat',
      },
    ],
  },
  {
    id: 'fishbowl',
    name: 'Fishbowl',
    grades: '3-5',
    gradeLevels: ['3-5'],
    icon: 'Eye',
    color: 'cyan',
    steps: [
      {
        text: 'Inside group: Practice the skill.',
        icon: 'Users',
        color: 'blue',
        label: 'Practice',
      },
      {
        text: 'Outside group: Watch and learn.',
        icon: 'Eye',
        color: 'amber',
        label: 'Watch',
      },
      {
        text: 'Class: Talk about what we saw.',
        icon: 'MessageSquare',
        color: 'indigo',
        label: 'Discuss',
      },
    ],
  },
  {
    id: 'gallery-walk',
    name: 'Gallery Walk',
    grades: 'K-5',
    gradeLevels: ['k-2', '3-5'],
    icon: 'Image',
    color: 'emerald',
    steps: [
      {
        text: 'Walk quietly around the room.',
        icon: 'Footprints',
        color: 'slate',
        label: 'Walk',
      },
      {
        text: 'Look closely at the work on the walls.',
        icon: 'Eye',
        color: 'blue',
        label: 'Observe',
      },
      {
        text: 'Think about what you learned.',
        icon: 'Lightbulb',
        color: 'amber',
        label: 'Reflect',
      },
    ],
  },
  {
    id: 'give-one-get-one',
    name: 'Give One-Get One-Move One',
    grades: '3-5',
    gradeLevels: ['3-5'],
    icon: 'ArrowRightLeft',
    color: 'orange',
    steps: [
      {
        text: 'Write your idea on a card.',
        icon: 'Pencil',
        color: 'blue',
        label: 'Write',
      },
      {
        text: 'Trade ideas with a partner.',
        icon: 'RefreshCw',
        color: 'indigo',
        label: 'Exchange',
      },
      {
        text: 'Find a new partner and share the new idea.',
        icon: 'Users',
        color: 'green',
        label: 'Share',
      },
    ],
  },
  {
    id: 'jigsaw',
    name: 'Jigsaw',
    grades: '2-5',
    gradeLevels: ['k-2', '3-5'],
    icon: 'Puzzle',
    color: 'pink',
    steps: [
      {
        text: 'Learn your part with your expert group.',
        icon: 'Search',
        color: 'blue',
        label: 'Learn',
      },
      {
        text: 'Teach your part to your home group.',
        icon: 'Users',
        color: 'indigo',
        label: 'Teach',
      },
      {
        text: 'Listen to learn all the other parts.',
        icon: 'Ear',
        color: 'amber',
        label: 'Listen',
      },
    ],
  },
  {
    id: 'jot-pair-share',
    name: 'Jot-Pair-Share',
    grades: 'K-5',
    gradeLevels: ['k-2', '3-5'],
    icon: 'PencilLine',
    color: 'teal',
    steps: [
      {
        text: 'Quickly write your answer.',
        icon: 'Pencil',
        color: 'blue',
        label: 'Jot',
      },
      {
        text: 'Share your writing with a partner.',
        icon: 'Users',
        color: 'indigo',
        label: 'Pair',
      },
      {
        text: 'Share your ideas with the class.',
        icon: 'Share2',
        color: 'green',
        label: 'Share',
      },
    ],
  },
  {
    id: 'mix-and-mingle',
    name: 'Mix and Mingle',
    grades: 'K-5',
    gradeLevels: ['k-2', '3-5'],
    icon: 'Users2',
    color: 'rose',
    steps: [
      {
        text: 'Think about the question.',
        icon: 'Lightbulb',
        color: 'amber',
        label: 'Think',
      },
      {
        text: 'Find a partner and share your answer.',
        icon: 'Users',
        color: 'blue',
        label: 'Share',
      },
      {
        text: 'When told, move to find a new partner.',
        icon: 'Footprints',
        color: 'slate',
        label: 'Move',
      },
    ],
  },
  {
    id: 'question-corners',
    name: 'Question Corners',
    grades: 'K-2',
    gradeLevels: ['k-2'],
    icon: 'Signpost',
    color: 'lime',
    steps: [
      {
        text: 'Pick the corner you want to answer.',
        icon: 'Signpost',
        color: 'blue',
        label: 'Choose',
      },
      {
        text: 'Walk to that corner.',
        icon: 'Footprints',
        color: 'slate',
        label: 'Walk',
      },
      {
        text: 'Talk with the friends in your corner.',
        icon: 'Users',
        color: 'indigo',
        label: 'Discuss',
      },
    ],
  },
  {
    id: 'readers-theater',
    name: "Readers' Theater",
    grades: '2-5',
    gradeLevels: ['k-2', '3-5'],
    icon: 'Smile',
    color: 'fuchsia',
    steps: [
      {
        text: 'Get your group and your parts.',
        icon: 'Users',
        color: 'blue',
        label: 'Group',
      },
      {
        text: 'Practice reading your lines.',
        icon: 'BookOpen',
        color: 'indigo',
        label: 'Practice',
      },
      {
        text: 'Perform the story for the class!',
        icon: 'Star',
        color: 'amber',
        label: 'Perform',
      },
    ],
  },
  {
    id: 'repeated-reading',
    name: 'Repeated Reading',
    grades: '2-5',
    gradeLevels: ['k-2', '3-5'],
    icon: 'Repeat2',
    color: 'sky',
    steps: [
      {
        text: 'Read with the teacher.',
        icon: 'Users',
        color: 'blue',
        label: 'Read',
      },
      {
        text: 'Read with a partner.',
        icon: 'Users',
        color: 'indigo',
        label: 'Pair',
      },
      {
        text: 'Read it quietly by yourself.',
        icon: 'User',
        color: 'slate',
        label: 'Solo',
      },
    ],
  },
  {
    id: 'tableau',
    name: 'Tableau',
    grades: 'K-5',
    gradeLevels: ['k-2', '3-5'],
    icon: 'Pause',
    color: 'amber',
    steps: [
      {
        text: 'Work with your group.',
        icon: 'Users',
        color: 'blue',
        label: 'Group',
      },
      {
        text: 'Make a statue scene from the story.',
        icon: 'Pause',
        color: 'amber',
        label: 'Freeze',
      },
      {
        text: 'Stay very still and quiet.',
        icon: 'VolumeX',
        color: 'slate',
        label: 'Silence',
      },
    ],
  },
  {
    id: 'take-a-stand',
    name: 'Take a Stand',
    grades: '3-5',
    gradeLevels: ['3-5'],
    icon: 'Vote',
    color: 'red',
    steps: [
      {
        text: 'Listen to the question.',
        icon: 'Ear',
        color: 'blue',
        label: 'Listen',
      },
      {
        text: 'Move to the area that matches your choice.',
        icon: 'Footprints',
        color: 'slate',
        label: 'Move',
      },
      {
        text: 'Explain why you chose that spot.',
        icon: 'MessageSquare',
        color: 'indigo',
        label: 'Explain',
      },
    ],
  },
  {
    id: 'think-pair-share',
    name: 'Think-Pair-Share',
    grades: 'K-12',
    gradeLevels: ['k-2', '3-5', '6-8', '9-12'],
    icon: 'Brain',
    color: 'yellow',
    steps: [
      {
        text: 'Think silently about the question.',
        icon: 'Lightbulb',
        color: 'amber',
        label: 'Think',
      },
      {
        text: 'Share your thoughts with a partner.',
        icon: 'Users',
        color: 'blue',
        label: 'Pair',
      },
      {
        text: 'Join the class discussion.',
        icon: 'Share2',
        color: 'green',
        label: 'Share',
      },
    ],
  },
  {
    id: 'vocabulary-exploration',
    name: 'Vocabulary Exploration',
    grades: 'K-5',
    gradeLevels: ['k-2', '3-5'],
    icon: 'BookOpenCheck',
    color: 'green',
    steps: [
      {
        text: 'Listen to the word.',
        icon: 'Ear',
        color: 'blue',
        label: 'Listen',
      },
      {
        text: 'Say the word and clap the beats.',
        icon: 'Volume2',
        color: 'indigo',
        label: 'Say',
      },
      {
        text: 'Learn what the word means.',
        icon: 'Search',
        color: 'amber',
        label: 'Learn',
      },
    ],
  },
  {
    id: 'whip-around',
    name: 'Whip Around',
    grades: '3-5',
    gradeLevels: ['3-5'],
    icon: 'Zap',
    color: 'purple',
    steps: [
      {
        text: 'Listen to the prompt.',
        icon: 'Ear',
        color: 'blue',
        label: 'Listen',
      },
      {
        text: 'Quickly share your answer one by one.',
        icon: 'Zap',
        color: 'amber',
        label: 'Share',
      },
      {
        text: "Listen to everyone's ideas.",
        icon: 'Ear',
        color: 'indigo',
        label: 'Listen',
      },
    ],
  },
  {
    id: 'reciprocal-teaching',
    name: 'Reciprocal Teaching',
    grades: '6-12',
    gradeLevels: ['6-8', '9-12'],
    icon: 'Users',
    color: 'slate',
    steps: [
      {
        text: 'Predict and clarify content.',
        icon: 'Search',
        color: 'blue',
        label: 'Predict',
      },
      {
        text: 'Summarize key ideas.',
        icon: 'BookOpen',
        color: 'indigo',
        label: 'Sum',
      },
      {
        text: 'Question the content.',
        icon: 'HelpCircle',
        color: 'purple',
        label: 'Ask',
      },
    ],
  },
  {
    id: 'socratic-seminar',
    name: 'Socratic Seminar',
    grades: '6-12',
    gradeLevels: ['6-8', '9-12'],
    icon: 'GraduationCap',
    color: 'zinc',
    steps: [
      {
        text: 'Read and annotate the text.',
        icon: 'Pencil',
        color: 'blue',
        label: 'Annotate',
      },
      {
        text: 'Participate in student-led dialogue.',
        icon: 'Users',
        color: 'indigo',
        label: 'Discuss',
      },
      {
        text: 'Refine understanding through questioning.',
        icon: 'Search',
        color: 'purple',
        label: 'Inquire',
      },
    ],
  },
  {
    id: 'stronger-clearer',
    name: 'Stronger & Clearer',
    grades: '6-12',
    gradeLevels: ['6-8', '9-12'],
    icon: 'RefreshCw',
    color: 'stone',
    steps: [
      {
        text: 'Write your first draft response.',
        icon: 'Pencil',
        color: 'blue',
        label: 'Draft',
      },
      {
        text: 'Discuss and refine with partners.',
        icon: 'Users',
        color: 'indigo',
        label: 'Refine',
      },
      {
        text: 'Finalize your stronger and clearer response.',
        icon: 'RefreshCw',
        color: 'green',
        label: 'Polish',
      },
    ],
  },
  {
    id: 'notice-wonder-hs',
    name: 'Notice & Wonder',
    grades: '9-12',
    gradeLevels: ['9-12'],
    icon: 'Eye',
    color: 'neutral',
    steps: [
      {
        text: 'Observe the phenomenon or text closely.',
        icon: 'Eye',
        color: 'blue',
        label: 'Notice',
      },
      {
        text: 'Identify what you notice.',
        icon: 'Search',
        color: 'indigo',
        label: 'Wonder',
      },
      {
        text: 'Record what you wonder about.',
        icon: 'HelpCircle',
        color: 'purple',
        label: 'Inquire',
      },
    ],
  },
  {
    id: 'blooms-analysis',
    name: "Bloom's Taxonomy",
    grades: '9-12',
    gradeLevels: ['9-12'],
    icon: 'Brain',
    color: 'blue',
    steps: [
      {
        text: 'Recall and list facts.',
        icon: 'Brain',
        color: 'slate',
        label: 'Recall',
      },
      {
        text: 'Explain and summarize.',
        icon: 'Brain',
        color: 'blue',
        label: 'Understand',
      },
      {
        text: 'Apply and solve.',
        icon: 'Brain',
        color: 'indigo',
        label: 'Apply',
      },
      {
        text: 'Analyze and organize.',
        icon: 'Brain',
        color: 'purple',
        label: 'Analyze',
      },
      {
        text: 'Create and design.',
        icon: 'Brain',
        color: 'green',
        label: 'Create',
      },
      {
        text: 'Evaluate and judge.',
        icon: 'Brain',
        color: 'amber',
        label: 'Evaluate',
      },
    ],
  },
];
