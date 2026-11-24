export interface StudentTime {
  from: number;
  until: number;
}

/** "Nov 26, 9:00 AM", the start of a set time on a roster row. */
export function formatStudentTimeStart(from: number): string {
  const d = new Date(from);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/** "Thu, Nov 26, 9:00 AM to 10:00 AM" for a time set for one student. */
export function formatStudentTime(time: StudentTime): string {
  const from = new Date(time.from);
  const until = new Date(time.until);
  const day = (d: Date) =>
    d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  const clock = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const sameDay = day(from) === day(until);
  return `${day(from)}, ${clock(from)} to ${sameDay ? '' : `${day(until)}, `}${clock(until)}`;
}
