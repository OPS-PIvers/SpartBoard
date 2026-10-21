// Bumping any part re-looks up every card on its next save; utils/pronunciation/g2pVersion.ts copies it for the editor.
import { PRONUNCIATION_MODEL } from './voices';

export const ESPEAK_PACKAGE = '@echogarden/espeak-ng-emscripten@0.3.5';
export const SPEAK_G2P_VERSION = `${ESPEAK_PACKAGE}+1.51norm/cmudict-7479086/voices-r2-${PRONUNCIATION_MODEL.md5Prefix}/phrases-2`;
// Any version but the current one makes the next save look the card up again.
export const SPEAK_G2P_VOICES_PENDING = `${SPEAK_G2P_VERSION}/pending`;
