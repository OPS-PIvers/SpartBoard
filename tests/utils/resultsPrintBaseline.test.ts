import { describe, expect, it } from 'vitest';
import { RESULTS_PRINT_PRESETS } from '@/utils/quizResultsPrintPresets';
import { buildResultsPrintHtml } from '@/utils/quizStudentReportPrint';
import { fixtureJob } from './fixtures/resultsPrintMarkupFixture';

describe('results print output, one snapshot per preset', () => {
  for (const preset of RESULTS_PRINT_PRESETS) {
    it(`${preset.id} prints as it always has`, () => {
      expect(
        buildResultsPrintHtml(fixtureJob(), preset.options)
      ).toMatchSnapshot();
    });
    it(`${preset.id} with the sheet and report both`, () => {
      expect(
        buildResultsPrintHtml(fixtureJob(), {
          ...preset.options,
          layout: 'both',
        })
      ).toMatchSnapshot();
    });
  }
});
