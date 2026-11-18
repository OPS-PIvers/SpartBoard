import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TOUR_ANCHORS, type TourAnchorDef } from '@/config/tourAnchors';
import { AlgebraTilesTool } from './AlgebraTilesTool';
import { Base10BlocksTool } from './Base10BlocksTool';
import { CalculatorTool } from './CalculatorTool';
import { FractionTilesTool } from './FractionTilesTool';
import { NumberLineTool } from './NumberLineTool';
import { PatternBlocksTool } from './PatternBlocksTool';

const FIELD_ANCHORS = [
  'math-tool.add-piece',
  'math-tool.calculator-key',
  'math-tool.denominator',
  'math-tool.number-line-mode',
] as const;

describe('Math Tool anchor keys', () => {
  it('every rendered key matches its anchor keyPattern', () => {
    const { container } = render(
      <>
        <AlgebraTilesTool />
        <Base10BlocksTool />
        <CalculatorTool />
        <FractionTilesTool />
        <NumberLineTool onModeChange={() => undefined} />
        <PatternBlocksTool />
      </>
    );
    for (const id of FIELD_ANCHORS) {
      const def: TourAnchorDef = TOUR_ANCHORS[id];
      expect(def.keyPattern, id).toBeTruthy();
      expect(def.keyHint, id).toBeTruthy();
      const pattern = new RegExp(`^(?:${def.keyPattern})$`);
      const els = container.querySelectorAll(`[data-tour="${id}"]`);
      expect(els.length, id).toBeGreaterThan(0);
      els.forEach((el) => {
        const key = `${el.getAttribute('data-tour-widget-type')}#${el.getAttribute('data-tour-field')}`;
        expect(pattern.test(key), `${id} ${key}`).toBe(true);
      });
    }
  });
});
