/** Admin-curated `admin_settings/plc_note_collab` rollout switch for real-time note editing. */

export const PLC_NOTE_COLLAB_SETTINGS_DOC = 'plc_note_collab';

export interface PlcNoteCollabSettings {
  /**
   * Route the notes editor through the CRDT instead of debounced whole-body
   * saves. Ships OFF: the legacy path keeps working untouched until an admin
   * flips this, and flipping it back is the kill switch.
   */
  enabled: boolean;
}

export const DEFAULT_PLC_NOTE_COLLAB_SETTINGS: PlcNoteCollabSettings = {
  enabled: false,
};

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizePlcNoteCollabSettings(
  raw: unknown
): PlcNoteCollabSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_PLC_NOTE_COLLAB_SETTINGS;
  }
  const enabled = (raw as { enabled?: unknown }).enabled;
  return { enabled: enabled === true };
}
