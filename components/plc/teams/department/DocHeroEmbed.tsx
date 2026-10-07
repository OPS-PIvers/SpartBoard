// The pinned Google Doc shown inside the hub hero.

import React from 'react';
import { useAuth } from '@/context/useAuth';
import {
  convertToEmbedUrl,
  ensureProtocol,
  withGoogleDocsToolbar,
} from '@/utils/urlHelpers';

export const DocHeroEmbed: React.FC<{ url: string; title: string }> = ({
  url,
  title,
}) => {
  const { canAccessFeature } = useAuth();
  const embed = convertToEmbedUrl(ensureProtocol(url));
  return (
    <iframe
      src={
        canAccessFeature('plc-docs-toolbar')
          ? withGoogleDocsToolbar(embed)
          : embed
      }
      title={title}
      className="block h-[28rem] w-full border-0"
      sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
      allow="clipboard-write"
    />
  );
};
