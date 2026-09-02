import React, { useEffect, useState } from 'react';
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
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

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';

/** react-leaflet ignores center/zoom prop changes after mount; this keeps the view synced to the draft. */
const MapViewSync: React.FC<{ lat: number; lng: number; zoom: number }> = ({
  lat,
  lng,
  zoom,
}) => {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], zoom);
  }, [map, lat, lng, zoom]);
  return null;
};

const PinDropper: React.FC<{ onPick: (pin: MapPin) => void }> = ({
  onPick,
}) => {
  useMapEvents({
    click: (event) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
};

/** Keyboard-operable alternative to tapping the map. */
const CoordinateEntry: React.FC<{ onPick: (pin: MapPin) => void }> = ({
  onPick,
}) => {
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  const latValue = Number.parseFloat(lat);
  const lngValue = Number.parseFloat(lng);
  const valid =
    Number.isFinite(latValue) &&
    Number.isFinite(lngValue) &&
    Math.abs(latValue) <= 90 &&
    Math.abs(lngValue) <= 180;

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="text-sm font-semibold text-brand-blue-primary hover:underline"
      >
        Enter coordinates
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <label
              className="mb-1 block text-sm font-semibold text-slate-700"
              htmlFor="aw-pin-lat"
            >
              Latitude
            </label>
            <input
              id="aw-pin-lat"
              className={inputClass}
              type="number"
              step="any"
              min={-90}
              max={90}
              value={lat}
              onChange={(event) => setLat(event.target.value)}
            />
          </div>
          <div>
            <label
              className="mb-1 block text-sm font-semibold text-slate-700"
              htmlFor="aw-pin-lng"
            >
              Longitude
            </label>
            <input
              id="aw-pin-lng"
              className={inputClass}
              type="number"
              step="any"
              min={-180}
              max={180}
              value={lng}
              onChange={(event) => setLng(event.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onPick({ lat: latValue, lng: lngValue })}
            className="col-span-2 rounded-xl border border-slate-300 py-2 text-sm font-semibold text-slate-700 transition disabled:opacity-60"
          >
            Set pin
          </button>
        </div>
      )}
    </div>
  );
};

/** Leaflet + OpenStreetMap pin picker. Lazy-loaded so Leaflet stays out of the main bundle. */
const MapPinPicker: React.FC<MapPinPickerProps> = ({ center, pin, onPick }) => (
  <div>
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
        <MapViewSync lat={center.lat} lng={center.lng} zoom={center.zoom} />
        <PinDropper onPick={onPick} />
        {pin && <Marker position={[pin.lat, pin.lng]} icon={pinIcon} />}
      </MapContainer>
    </div>
    <CoordinateEntry onPick={onPick} />
  </div>
);

export default MapPinPicker;
