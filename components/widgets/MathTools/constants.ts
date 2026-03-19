import { MathToolType, GradeLevel } from '@/types';

export const GRADE_LABELS: Record<GradeLevel, string> = {
  'k-2': 'K–2',
  '3-5': '3–5',
  '6-8': '6–8',
  '9-12': '9–12',
};

// ---------------------------------------------------------------------------
// Palette section definitions
// ---------------------------------------------------------------------------

export type SectionMode = 'sticker-whole' | 'sticker-pieces' | 'interactive';

export interface PaletteSection {
  id: string;
  title: string;
  subtitle: string;
  toolTypes: MathToolType[];
  mode: SectionMode;
}

export const PALETTE_SECTIONS: PaletteSection[] = [
  {
    id: 'measurement',
    title: 'Measurement',
    subtitle: 'True-scale stickers',
    toolTypes: ['ruler-in', 'ruler-cm', 'protractor'],
    mode: 'sticker-whole',
  },
  {
    id: 'manipulatives',
    title: 'Manipulatives',
    subtitle: 'Drag individual pieces onto your board',
    toolTypes: ['base-10', 'fraction-tiles', 'pattern-blocks', 'algebra-tiles'],
    mode: 'sticker-pieces',
  },
  {
    id: 'interactive',
    title: 'Interactive',
    subtitle: 'Full-featured tool windows',
    toolTypes: ['number-line', 'geoboard', 'coordinate-plane', 'calculator'],
    mode: 'interactive',
  },
];
