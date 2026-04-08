// src/config/api.ts

// Temporary MVP protection for closed testing.
// Replace with proper auth when user accounts are introduced.

export const API_BASE_URL =
  'https://club-app-backend-production.up.railway.app';

// Android emulator:
// http://10.0.2.2:3000
//
// iOS simulator:
// http://localhost:3000
//
// Physical device:
// use your computer LAN IP, e.g.
// http://192.168.1.100:3000

// Shared API key sent on every backend request as x-api-key.
// Must match the API_KEY environment variable on the backend.
export const API_KEY = '3666B63B-7217-452E-AA3A-DA572A646CEA';

export function getApiHeaders(): Record<string, string> {
  return {'x-api-key': API_KEY};
}
