import type {Theme} from '@react-navigation/native';
import {colors, type ThemeName} from './colors';

export const makeNavigationTheme = (mode: ThemeName): Theme => {
  const c = colors[mode];

  return {
    dark: mode === 'dark',
    colors: {
      primary: c.primary,
      background: c.background,
      card: c.card,
      text: c.text,
      border: c.border,
      notification: c.danger,
    },
  };
};
