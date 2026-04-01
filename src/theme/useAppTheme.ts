import {useColorScheme} from 'react-native';
import {colors, type ThemeName} from './colors';
import {makeNavigationTheme} from './theme';

export const useAppTheme = () => {
  const scheme = useColorScheme(); // 'dark' | 'light' | null
  const mode: ThemeName = scheme === 'light' ? 'light' : 'dark';

  return {
    mode,
    colors: colors[mode],
    navTheme: makeNavigationTheme(mode),
  };
};
