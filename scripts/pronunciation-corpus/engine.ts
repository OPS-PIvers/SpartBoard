// The gate's one entry into the app's scoring code: separate runnerImport calls would load separate module instances.
export { PRONUNCIATION_MODEL } from '@/config/pronunciationModel';
export * as audio from '@/utils/pronunciation/audio';
export { greedyCtcDecode, invertVocab } from '@/utils/pronunciation/ctcDecode';
export * as stress from '@/utils/pronunciation/stress';
export * as core from '@/utils/pronunciation/recognizerCore';
export * as groups from '@/config/pronunciationGroups';
export { DEFAULT_UNCLEAR_CONFIDENCE } from '@/config/flashcardsSpeakAdmin';
export { judgeSpeech } from '@/utils/pronunciation/verdict';
export { logSoftmax } from '@/utils/pronunciation/likelihood';
export { PRONUNCIATION_VARIANTS } from '@/config/pronunciationVariants';
export * as scoring from '@/config/pronunciationScoring';
export { generateMutations, applyMutation } from './mutate';
export { PRONUNCIATION_VOICES } from '@/config/pronunciationVoices';
