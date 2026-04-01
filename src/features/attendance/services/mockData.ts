import {User, Session, Attendance} from '../models/types';

export const mockUsers: User[] = [
  {id: 'u1', name: 'Alice Admin', role: 'admin', remainingCredits: 999},
  {id: 'u2', name: 'Bob Host', role: 'host', remainingCredits: 999},
  {id: 'u3', name: 'Charlie Member', role: 'member', remainingCredits: 5},
  {id: 'u4', name: 'Diana Member', role: 'member', remainingCredits: 1},
  {id: 'u5', name: 'Ethan Member', role: 'member', remainingCredits: 0},
];

export const mockSessions: Session[] = [
  {
    id: 's1',
    title: 'Morning Yoga',
    startsAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    location: 'Studio A',
    capacity: 20,
  },
  {
    id: 's2',
    title: 'HIIT Bootcamp',
    startsAt: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
    location: 'Main Gym',
    capacity: 15,
  },
  {
    id: 's3',
    title: 'Evening Pilates',
    startsAt: new Date(Date.now() + 259200000).toISOString(), // 3 days from now
    location: 'Studio B',
  },
];

export const mockAttendances: Attendance[] = [];
