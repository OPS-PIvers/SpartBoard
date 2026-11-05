import React from 'react';

interface LibraryRowSubtitleProps {
  /** The count chip, e.g. "10 Qs" or "17 cards". */
  countLabel: string;
  /** Usually "Updated <date>"; a status line can stand in for it. */
  status: React.ReactNode;
  /** Epoch ms of the newest assignment; 0 or absent hides it. */
  lastAssignedAt?: number;
  lastAssignedLabel?: string;
}

/** Library row subtitle: count chip · updated · last assigned (wide rows only). */
export const LibraryRowSubtitle: React.FC<LibraryRowSubtitleProps> = ({
  countLabel,
  status,
  lastAssignedAt = 0,
  lastAssignedLabel = 'Last assigned',
}) => (
  <span className="flex items-center gap-2">
    <span
      className="bg-brand-blue-lighter text-brand-blue-primary font-bold rounded-sm uppercase"
      style={{
        paddingInline: 'min(6px, 1.5cqmin)',
        fontSize: 'min(10px, 3.5cqmin)',
      }}
    >
      {countLabel}
    </span>
    <span>{status}</span>
    {lastAssignedAt > 0 && (
      <span className="hidden [@container(min-width:600px)]:inline">
        · {lastAssignedLabel} {new Date(lastAssignedAt).toLocaleDateString()}
      </span>
    )}
  </span>
);
