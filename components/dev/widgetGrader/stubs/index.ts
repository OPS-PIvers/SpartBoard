import type { WidgetType } from '@/types';
import { customWidgetStub } from './customWidget';
import { focusStub } from './focus';
import { installFakeMedia } from './media';
import { miniAppStub } from './miniApp';
import type { WidgetStub } from './types';

export type { WidgetStub } from './types';

const fakeMedia: WidgetStub = { install: installFakeMedia };

// Keep each slice's additions in its own alphabetized block.
export const WIDGET_STUBS: Partial<Record<WidgetType, WidgetStub>> = {
  // S5a
  miniApp: miniAppStub,
  sound: fakeMedia,
  webcam: fakeMedia,
  // Widget sweep 4
  'custom-widget': customWidgetStub,
  // Chrome extension FS8
  focus: focusStub,
};
