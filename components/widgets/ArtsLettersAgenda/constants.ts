import type { ArtsLettersAgendaPart } from '@/types';

export const DEFAULT_AGENDA_PARTS: ArtsLettersAgendaPart[] = [
  { id: 'launch', label: 'Launch' },
  { id: 'learn', label: 'Learn' },
  { id: 'land', label: 'Land' },
];

export const MAX_AGENDA_PARTS = 8;
export const PART_LABEL_MAX_LENGTH = 30;
export const DESCRIPTION_MAX_LENGTH = 200;
