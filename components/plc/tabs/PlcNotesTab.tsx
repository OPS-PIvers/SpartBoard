import React from 'react';
import { Plc } from '@/types';
import { NotesBody } from '@/components/plc/bodies/NotesBody';

interface PlcNotesTabProps {
  plc: Plc;
}

/**
 * Tab-mode wrapper around the shared `NotesBody`. The body owns the editor
 * state, hooks, and chrome; this tab is now a placement-only shim used by
 * the legacy v1 dashboard tab routing. The v2 grid renders `NotesBody`
 * directly inside a tile (or its fullscreen expansion).
 */
export const PlcNotesTab: React.FC<PlcNotesTabProps> = ({ plc }) => {
  return <NotesBody plc={plc} />;
};
