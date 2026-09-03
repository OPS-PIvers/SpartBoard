import React from 'react';
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMapEvents,
} from 'react-leaflet';
import { divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SubmissionCard } from './SubmissionCard';
import { prepareSubmissions, wallScale } from './scale';
import { AddSpot } from './AddSpot';
import { showsAddSpots } from './addSpots';
import type { WallPlacement, WallRenderProps } from './types';

/** Emits the clicked coordinate; markers stop propagation so popups still open. */
const MapClickSpot: React.FC<{ onAddAt: (p: WallPlacement) => void }> = ({
  onAddAt,
}) => {
  useMapEvents({
    click: (event) => onAddAt({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
};

const DEFAULT_CENTER = { lat: 39.5, lng: -98.35, zoom: 4 };

const markerIcon = divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:9999px;background:var(--spart-accent, #ad2122);border:3px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** Map board: OpenStreetMap tiles with one marker per pinned post. */
export const MapLayout: React.FC<WallRenderProps> = ({
  session,
  submissions,
  mode,
  showNames,
  onMove: _onMove,
  onAddAt,
  ...actions
}) => {
  const scale = wallScale(mode);
  const addSpots = showsAddSpots(mode, onAddAt);
  const center = session.mapCenter ?? DEFAULT_CENTER;
  const items = prepareSubmissions(submissions, mode).filter(
    (submission) =>
      typeof submission.lat === 'number' && typeof submission.lng === 'number'
  );

  return (
    <div className="group relative h-full w-full" data-testid="aw-layout-map">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={center.zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {addSpots && <MapClickSpot onAddAt={onAddAt} />}
        {items.map((submission) => (
          <Marker
            key={submission.id}
            position={[submission.lat as number, submission.lng as number]}
            icon={markerIcon}
          >
            <Popup>
              <SubmissionCard
                submission={submission}
                mode={mode}
                showNames={showNames}
                {...actions}
              />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {addSpots && (
        <AddSpot
          mode={mode}
          placement={{}}
          onAddAt={onAddAt}
          alwaysVisible
          className="absolute z-[1000] shadow-lg"
          style={{ right: scale.pad, bottom: scale.pad }}
        />
      )}
    </div>
  );
};

export default MapLayout;
