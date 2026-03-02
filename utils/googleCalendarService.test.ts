import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { GoogleCalendarService } from './googleCalendarService';

describe('GoogleCalendarService', () => {
  const mockToken = 'test-token';
  let service: GoogleCalendarService;

  beforeEach(() => {
    service = new GoogleCalendarService(mockToken);
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('fetches events and formats them correctly', async () => {
    const mockEvents = {
      items: [
        {
          id: '1',
          summary: 'All Day Event',
          start: { date: '2026-03-01' },
        },
        {
          id: '2',
          summary: 'Timed Event',
          start: { dateTime: '2026-03-02T10:00:00Z' },
        },
      ],
    };

    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEvents),
    });

    const events = await service.getEvents(
      'test-cal',
      '2026-03-01T00:00:00Z',
      '2026-03-31T00:00:00Z'
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ title: 'All Day Event', date: '2026-03-01' });
    expect(events[1]).toEqual({ title: 'Timed Event', date: '2026-03-02' });
  });

  it('handles API errors gracefully by throwing', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(
      service.getEvents(
        'invalid-cal',
        '2026-03-01T00:00:00Z',
        '2026-03-31T00:00:00Z'
      )
    ).rejects.toThrow('Calendar API Error: Not Found');
  });
});
