import { STANDARD_COLORS } from '@/config/colors';

// Poster Colors Mapping
export const POSTER_LEVELS = [
  { label: '0 - Silence', color: STANDARD_COLORS.blue, threshold: 0 }, // Blue
  { label: '1 - Whisper', color: STANDARD_COLORS.green, threshold: 20 }, // Green
  { label: '2 - Conversation', color: STANDARD_COLORS.yellow, threshold: 40 }, // Yellow
  { label: '3 - Presenter', color: STANDARD_COLORS.orange, threshold: 60 }, // Orange
  { label: '4 - Outside', color: STANDARD_COLORS.red, threshold: 80 }, // Red
];

export const getLevelData = (volume: number) => {
  for (let i = POSTER_LEVELS.length - 1; i >= 0; i--) {
    if (volume >= POSTER_LEVELS[i].threshold) return POSTER_LEVELS[i];
  }
  return POSTER_LEVELS[0];
};
