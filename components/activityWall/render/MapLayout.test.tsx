import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeSession, makeSubmission } from './fixtures';

vi.mock('@/config/firebase', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(() =>
    Promise.resolve('https://storage.test/photo.png')
  ),
  ref: (_storage: unknown, path: string) => path,
}));

// Leaflet needs a real layout engine; the map shell is stubbed so the test
// asserts what the layout passes to it (center, tiles, one marker per pin).
vi.mock('leaflet', () => ({ divIcon: () => ({}) }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({
    center,
    zoom,
    children,
  }: {
    center: [number, number];
    zoom: number;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="map-container"
      data-center={center.join(',')}
      data-zoom={zoom}
    >
      {children}
    </div>
  ),
  TileLayer: ({ attribution }: { attribution: string }) => (
    <div data-testid="tile-layer">{attribution}</div>
  ),
  Marker: ({
    position,
    children,
  }: {
    position: [number, number];
    children: React.ReactNode;
  }) => (
    <div data-testid="marker" data-position={position.join(',')}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { MapLayout } = await import('./MapLayout');

describe('MapLayout', () => {
  it('renders OSM tiles and one marker per located submission', () => {
    render(
      <MapLayout
        session={makeSession({
          layout: 'map',
          mapCenter: { lat: 45, lng: -93, zoom: 6 },
        })}
        mode="gallery"
        showNames={false}
        submissions={[
          makeSubmission({
            id: 'a',
            content: 'my town',
            lat: 45.1,
            lng: -93.2,
          }),
          makeSubmission({ id: 'b', content: 'no pin' }),
          makeSubmission({
            id: 'c',
            content: 'hidden',
            status: 'pending',
            lat: 1,
            lng: 1,
          }),
        ]}
      />
    );
    expect(screen.getByTestId('map-container')).toHaveAttribute(
      'data-center',
      '45,-93'
    );
    expect(screen.getByTestId('tile-layer')).toHaveTextContent(
      'OpenStreetMap contributors'
    );
    const markers = screen.getAllByTestId('marker');
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveAttribute('data-position', '45.1,-93.2');
    expect(screen.getByText('my town')).toBeInTheDocument();
  });
});
