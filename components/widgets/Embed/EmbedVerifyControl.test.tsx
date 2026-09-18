// Pins that an in-flight verify discards its result once the teacher has
// moved on to a different url — a stale Cloud Function response must never
// overwrite the newer url's isEmbeddable/blockedReason.
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { WidgetData } from '@/types';

vi.mock('@/config/firebase', () => ({ functions: {} }));

vi.mock('@/hooks/useWidgetBuildingId', () => ({
  useWidgetBuildingId: () => undefined,
}));

vi.mock('./hooks/useEmbedConfig', () => ({
  useEmbedConfig: () => ({
    config: { buildingId: '', hideUrlField: false, whitelistUrls: [] },
    isLoading: false,
  }),
}));

let resolveVerify: (value: {
  data: { isEmbeddable: boolean; uncertain?: boolean };
}) => void;
const mockCheckCompatibility = vi.fn(
  () =>
    new Promise((resolve) => {
      resolveVerify = resolve;
    })
);
vi.mock('firebase/functions', () => ({
  httpsCallable: () => mockCheckCompatibility,
}));

import { EmbedVerifyControl } from './EmbedVerifyControl';

const t = (key: string) => key;
const widget: WidgetData = {
  id: 'w1',
  type: 'embed',
  x: 0,
  y: 0,
  w: 480,
  h: 350,
  z: 1,
  flipped: false,
  config: {},
} as WidgetData;

describe('EmbedVerifyControl stale verification', () => {
  it('discards a verify result once the teacher has edited the url to something else', async () => {
    const updateConfig = vi.fn();

    const { rerender } = render(
      <EmbedVerifyControl
        config={{ url: 'https://a.example.com', isEmbeddable: true }}
        widget={widget}
        updateConfig={updateConfig}
        t={t}
        isAdmin={false}
        canAccessFeature={() => true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(mockCheckCompatibility).toHaveBeenCalledWith({
      url: 'https://a.example.com',
    });

    // The teacher edits the url before the Cloud Function responds.
    rerender(
      <EmbedVerifyControl
        config={{ url: 'https://b.example.com', isEmbeddable: true }}
        widget={widget}
        updateConfig={updateConfig}
        t={t}
        isAdmin={false}
        canAccessFeature={() => true}
      />
    );
    updateConfig.mockClear(); // drop the reset-on-edit call from the url-change effect

    await act(async () => {
      resolveVerify({ data: { isEmbeddable: true } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateConfig).not.toHaveBeenCalled();
  });

  it('still writes the result for a url the teacher has not changed', async () => {
    const updateConfig = vi.fn();

    render(
      <EmbedVerifyControl
        config={{ url: 'https://a.example.com', isEmbeddable: true }}
        widget={widget}
        updateConfig={updateConfig}
        t={t}
        isAdmin={false}
        canAccessFeature={() => true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /verify/i }));

    await act(async () => {
      resolveVerify({ data: { isEmbeddable: true } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateConfig).toHaveBeenCalledWith({
      isEmbeddable: true,
      blockedReason: '',
    });
  });

  // An unreachable site used to come back isEmbeddable:true and get saved as verified.
  it('leaves the saved verdict alone when the probe could not reach the site', async () => {
    const updateConfig = vi.fn();

    render(
      <EmbedVerifyControl
        config={{ url: 'https://a.example.com', isEmbeddable: true }}
        widget={widget}
        updateConfig={updateConfig}
        t={t}
        isAdmin={false}
        canAccessFeature={() => true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /verify/i }));

    await act(async () => {
      resolveVerify({ data: { isEmbeddable: false, uncertain: true } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateConfig).not.toHaveBeenCalled();
    expect(screen.getByText(/verifyErrorGeneric/)).toBeInTheDocument();
  });
});
