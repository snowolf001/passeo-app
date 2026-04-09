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
    background: '#F5F5F7',
    surface: '#F2F2F7',
    card: '#FFFFFF',
    border: '#E5E5EA',

    text: '#1C1C1E',
    textMuted: '#8E8E93',

    primary: '#007AFF',
    success: '#34C759',
    warning: '#FF9500',
    danger: '#FF3B30',

    surfaceRaised: '#F2F2F7', // inputs, chips, pills
    overlay: 'rgba(0,0,0,0.4)',
  },
} as const;

export type ThemeName = keyof typeof colors;
export type ThemeColors = (typeof colors)[ThemeName];
