export interface CapturedItem {
  id: string;
  timestamp: number;
  dataUrl: string;
  status: 'captured' | 'processing' | 'error';
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WebcamGlobalConfig {
  // Config properties will go here if added in the future
}
