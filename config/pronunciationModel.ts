// Pinned on-device phoneme model (#2349), self-hosted in each project's Storage bucket (G18, F27).
export const PRONUNCIATION_MODEL = {
  id: 'wav2vec2-xlsr-53-espeak-cv-ft-q4',
  source: 'qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX',
  file: 'model_q4.onnx',
  bytes: 241_430_967,
  md5Prefix: 'b9e69f089908',
  storagePath:
    'pronunciation-models/wav2vec2-xlsr-53-espeak-cv-ft-q4/model_q4.onnx',
  huggingFaceUrl:
    'https://huggingface.co/qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX/resolve/main/onnx/model_q4.onnx',
  padId: 0,
  vocabSize: 392,
} as const;

// Speak's capture settings (F25): the bitrate the Chromebook gate measured, and no noise suppression.
export const SPEAK_CAPTURE = {
  audioBitsPerSecond: 128_000,
  constraints: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: true,
  },
} as const;

/** Public download URL of the hosted model in a Storage bucket (rules allow anyone to get it). */
export function hostedModelUrl(bucket: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(PRONUNCIATION_MODEL.storagePath)}?alt=media`;
}
