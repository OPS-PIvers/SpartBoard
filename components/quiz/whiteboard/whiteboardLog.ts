// LOCAL STUB until W2 lands; not committed.
import type { WhiteboardLog } from './whiteboardLogTypes';
export function parseWhiteboardLog(text: string): WhiteboardLog {
  return JSON.parse(text) as WhiteboardLog;
}
