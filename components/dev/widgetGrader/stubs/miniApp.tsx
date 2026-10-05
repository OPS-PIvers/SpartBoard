import { SavedWidgetsProvider } from '@/context/SavedWidgetsContext';
import type { WidgetStub } from './types';

// In bypass builds the provider skips its Firestore listener.
export const miniAppStub: WidgetStub = { Wrapper: SavedWidgetsProvider };
