import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
const embedPolicy = { hideUrlField: false };
vi.mock('@/components/widgets/Embed/hooks/useEmbedConfig', () => ({
  useEmbedConfig: () => ({
    config: {
      buildingId: '',
      hideUrlField: embedPolicy.hideUrlField,
      whitelistUrls: [],
    },
    isLoading: false,
  }),
}));

import { ReferenceEmbedStep } from './ReferenceEmbedStep';

const renderStep = (isEmbeddable: boolean) => {
  const props = {
    onPlace: vi.fn(),
    onConvert: vi.fn(),
    onCancel: vi.fn(),
    check: vi.fn().mockResolvedValue({ isEmbeddable }),
  };
  render(
    <ReferenceEmbedStep
      url="https://www.news.example.com/story"
      title="Story"
      {...props}
    />
  );
  return props;
};

describe('ReferenceEmbedStep', () => {
  it('places once even when the parent re-renders with a new check function', async () => {
    const onPlace = vi.fn();
    const props = { onConvert: vi.fn(), onCancel: vi.fn(), onPlace };
    const { rerender } = render(
      <ReferenceEmbedStep
        url="https://a.example.com"
        check={vi.fn().mockResolvedValue({ isEmbeddable: true })}
        {...props}
      />
    );
    await waitFor(() => expect(onPlace).toHaveBeenCalledTimes(1));
    rerender(
      <ReferenceEmbedStep
        url="https://a.example.com"
        check={vi.fn().mockResolvedValue({ isEmbeddable: true })}
        {...props}
      />
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(onPlace).toHaveBeenCalledTimes(1);
  });

  it('places the Embed straight away when the page can be framed', async () => {
    const { onPlace } = renderStep(true);
    await waitFor(() => expect(onPlace).toHaveBeenCalledTimes(1));
    expect(onPlace.mock.calls[0][0]).toMatchObject({ type: 'embed' });
  });

  it('never places a blank Embed when the page refuses framing', async () => {
    const { onPlace, onConvert } = renderStep(false);
    expect(
      await screen.findByText(/can.t show inside SpartBoard/)
    ).toBeInTheDocument();
    expect(screen.getByText(/news\.example\.com blocks/)).toBeInTheDocument();
    expect(onPlace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Convert instead' }));
    expect(onConvert).toHaveBeenCalled();
  });

  it('offers the page as a link instead', async () => {
    const { onPlace } = renderStep(false);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add as a link' })
    );
    expect(onPlace).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'url' })
    );
  });

  it('leaves out Convert and the link when neither is available', async () => {
    render(
      <ReferenceEmbedStep
        url="https://www.news.example.com/story"
        onPlace={vi.fn()}
        onCancel={vi.fn()}
        canAddLink={false}
        check={vi.fn().mockResolvedValue({ isEmbeddable: false })}
      />
    );
    expect(
      await screen.findByRole('button', { name: 'Cancel' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Convert instead' })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add as a link' })).toBeNull();
  });

  it('never places a page Embed when the building only allows code embeds', async () => {
    embedPolicy.hideUrlField = true;
    try {
      const { onPlace, check } = renderStep(true);
      expect(
        await screen.findByText(/turned off showing web pages/)
      ).toBeInTheDocument();
      expect(check).not.toHaveBeenCalled();
      expect(onPlace).not.toHaveBeenCalled();
    } finally {
      embedPolicy.hideUrlField = false;
    }
  });
});
