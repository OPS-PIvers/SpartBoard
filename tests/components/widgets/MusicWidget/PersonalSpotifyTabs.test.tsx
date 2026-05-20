import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyTabs } from '@/components/widgets/MusicWidget/PersonalSpotifyTabs';

describe('PersonalSpotifyTabs', () => {
  it('renders three tabs with the active one highlighted', () => {
    render(
      <PersonalSpotifyTabs
        active="library"
        isAudioActive={false}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Playlists/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /Search/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('shows the green dot on Now Playing when audio is active', () => {
    render(
      <PersonalSpotifyTabs active="library" isAudioActive onChange={vi.fn()} />
    );
    expect(screen.getByTestId('audio-playing-dot')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /now playing — audio active/i })
    ).toBeInTheDocument();
  });

  it('hides the green dot when no audio', () => {
    render(
      <PersonalSpotifyTabs
        active="library"
        isAudioActive={false}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByTestId('audio-playing-dot')).toBeNull();
  });

  it('calls onChange with the new tab key', () => {
    const onChange = vi.fn();
    render(
      <PersonalSpotifyTabs
        active="library"
        isAudioActive={false}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Search/i }));
    expect(onChange).toHaveBeenCalledWith('search');
  });
});
