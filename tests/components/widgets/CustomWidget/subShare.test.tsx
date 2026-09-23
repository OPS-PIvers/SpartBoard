import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { CustomWidgetWidget } from '@/components/widgets/CustomWidget/Widget';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { noSubShareKey } from '@/tests/testHelpers/subShareContent';
import type { WidgetData } from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {}, isConfigured: true }));
vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({ addToast: vi.fn() }),
}));

const grid = {
  columns: 1,
  rows: 1,
  cells: [],
  connections: [],
};

const widget = (customWidgetId: string | null) =>
  ({
    id: 'w1',
    type: 'custom-widget',
    config: { customWidgetId },
  }) as unknown as WidgetData;

const inShare = (load: () => Promise<unknown>) =>
  function InShare({ children }: { children: React.ReactNode }) {
    return (
      <SubShareContentContext.Provider
        value={{
          shareId: 's1',
          version: 0,
          load: load as never,
          loadKey: noSubShareKey,
        }}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  };

describe('CustomWidget inside a sub share', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (firestore.doc as unknown as Mock).mockReturnValue('doc-ref');
  });

  // A substitute cannot read a beta-gated custom_widgets doc, so subscribing
  // would render the widget empty; the bundled definition is what it must use.
  it('renders the bundled definition and never subscribes', async () => {
    const load = vi.fn().mockResolvedValue({
      doc: { id: 'cw-1', title: 'Dice', mode: 'block', gridDefinition: grid },
    });

    render(<CustomWidgetWidget widget={widget('cw-1')} />, {
      wrapper: inShare(load),
    });

    await waitFor(() =>
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    );
    expect(firestore.onSnapshot).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith('customWidget', 'cw-1');
  });

  // Outside a share the widget must still subscribe to its own live doc.
  it('subscribes as usual outside a share', () => {
    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (_ref: unknown, _next: unknown) => vi.fn()
    );

    render(<CustomWidgetWidget widget={widget('cw-1')} />);

    expect(firestore.onSnapshot).toHaveBeenCalled();
  });
});
