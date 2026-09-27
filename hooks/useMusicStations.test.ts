import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import { useMusicStations } from './useMusicStations';
import { useAuth } from '@/context/useAuth';
import { MusicStation } from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Stations used across tests
const stationAll: MusicStation = {
  id: 'station-all',
  title: 'All Schools Radio',
  channel: 'AllFM',
  url: 'https://youtube.com/watch?v=abc',
  thumbnail: '',
  color: '#fff',
  isActive: true,
  order: 1,
  // No buildingIds → visible to everyone
};

const stationBuilding1: MusicStation = {
  id: 'station-b1',
  title: 'Building 1 Radio',
  channel: 'B1FM',
  url: 'https://youtube.com/watch?v=def',
  thumbnail: '',
  color: '#fff',
  isActive: true,
  order: 2,
  buildingIds: ['building-1'],
};

const stationBuilding2: MusicStation = {
  id: 'station-b2',
  title: 'Building 2 Radio',
  channel: 'B2FM',
  url: 'https://youtube.com/watch?v=ghi',
  thumbnail: '',
  color: '#fff',
  isActive: true,
  order: 3,
  buildingIds: ['building-2'],
};

const stationBothBuildings: MusicStation = {
  id: 'station-b1b2',
  title: 'Multi-Building Radio',
  channel: 'MultiFM',
  url: 'https://youtube.com/watch?v=jkl',
  thumbnail: '',
  color: '#fff',
  isActive: true,
  order: 4,
  buildingIds: ['building-1', 'building-2'],
};

const stationEmptyBuildingIds: MusicStation = {
  id: 'station-empty',
  title: 'Empty Buildings Radio',
  channel: 'EmptyFM',
  url: 'https://youtube.com/watch?v=mno',
  thumbnail: '',
  color: '#fff',
  isActive: true,
  order: 5,
  buildingIds: [],
};

// Stored with the pre-rename legacy long-form id, as an older/unresaved doc would have.
const stationLegacyBuildingId: MusicStation = {
  id: 'station-legacy',
  title: 'Legacy High School Radio',
  channel: 'LegacyFM',
  url: 'https://youtube.com/watch?v=pqr',
  thumbnail: '',
  color: '#fff',
  isActive: true,
  order: 6,
  buildingIds: ['orono-high-school'],
};

type SnapshotCallback = (snap: {
  exists: () => boolean;
  data: () => { stations?: MusicStation[] };
}) => void;

const allStations = [
  stationAll,
  stationBuilding1,
  stationBuilding2,
  stationBothBuildings,
  stationEmptyBuildingIds,
];

function setupMocks(
  selectedBuildings: string[],
  stations: MusicStation[] = allStations
) {
  (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    selectedBuildings,
  });

  (
    firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>
  ).mockImplementation((_, cb: SnapshotCallback) => {
    cb({
      exists: () => true,
      data: () => ({ stations }),
    });
    return vi.fn(); // unsubscribe
  });

  (firestore.doc as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});
}

describe('useMusicStations – building filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all active stations when no buildings are selected', () => {
    setupMocks([]);
    const { result } = renderHook(() => useMusicStations());
    const ids = result.current.stations.map((s) => s.id);
    expect(ids).toContain('station-all');
    expect(ids).toContain('station-b1');
    expect(ids).toContain('station-b2');
    expect(ids).toContain('station-b1b2');
    expect(ids).toContain('station-empty');
  });

  it('returns only matching stations when buildings are selected', () => {
    setupMocks(['building-1']);
    const { result } = renderHook(() => useMusicStations());
    const ids = result.current.stations.map((s) => s.id);
    // No buildingIds restriction → always visible
    expect(ids).toContain('station-all');
    // Matches building-1
    expect(ids).toContain('station-b1');
    // Matches building-1 as well
    expect(ids).toContain('station-b1b2');
    // building-2 only — should be filtered out
    expect(ids).not.toContain('station-b2');
  });

  it('handles stations with an empty buildingIds array as visible to all', () => {
    setupMocks(['building-1']);
    const { result } = renderHook(() => useMusicStations());
    const ids = result.current.stations.map((s) => s.id);
    // Empty array means "no restriction"
    expect(ids).toContain('station-empty');
  });

  it('handles stations with no buildingIds field as visible to all', () => {
    setupMocks(['building-2']);
    const { result } = renderHook(() => useMusicStations());
    const ids = result.current.stations.map((s) => s.id);
    expect(ids).toContain('station-all');
  });

  it('matches a station stored with a legacy long-form building id against the canonical selection', () => {
    setupMocks(['high'], [stationLegacyBuildingId]);
    const { result } = renderHook(() => useMusicStations());
    const ids = result.current.stations.map((s) => s.id);
    // 'orono-high-school' and 'high' are the same building; canonicalizing must match them.
    expect(ids).toContain('station-legacy');
  });

  it('returns no building-restricted stations when none match selected buildings', () => {
    setupMocks(['building-99']);
    const { result } = renderHook(() => useMusicStations());
    const ids = result.current.stations.map((s) => s.id);
    expect(ids).not.toContain('station-b1');
    expect(ids).not.toContain('station-b2');
    expect(ids).not.toContain('station-b1b2');
    // Unrestricted stations still appear
    expect(ids).toContain('station-all');
    expect(ids).toContain('station-empty');
  });
});
