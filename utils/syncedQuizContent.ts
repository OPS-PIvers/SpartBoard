import type { SyncedQuizGroup } from '@/types';

/** Quiz content a synced group mirrors besides title and questions. */
export type SyncedQuizContentFields = Pick<
  SyncedQuizGroup,
  | 'stimuli'
  | 'paperSheetStimuli'
  | 'language'
  | 'bankSlots'
  | 'order'
  | 'sections'
>;

/** The non-empty content fields of a quiz or canonical doc, so bank draws travel with it. */
export function syncedQuizContentFields(
  source: SyncedQuizContentFields
): SyncedQuizContentFields {
  return {
    ...(source.stimuli?.length ? { stimuli: source.stimuli } : {}),
    ...(source.paperSheetStimuli?.length
      ? { paperSheetStimuli: source.paperSheetStimuli }
      : {}),
    ...(source.language ? { language: source.language } : {}),
    ...(source.bankSlots?.length ? { bankSlots: source.bankSlots } : {}),
    ...(source.order?.length ? { order: source.order } : {}),
    ...(source.sections?.length ? { sections: source.sections } : {}),
  };
}
