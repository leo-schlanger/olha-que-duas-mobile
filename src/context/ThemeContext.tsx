import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
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

// Dark theme colors - Otimizado para contraste e acessibilidade
// Seguindo boas práticas: evitar preto puro, cores levemente desaturadas
export const darkColors = {
  primary: '#ef6b5a', // Vermelho coral mais claro para melhor contraste
  secondary: '#f7d465', // Amarelo dourado vibrante mas não agressivo
  background: '#1c1917', // Cinza escuro quente (não preto puro - evita halation)
  backgroundCard: '#292524', // Elevação sutil sobre o fundo
  card: '#322f2d', // Card com mais elevação visual
  text: '#f5f0eb', // Texto principal - alto contraste mas suave
  textSecondary: '#a8a29e', // Texto secundário com bom contraste
  success: '#4ade80', // Verde mais vibrante para visibilidade
  error: '#f87171', // Vermelho suave para não agredir
  charcoal: '#f5f0eb',
  amarelo: '#f7d465',
  amareloSoft: '#d4a939',
  vermelho: '#ef6b5a',
  vermelhoSoft: '#dc5a4a',
  beige: '#1c1917',
  beigeDark: '#f5f0eb',
  white: '#FFFFFF',
  black: '#0c0a09', // Preto suave para uso em badges
  muted: '#44403c', // Mais claro para melhor visibilidade de bordas
  border: '#44403c',
  notification: '#ef6b5a',
  tabBar: '#292524',
  tabBarInactive: '#78716c', // Mais claro para melhor legibilidade
  statusBar: 'light-content' as 'dark-content' | 'light-content',
};

export type ThemeColors = typeof lightColors;

/**
 * Calcula a luminosidade relativa de uma cor hex
 * Retorna valor entre 0 (escuro) e 1 (claro)
 */
export function getLuminance(hexColor: string): number {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Determina a cor de texto ideal (branco ou escuro) baseado na cor de fundo
 * Usa WCAG para garantir contraste adequado
 */
export function getContrastTextColor(backgroundColor: string, lightText = '#FFFFFF', darkText = '#1c1917'): string {
  const luminance = getLuminance(backgroundColor);
  // Se a luminância for maior que 0.5, usar texto escuro; caso contrário, texto claro
  return luminance > 0.45 ? darkText : lightText;
}

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

  // Memoizar o value do context para evitar re-renders desnecessários
  const contextValue = useMemo(
    () => ({ colors, isDark, themeMode, setThemeMode }),
    [colors, isDark, themeMode]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
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
