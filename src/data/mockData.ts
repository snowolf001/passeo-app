import {
  User,
  Club,
  ClubLocation,
  ClubSettings,
  Membership,
  Session,
  Attendance,
  CreditTransaction,
  ClubSubscription,
} from '../types';

// ────────────────────────────────────────────────────────────
// Current user – the person using this device in MVP
// ────────────────────────────────────────────────────────────
export const CURRENT_USER_ID = 'u2';

// ────────────────────────────────────────────────────────────
// Users
// ────────────────────────────────────────────────────────────
let users: User[] = [
  {id: 'u1', name: 'Jordan Host'},
  {id: 'u2', name: 'Alex Owner'},
  {id: 'u3', name: 'Sam Walker'},
  {id: 'u4', name: 'Morgan Lee'},
  {id: 'u5', name: 'Casey Chen'},
  {id: 'u6', name: 'Riley Park'},
  {id: 'u7', name: 'Drew Santos'},
];

// ────────────────────────────────────────────────────────────
// Club
// ────────────────────────────────────────────────────────────
let clubs: Club[] = [
  {
    id: 'c1',
    name: 'Iron Club',
    joinCode: 'IRON2024',
    createdBy: 'u2',
    settings: {
      allowMemberBackfill: true,
      memberBackfillHours: 24,
      hostBackfillHours: 72,
    },
  },
];

// ────────────────────────────────────────────────────────────
// Locations
// ────────────────────────────────────────────────────────────
let locations: ClubLocation[] = [
  {
    id: 'l1',
    clubId: 'c1',
    name: 'Main Studio',
    address: '123 Fitness Ave, Suite 10, New York, NY 10001',
  },
  {
    id: 'l2',
    clubId: 'c1',
    name: 'Outdoor Terrace',
    address: '456 Park Blvd, Rooftop Level, New York, NY 10002',
  },
];

// ────────────────────────────────────────────────────────────
// Memberships  (m1 = current user = host with 8 credits)
// ────────────────────────────────────────────────────────────
let memberships: Membership[] = [
  {
    id: 'm1',
    userId: 'u1',
    clubId: 'c1',
    role: 'host',
    credits: 8,
    recoveryCode: 'RC-HOST-001',
    memberCode: 'MC-0001',
  },
  {
    id: 'm2',
    userId: 'u2',
    clubId: 'c1',
    role: 'owner',
    credits: 99,
    recoveryCode: 'RC-OWN-002',
    memberCode: 'MC-0002',
  },
  {
    id: 'm3',
    userId: 'u3',
    clubId: 'c1',
    role: 'member',
    credits: 5,
    recoveryCode: 'RC-MEM-003',
    memberCode: 'MC-0003',
  },
  {
    id: 'm4',
    userId: 'u4',
    clubId: 'c1',
    role: 'member',
    credits: 1,
    recoveryCode: 'RC-MEM-004',
    memberCode: 'MC-0004',
  },
  {
    id: 'm5',
    userId: 'u5',
    clubId: 'c1',
    role: 'member',
    credits: 0,
    recoveryCode: 'RC-MEM-005',
    memberCode: 'MC-0005',
  },
  {
    id: 'm6',
    userId: 'u6',
    clubId: 'c1',
    role: 'member',
    credits: 12,
    recoveryCode: 'RC-MEM-006',
    memberCode: 'MC-0006',
  },
  {
    id: 'm7',
    userId: 'u7',
    clubId: 'c1',
    role: 'admin',
    credits: 20,
    recoveryCode: 'RC-ADM-007',
    memberCode: 'MC-0007',
  },
];

// ────────────────────────────────────────────────────────────
// Sessions
// Includes:
// - upcoming
// - ended 2 hours ago
// - ended 30 hours ago
// - ended 96 hours ago
// for backfill testing
// ────────────────────────────────────────────────────────────
const now = new Date();

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

const today = (hour: number) => {
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const daysFromNow = (days: number, hour: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const offset = (ms: number) => new Date(Date.now() + ms).toISOString();

let sessions: Session[] = [
  {
    id: 's1',
    clubId: 'c1',
    title: 'Morning HIIT',
    startTime: today(7),
    endTime: today(8),
    locationId: 'l1',
    capacity: 15,
    createdBy: 'm1',
  },
  {
    id: 's2',
    clubId: 'c1',
    title: 'Yoga Flow',
    startTime: daysFromNow(1, 9),
    endTime: daysFromNow(1, 10),
    locationId: 'l2',
    capacity: 12,
    createdBy: 'm2',
  },
  {
    id: 's3',
    clubId: 'c1',
    title: 'Strength & Conditioning',
    startTime: daysFromNow(2, 18),
    endTime: daysFromNow(2, 19),
    locationId: 'l1',
    capacity: 20,
    createdBy: 'm7',
  },
  {
    id: 's4',
    clubId: 'c1',
    title: 'Evening Pilates',
    startTime: daysFromNow(3, 19),
    locationId: 'l2',
    createdBy: 'm1',
  },
  {
    id: 's5',
    clubId: 'c1',
    title: 'Bootcamp',
    startTime: daysFromNow(5, 6),
    endTime: daysFromNow(5, 7),
    locationId: 'l1',
    capacity: 10,
    createdBy: 'm7',
  },
  {
    id: 's6',
    clubId: 'c1',
    title: 'Past Bootcamp',
    startTime: daysFromNow(-1, 6),
    endTime: daysFromNow(-1, 7),
    locationId: 'l1',
    capacity: 10,
    createdBy: 'm7',
  },
  {
    id: 's7',
    clubId: 'c1',
    title: 'Backfill Test - 2h Ago (Member Allowed)',
    startTime: offset(-(2 * HOUR + 60 * MIN)),
    endTime: offset(-2 * HOUR),
    locationId: 'l1',
    capacity: 10,
    createdBy: 'm1',
  },
  {
    id: 's8',
    clubId: 'c1',
    title: 'Backfill Test - 30h Ago (Host/Admin Only)',
    startTime: offset(-(30 * HOUR + 60 * MIN)),
    endTime: offset(-30 * HOUR),
    locationId: 'l1',
    capacity: 10,
    createdBy: 'm7',
  },
  {
    id: 's9',
    clubId: 'c1',
    title: 'Backfill Test - 96h Ago (Expired)',
    startTime: offset(-(96 * HOUR + 60 * MIN)),
    endTime: offset(-96 * HOUR),
    locationId: 'l2',
    capacity: 10,
    createdBy: 'm7',
  },
];

// ────────────────────────────────────────────────────────────
// Attendances
// Keep s7 / s8 / s9 without attendances so backfill can be tested
// ────────────────────────────────────────────────────────────
let attendances: Attendance[] = [
  {
    id: 'a1',
    sessionId: 's1',
    membershipId: 'm3',
    checkedInAt: today(6),
    creditsUsed: 1,
  },
  {
    id: 'a2',
    sessionId: 's1',
    membershipId: 'm4',
    checkedInAt: today(6),
    creditsUsed: 1,
  },
];

// ────────────────────────────────────────────────────────────
// Credit Transactions
// Seed balance sync transactions ensure:
//   currentCredits == totalAdded - totalUsed for every member
// ────────────────────────────────────────────────────────────
let creditTransactions: CreditTransaction[] = [
  // ── Seed balance sync entries ───────────────────────────
  // m1: credits=8, no prior txns → add +8
  {
    id: 'ct_seed_m1',
    membershipId: 'm1',
    amount: 8,
    reason: 'Seed balance sync',
    createdAt: daysFromNow(-60, 9),
  },
  // m2: credits=99, no prior txns → add +99
  {
    id: 'ct_seed_m2',
    membershipId: 'm2',
    amount: 99,
    reason: 'Seed balance sync',
    createdAt: daysFromNow(-60, 9),
  },
  // m3: credits=5, has -1 check-in → implied=-1, need +6
  {
    id: 'ct_seed_m3',
    membershipId: 'm3',
    amount: 6,
    reason: 'Seed balance sync',
    createdAt: daysFromNow(-60, 9),
  },
  // m4: credits=1, has -1 check-in → implied=-1, need +2
  {
    id: 'ct_seed_m4',
    membershipId: 'm4',
    amount: 2,
    reason: 'Seed balance sync',
    createdAt: daysFromNow(-60, 9),
  },
  // m5: credits=0, no prior txns → already balanced, no entry needed
  // m6: credits=12, no prior txns → add +12
  {
    id: 'ct_seed_m6',
    membershipId: 'm6',
    amount: 12,
    reason: 'Seed balance sync',
    createdAt: daysFromNow(-60, 9),
  },
  // m7: credits=20, no prior txns → add +20
  {
    id: 'ct_seed_m7',
    membershipId: 'm7',
    amount: 20,
    reason: 'Seed balance sync',
    createdAt: daysFromNow(-60, 9),
  },
  // ── Check-in deductions ─────────────────────────────────
  {
    id: 'ct1',
    membershipId: 'm3',
    amount: -1,
    reason: 'Session check-in',
    sessionId: 's1',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'ct2',
    membershipId: 'm4',
    amount: -1,
    reason: 'Session check-in',
    sessionId: 's1',
    createdAt: new Date().toISOString(),
  },
];

// ────────────────────────────────────────────────────────────
// Club Subscription
// ────────────────────────────────────────────────────────────
const clubSubscriptions: ClubSubscription[] = [
  {
    clubId: 'c1',
    plan: 'monthly',
    expiresAt: daysFromNow(22, 0),
    paidByUserId: 'u2',
  },
];

// ────────────────────────────────────────────────────────────
// Mutable store accessors (services mutate these in-memory)
// ────────────────────────────────────────────────────────────
export const db = {
  getUsers: () => users,
  getClubs: () => clubs,
  getLocations: () => locations,
  getMemberships: () => memberships,
  getSessions: () => sessions,
  getAttendances: () => attendances,
  getCreditTransactions: () => creditTransactions,
  getClubSubscriptions: () => clubSubscriptions,

  addMembership: (m: Membership) => {
    memberships = [...memberships, m];
  },
  addClub: (c: Club) => {
    clubs = [...clubs, c];
  },
  addLocation: (l: ClubLocation) => {
    locations = [...locations, l];
  },
  addSession: (s: Session) => {
    sessions = [...sessions, s];
  },
  addAttendance: (a: Attendance) => {
    attendances = [...attendances, a];
  },
  addCreditTransaction: (ct: CreditTransaction) => {
    creditTransactions = [...creditTransactions, ct];
  },

  updateMembership: (updated: Membership) => {
    memberships = memberships.map(m => (m.id === updated.id ? updated : m));
  },
  updateClub: (updated: Club) => {
    clubs = clubs.map(c => (c.id === updated.id ? updated : c));
  },
  updateClubSettings: (clubId: string, settings: ClubSettings) => {
    clubs = clubs.map(c => (c.id === clubId ? {...c, settings} : c));
  },
};
