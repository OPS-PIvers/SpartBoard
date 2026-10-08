import { CalendarEvent } from '@/types';

const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_TIMEOUT = 10000;
const MAX_PAGES = 10;

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: {
    date?: string;
    dateTime?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
  };
  location?: string;
  description?: string;
}

const formatClockTime = (dateTime: string | undefined) => {
  if (!dateTime) return undefined;
  const dateObj = new Date(dateTime);
  if (isNaN(dateObj.getTime())) return undefined;
  return dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

// Google returns event descriptions as HTML; the details modal shows plain text.
export const stripHtml = (html: string): string => {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
};

export interface CalendarApiError extends Error {
  status?: number;
}

export class GoogleCalendarService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  }

  /**
   * Fetch events for a specific calendar ID within a date range.
   */
  async getEvents(
    calendarId: string,
    timeMin: string,
    timeMax: string,
    { details = false }: { details?: boolean } = {}
  ): Promise<CalendarEvent[]> {
    const items: GoogleCalendarEvent[] = [];
    let calendarName: string | undefined;
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const url = new URL(
        `${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events`
      );
      url.searchParams.append('timeMin', timeMin);
      url.searchParams.append('timeMax', timeMax);
      url.searchParams.append('singleEvents', 'true');
      url.searchParams.append('orderBy', 'startTime');
      url.searchParams.append('maxResults', '250');
      if (pageToken) url.searchParams.append('pageToken', pageToken);

      const response = await this.fetchWithTimeout(url.toString(), {
        headers: this.headers,
      });

      if (!response.ok) {
        console.error(
          `Failed to fetch calendar ${calendarId}:`,
          response.statusText
        );
        const error = new Error(
          `Calendar API Error: ${response.statusText}`
        ) as CalendarApiError;
        error.status = response.status;
        throw error;
      }

      const data = (await response.json()) as {
        summary?: string;
        items?: GoogleCalendarEvent[];
        nextPageToken?: string;
      };
      calendarName ??= data.summary;
      items.push(...(data.items ?? []));
      pageToken = data.nextPageToken;
      pages += 1;
    } while (pageToken && pages < MAX_PAGES);

    return items.map((item) => {
      // Use date for all-day events, otherwise use dateTime
      const startValue = item.start.date ?? item.start.dateTime ?? '';
      // Format to YYYY-MM-DD for consistency
      const dateOnly = startValue.split('T')[0];

      const time = formatClockTime(item.start.dateTime);
      if (!details) {
        return {
          title: item.summary,
          date: dateOnly,
          ...(time ? { time } : {}),
        };
      }
      const endTime = formatClockTime(item.end?.dateTime);
      const description = item.description
        ? stripHtml(item.description)
        : undefined;
      return {
        title: item.summary,
        date: dateOnly,
        ...(time ? { time } : {}),
        ...(endTime ? { endTime } : {}),
        ...(item.location ? { location: item.location } : {}),
        ...(description ? { description } : {}),
        ...(calendarName ? { calendarName } : {}),
      };
    });
  }
}
