import { cluesOf } from './playback/frameScript';
import { assessTarget } from './playback/locate';

// Bench only: lets the perf harness record a step's clues the way the recorder would, and time the locator.
Object.assign(globalThis, { __sbCapture: cluesOf, __sbAssess: assessTarget });
