import { TZDate } from "@date-fns/tz";
import { addDays, endOfDay, startOfDay } from "date-fns";

export const TASK_VIEWS = ["mine", "overdue", "today", "upcoming", "completed"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export interface TaskWindows {
  now: Date;
  startOfToday: Date;
  endOfToday: Date;
  endOfUpcoming: Date;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Day boundaries in the user's time zone; "upcoming" covers the next seven days after today. */
export function taskWindows(now: Date, timeZone: string): TaskWindows {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const zonedNow = new TZDate(now.getTime(), zone);
  const start = startOfDay(zonedNow);
  const end = endOfDay(zonedNow);
  return {
    now,
    startOfToday: new Date(start.getTime()),
    endOfToday: new Date(end.getTime()),
    endOfUpcoming: new Date(endOfDay(addDays(zonedNow, 7)).getTime()),
  };
}

/** Converts a `datetime-local` value ("2026-10-14T09:30") in the user's zone to an instant. */
export function parseLocalDateTime(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return new Date(value);
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  return new Date(new TZDate(y, mo - 1, d, h, mi, zone).getTime());
}
