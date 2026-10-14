// Pinned on-device phoneme model (#2349). Self-hosting replaces the Hugging Face URL (G18).
export const PRONUNCIATION_MODEL = {
  id: 'wav2vec2-xlsr-53-espeak-cv-ft-q4',
  source: 'qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX',
  file: 'model_q4.onnx',
  bytes: 241_430_967,
  md5Prefix: 'b9e69f089908',
  defaultUrl:
    'https://huggingface.co/qnighy/wav2vec2-xlsr-53-espeak-cv-ft-ONNX/resolve/main/onnx/model_q4.onnx',
  padId: 0,
  vocabSize: 392,
} as const;
