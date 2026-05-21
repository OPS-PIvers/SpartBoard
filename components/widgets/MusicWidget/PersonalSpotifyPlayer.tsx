/**
 * Dispatch for personal-Spotify mode on the Music widget front face.
 *  - Loading auth state → loading placeholder
 *  - Not connected → Connect CTA (flip-to-connect hint)
 *  - Connected → <PersonalSpotifyBrowser /> (the 3-tab browse UI)
 * Player rendering (SDK + iframe) now lives inside PersonalSpotifyNowPlayingTab.
 */

import React from 'react';
import { Music2 } from 'lucide-react';
import { WidgetData } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { PersonalSpotifyBrowser } from './PersonalSpotifyBrowser';

interface Props {
  widget: WidgetData;
}

export const PersonalSpotifyPlayer: React.FC<Props> = ({ widget }) => {
  const { isConnected, state } = useSpotifyAuth();

  if (state.status === 'unknown') {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Music2}
            title="Loading Spotify…"
            subtitle="Checking your connection."
          />
        }
      />
    );
  }

  if (!isConnected) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Music2}
            title="Connect Spotify"
            subtitle="Flip this widget and connect your Spotify account."
          />
        }
      />
    );
  }

  return <PersonalSpotifyBrowser widget={widget} />;
};
