export interface CapturedItem {
  id: string;
  timestamp: number;
  dataUrl: string;
  status: 'captured' | 'processing' | 'error';
}

export interface WebcamGlobalConfig {
  ocrMode?: 'standard' | 'gemini';
}
