// Copy of functions/src/pronunciation/g2pVersion.ts; tests/pronunciation/lookupParity.test.ts keeps them equal.
import { PRONUNCIATION_MODEL } from '@/config/pronunciationModel';

export const SPEAK_G2P_VERSION = `@echogarden/espeak-ng-emscripten@0.3.5+1.51norm/cmudict-7479086/voices-r2-${PRONUNCIATION_MODEL.md5Prefix}/phrases-2`;
export const SPEAK_G2P_VOICES_PENDING = `${SPEAK_G2P_VERSION}/pending`;
