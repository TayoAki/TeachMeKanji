import { daysAgoISO, type Checkin, type Habit } from "./schema";

const habits: Habit[] = [
  {
    id: "h1",
    name: "Drink water",
    icon: "water-outline",
    goalPerWeek: 7,
    createdAt: daysAgoISO(20),
  },
  {
    id: "h2",
    name: "Morning run",
    icon: "walk-outline",
    goalPerWeek: 4,
    createdAt: daysAgoISO(14),
  },
  {
    id: "h3",
    name: "Read 20 pages",
    icon: "book-outline",
    goalPerWeek: 5,
    createdAt: daysAgoISO(9),
  },
  { id: "h4", name: "Meditate", icon: "leaf-outline", goalPerWeek: 7, createdAt: daysAgoISO(3) },
];

const checkins: Checkin[] = [
  { id: "c1", habitId: "h1", date: daysAgoISO(0) },
  { id: "c2", habitId: "h1", date: daysAgoISO(1) },
  { id: "c3", habitId: "h1", date: daysAgoISO(2) },
  { id: "c4", habitId: "h2", date: daysAgoISO(1) },
  { id: "c5", habitId: "h2", date: daysAgoISO(3) },
  { id: "c6", habitId: "h3", date: daysAgoISO(0) },
  { id: "c7", habitId: "h3", date: daysAgoISO(2) },
  { id: "c8", habitId: "h4", date: daysAgoISO(1) },
];

export const seed = { habits, checkins };
