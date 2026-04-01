export const colors = {
  // Dark theme (default)
  dark: {
    background: '#0B0F17',
    surface: '#111827',
    card: '#0F172A',
    border: '#243044',

    text: '#E5E7EB',
    textMuted: '#9CA3AF',

    primary: '#60A5FA',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',

    surfaceRaised: '#1E293B', // slightly lighter than card
    overlay: 'rgba(0,0,0,0.6)',
  },

  // Light theme (optional for later)
  light: {
    background: '#FFFFFF',
    surface: '#F3F4F6',
    card: '#FFFFFF',
    border: '#E5E7EB',

    text: '#111827',
    textMuted: '#6B7280',

    primary: '#2563EB',
    success: '#059669',
    warning: '#D97706',
    danger: '#DC2626',

    surfaceRaised: '#E5E7EB', // slightly darker than card
    overlay: 'rgba(0,0,0,0.4)',
  },
} as const;

export type ThemeName = keyof typeof colors;
export type ThemeColors = (typeof colors)[ThemeName];
