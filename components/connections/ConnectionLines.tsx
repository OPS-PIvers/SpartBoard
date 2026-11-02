import React from 'react';
import type { Dashboard, WidgetData } from '@/types';
import { useConnectionsUi } from '@/context/connectionsUiStore';
import { liveSteps } from '@/utils/connectionEngine';

const center = (w: WidgetData) => ({ x: w.x + w.w / 2, y: w.y + w.h / 2 });

/** Thin lines between the widgets of the Connection whose badge is hovered, in step order. */
export const ConnectionLines: React.FC<{ dashboard: Dashboard }> = ({
  dashboard,
}) => {
  const highlightedId = useConnectionsUi((s) => s.highlightedId);
  if (!highlightedId) return null;
  const connection = dashboard.connections?.find((c) => c.id === highlightedId);
  if (!connection) return null;
  const byId = new Map(dashboard.widgets.map((w) => [w.id, w]));
  const ids =
    connection.kind === 'follow'
      ? [connection.leaderId, connection.followerId]
      : liveSteps(connection, dashboard.widgets).flatMap((s) =>
          s.actions.slice(0, 1).map((a) => a.widgetId)
        );
  const points = ids.flatMap((id) => {
    const w = byId.get(id);
    return w && !w.minimized ? [center(w)] : [];
  });
  if (connection.kind === 'sequence' && connection.repeat !== 'once') {
    if (points.length > 2) points.push(points[0]);
  }
  if (points.length < 2) return null;
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ width: '100%', height: '100%', zIndex: 9990 }}
    >
      <polyline
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="#2d3f89"
        strokeWidth={3}
        strokeDasharray="8 6"
        strokeLinejoin="round"
        opacity={0.85}
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={6} fill="#2d3f89" />
      ))}
    </svg>
  );
};
