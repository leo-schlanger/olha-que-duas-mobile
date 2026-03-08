import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const STORAGE_KEY = '@olhaqueduas:theme_preference';

export type ThemeMode = 'light' | 'dark' | 'system';

// Light theme colors
export const lightColors = {
  primary: '#d6402e', // Vermelho
  secondary: '#f0c042', // Amarelo/Gold
  background: '#f7f4ed', // Beige Light
  backgroundCard: '#faf8f2', // Cream
  card: '#faf8f2', // Cream
  text: '#6e5a4a', // Charcoal / Foreground
  textSecondary: '#8b7e74', // Softer Charcoal
  success: '#22c55e',
  error: '#ef4444',
  charcoal: '#6e5a4a',
  amarelo: '#f0c042',
  amareloSoft: '#f7d98d',
  vermelho: '#d6402e',
  vermelhoSoft: '#e47163',
  beige: '#f7f4ed',
  beigeDark: '#6e5a4a',
  white: '#FFFFFF',
  black: '#000000',
  muted: '#e0d1bc',
  border: '#e0d1bc',
  notification: '#d6402e',
  tabBar: '#faf8f2',
  tabBarInactive: '#8b7e74',
  statusBar: 'dark-content' as 'dark-content' | 'light-content',
};

// Dark theme colors
export const darkColors = {
  primary: '#e85544', // Vermelho mais claro para contraste
  secondary: '#f5c94d', // Amarelo mais vibrante
  background: '#1a1614', // Marrom escuro
  backgroundCard: '#252220', // Marrom escuro mais claro
  card: '#2d2926', // Card escuro
  text: '#f0e8e0', // Texto claro
  textSecondary: '#a89e96', // Texto secundário
  success: '#34d668',
  error: '#f05050',
  charcoal: '#f0e8e0',
  amarelo: '#f5c94d',
  amareloSoft: '#c9a43a',
  vermelho: '#e85544',
  vermelhoSoft: '#c94a3a',
  beige: '#1a1614',
  beigeDark: '#f0e8e0',
  white: '#FFFFFF',
  black: '#000000',
  muted: '#3d3835',
  border: '#3d3835',
  notification: '#e85544',
  tabBar: '#252220',
  tabBarInactive: '#6d6560',
  statusBar: 'light-content' as 'dark-content' | 'light-content',
};

export type ThemeColors = typeof lightColors;

interface ThemeContextType {
  colors: ThemeColors;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved theme preference
  useEffect(() => {
    async function loadTheme() {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved && ['light', 'dark', 'system'].includes(saved)) {
          setThemeModeState(saved as ThemeMode);
        }
      } catch (error) {
        logger.error('Error loading theme preference:', error);
      }
      setIsLoaded(true);
    }
    loadTheme();
  }, []);

  // Save theme preference
  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      logger.error('Error saving theme preference:', error);
    }
  };

  // Determine if dark mode should be used
  const isDark =
    themeMode === 'dark' || (themeMode === 'system' && systemColorScheme === 'dark');

  const colors = isDark ? darkColors : lightColors;

  // Don't render until theme is loaded to avoid flash
  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ colors, isDark, themeMode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Helper hook to get just colors (backward compatible)
export function useColors() {
  const { colors } = useTheme();
  return colors;
}
