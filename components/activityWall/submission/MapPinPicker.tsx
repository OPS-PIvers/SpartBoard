import React from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPin {
  lat: number;
  lng: number;
}

interface MapPinPickerProps {
  center: { lat: number; lng: number; zoom: number };
  pin: MapPin | null;
  onPick: (pin: MapPin) => void;
}

const pinIcon = divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:9999px;background:#ad2122;border:3px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const PinDropper: React.FC<{ onPick: (pin: MapPin) => void }> = ({
  onPick,
}) => {
  useMapEvents({
    click: (event) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
};

/** Leaflet + OpenStreetMap pin picker. Lazy-loaded so Leaflet stays out of the main bundle. */
const MapPinPicker: React.FC<MapPinPickerProps> = ({ center, pin, onPick }) => (
  <div className="overflow-hidden rounded-xl border border-slate-300">
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={center.zoom}
      style={{ height: 260, width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <PinDropper onPick={onPick} />
      {pin && <Marker position={[pin.lat, pin.lng]} icon={pinIcon} />}
    </MapContainer>
  </div>
);

export default MapPinPicker;
