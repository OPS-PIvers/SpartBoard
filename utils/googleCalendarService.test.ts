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
    expect(events[1]).toEqual({
      title: 'Timed Event',
      date: '2026-03-02',
      time: '10:00 AM',
    });
  });

  it('adds end time, location, plain-text description and calendar name on request', async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          summary: 'Room 118',
          items: [
            {
              id: '1',
              summary: 'PLC',
              start: { dateTime: '2026-03-02T10:30:00Z' },
              end: { dateTime: '2026-03-02T11:20:00Z' },
              location: 'Media Center',
              description: 'Bring <b>data</b><br>Agenda: norming',
            },
          ],
        }),
    });

    const [event] = await service.getEvents(
      'test-cal',
      '2026-03-01T00:00:00Z',
      '2026-03-31T00:00:00Z',
      { details: true }
    );

    expect(event).toEqual({
      title: 'PLC',
      date: '2026-03-02',
      time: '10:30 AM',
      endTime: '11:20 AM',
      location: 'Media Center',
      description: 'Bring data\nAgenda: norming',
      calendarName: 'Room 118',
    });
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

  it('follows nextPageToken so events past the first page are returned', async () => {
    (global.fetch as Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [{ id: '1', summary: 'A', start: { date: '2026-03-01' } }],
            nextPageToken: 'p2',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [{ id: '2', summary: 'B', start: { date: '2026-03-20' } }],
          }),
      });

    const events = await service.getEvents(
      'test-cal',
      '2026-03-01T00:00:00Z',
      '2026-03-31T00:00:00Z'
    );

    expect(events.map((e) => e.title)).toEqual(['A', 'B']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(String((global.fetch as Mock).mock.calls[1][0])).toContain(
      'pageToken=p2'
    );
  });
});
