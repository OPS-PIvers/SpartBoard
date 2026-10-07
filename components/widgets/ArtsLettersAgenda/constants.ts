import type { ArtsLettersAgendaPartId } from '@/types';

export const AGENDA_PARTS: { id: ArtsLettersAgendaPartId; label: string }[] = [
  { id: 'launch', label: 'Launch' },
  { id: 'learn', label: 'Learn' },
  { id: 'land', label: 'Land' },
];

export const DESCRIPTION_MAX_LENGTH = 200;
