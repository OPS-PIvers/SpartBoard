import { CustomWidgetsProvider } from '@/context/CustomWidgetsContext';
import type { WidgetStub } from './types';

// The settings panel reads widget definitions from this provider; bypass builds skip its listener.
export const customWidgetStub: WidgetStub = { Wrapper: CustomWidgetsProvider };
