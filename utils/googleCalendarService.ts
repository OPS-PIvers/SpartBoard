import { CalendarEvent } from '../types';

const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_TIMEOUT = 10000;

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: {
    date?: string;
    dateTime?: string;
  };
}

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
    timeMax: string
  ): Promise<CalendarEvent[]> {
    const url = new URL(
      `${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events`
    );
    url.searchParams.append('timeMin', timeMin);
    url.searchParams.append('timeMax', timeMax);
    url.searchParams.append('singleEvents', 'true');
    url.searchParams.append('orderBy', 'startTime');

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

    const data = (await response.json()) as { items?: GoogleCalendarEvent[] };
    const items = data.items ?? [];

    return items.map((item) => {
      // Use date for all-day events, otherwise use dateTime
      const startValue = item.start.date ?? item.start.dateTime ?? '';
      // Format to YYYY-MM-DD for consistency
      const dateOnly = startValue.split('T')[0];

      return {
        title: item.summary,
        date: dateOnly,
      };
    });
  }
}
