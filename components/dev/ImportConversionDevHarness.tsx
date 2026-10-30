// DEV-ONLY: Import's AI Conversion review steps (Flashcards, Activity Wall, Board) against fixtures; ?view=flashcards|wall|board.

import React, { useMemo, useState } from 'react';
import { DashboardContext } from '@/context/DashboardContextValue';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import {
  ImportWizard,
  type ImportAdapter,
} from '@/components/common/library/importer';
import { createFlashcardImportAdapter } from '@/components/widgets/Flashcards/adapters/flashcardImportAdapter';
import { createActivityWallImportAdapter } from '@/components/widgets/ActivityWall/adapters/activityWallImportAdapter';
import { BoardImportReview } from '@/components/import/conversion/BoardImportReview';
import { placeTemplateLayout } from '@/utils/ai';
import type { ConversionInput } from '@/utils/import/aiConversion';

const INPUT: ConversionInput = {
  title: 'The Water Cycle',
  url: 'https://example.org/water-cycle',
  text: 'The water cycle…',
};

const dashboard = {
  addToast: () => undefined,
  addWidgets: () => undefined,
  createNewDashboard: () => new Promise(() => undefined),
  activeDashboard: null,
} as unknown as DashboardContextValue;

// The real adapter's AI path with the callable stubbed; the harness reaches review through the JSON paste box.
function viaPaste<T>(adapter: ImportAdapter<T>): ImportAdapter<T> {
  return {
    ...adapter,
    supportedSources: ['json'],
    supportsJsonPaste: true,
    parse: () => adapter.parse({ kind: 'conversion', input: INPUT }),
  };
}

const flashcards = viaPaste(
  createFlashcardImportAdapter({
    loadSheet: () => Promise.resolve([]),
    pickSheet: () => Promise.resolve(null),
    save: () => Promise.resolve(),
    convert: () =>
      Promise.resolve({
        target: 'flashcards',
        title: 'The Water Cycle',
        truncated: false,
        cards: [
          [
            'Evaporation',
            'Liquid water from oceans, lakes and rivers is heated by the sun and turns into water vapor.',
          ],
          [
            'Condensation',
            'Water vapor cools high in the air and turns back into tiny droplets that form clouds.',
          ],
          [
            'Precipitation',
            'Water falls from clouds as rain, snow, sleet or hail when the droplets get too heavy.',
          ],
          [
            'Collection',
            'Fallen water gathers in oceans, lakes, rivers and underground, where the cycle starts again.',
          ],
          [
            'Transpiration',
            'Plants release water vapor into the air through small openings in their leaves.',
          ],
          [
            'Runoff',
            'Water that flows over the ground into streams and rivers instead of soaking in.',
          ],
          [
            'Groundwater',
            'Water stored underground in soil and rock that can feed wells and springs.',
          ],
        ].map(([term, definition]) => ({ term, definition })),
      }),
  })
);

const wall = viaPaste(
  createActivityWallImportAdapter({
    defaults: {},
    save: () => Promise.resolve(),
    convert: () =>
      Promise.resolve({
        target: 'activityWall',
        title: 'Where does water go?',
        prompt:
          'Think about a rainy day at school. Where does the rain go after it lands, and which step of the water cycle comes next?',
        layout: 'columns',
        columns: ['On the ground', 'Into the air', 'Underground'],
        truncated: false,
      }),
  })
);

export const ImportConversionDevHarness: React.FC = () => {
  const view = new URLSearchParams(window.location.search).get('view');
  const [open, setOpen] = useState(true);
  const plan = useMemo(
    () => ({
      title: 'The Water Cycle',
      truncated: false,
      widgets: placeTemplateLayout(
        {
          templateId: 'direct-instruction',
          slots: [
            { zoneId: 'top-side', widgetType: 'text', config: {} },
            { zoneId: 'bottom-side', widgetType: 'time-tool', config: {} },
            { zoneId: 'main', widgetType: 'embed', config: {} },
          ],
        },
        { screen: { w: 1920, h: 1080 } }
      ),
    }),
    []
  );

  return (
    <DashboardContext.Provider value={dashboard}>
      <div className="h-screen [height:100dvh] bg-slate-100">
        {view === 'board' ? (
          <BoardImportReview plan={plan} onClose={() => undefined} />
        ) : view === 'wall' ? (
          <ImportWizard
            isOpen={open}
            onClose={() => setOpen(false)}
            adapter={wall}
          />
        ) : (
          <ImportWizard
            isOpen={open}
            onClose={() => setOpen(false)}
            adapter={flashcards}
          />
        )}
      </div>
    </DashboardContext.Provider>
  );
};
