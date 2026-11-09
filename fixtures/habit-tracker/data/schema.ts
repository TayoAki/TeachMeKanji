export interface Habit {
  id: string;
  name: string;
  icon: string;
  goalPerWeek: number;
  createdAt: string;
}

export interface Checkin {
  id: string;
  habitId: string;
  /** ISO date (YYYY-MM-DD) */
  date: string;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoISO(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}
