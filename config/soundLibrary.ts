import { SoundboardSound } from '@/types';

// All built-in library sounds use Web Audio API synthesis (synthesized: true)
// so they work offline and avoid CORS/CDN issues.
export const SOUND_LIBRARY: SoundboardSound[] = [
  {
    id: 'lib-applause',
    label: 'Applause',
    url: '',
    synthesized: true,
    color: '#34d399', // Emerald 400
  },
  {
    id: 'lib-tada',
    label: 'Ta-Da',
    url: '',
    synthesized: true,
    color: '#f472b6', // Pink 400
  },
  {
    id: 'lib-ding',
    label: 'Ding',
    url: '',
    synthesized: true,
    color: '#fbbf24', // Amber 400
  },
  {
    id: 'lib-fail',
    label: 'Fail',
    url: '',
    synthesized: true,
    color: '#f87171', // Red 400
  },
  {
    id: 'lib-drumroll',
    label: 'Drumroll',
    url: '',
    synthesized: true,
    color: '#a78bfa', // Violet 400
  },
  {
    id: 'lib-whistle',
    label: 'Whistle',
    url: '',
    synthesized: true,
    color: '#60a5fa', // Blue 400
  },
  {
    id: 'lib-airhorn',
    label: 'Airhorn',
    url: '',
    synthesized: true,
    color: '#fb923c', // Orange 400
  },
  {
    id: 'lib-crickets',
    label: 'Crickets',
    url: '',
    synthesized: true,
    color: '#94a3b8', // Slate 400
  },
];
