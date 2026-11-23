import { createContext, useContext } from 'react';

/** Mockup only: a names line (a), one row per student (b) or a separate Students list (c). */
export type PickedLayout = 'a' | 'b' | 'c';
export const PickedLayoutContext = createContext<PickedLayout>('a');
export const usePickedLayout = () => useContext(PickedLayoutContext);
