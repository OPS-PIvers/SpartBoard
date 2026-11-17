// Values and summaries for the Writing assign stepper's own steps.
export interface WritingRulesValue {
  allowPaste: boolean;
  recordingNotice: boolean;
  studentCanViewRecord: boolean;
  spellCheck: boolean;
  timeLimitMinutes: number | null;
}

export interface WritingIntegrityValue {
  tabWarningsEnabled: boolean;
  focusLevel?: 'lock';
  blockPrint: boolean;
}

export const DEFAULT_WRITING_RULES: WritingRulesValue = {
  allowPaste: false,
  recordingNotice: true,
  studentCanViewRecord: false,
  spellCheck: true,
  timeLimitMinutes: null,
};

export const DEFAULT_WRITING_INTEGRITY: WritingIntegrityValue = {
  tabWarningsEnabled: true,
  blockPrint: false,
};

export function formatWritingRulesValue(v: WritingRulesValue): string {
  const parts = [
    v.allowPaste ? 'Paste on' : 'Paste off',
    v.spellCheck ? 'spell check on' : 'spell check off',
  ];
  if (v.timeLimitMinutes) parts.push(`${v.timeLimitMinutes} min`);
  return parts.join(', ');
}

export function formatWritingIntegrityValue(v: WritingIntegrityValue): string {
  if (!v.tabWarningsEnabled) return 'Off';
  return v.focusLevel === 'lock' ? 'Focus mode, fullscreen' : 'Focus mode';
}
