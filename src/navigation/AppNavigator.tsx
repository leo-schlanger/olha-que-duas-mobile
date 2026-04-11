import React from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  LinkingOptions,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Linking from 'expo-linking';
import { ScreenErrorBoundary } from '../components/ScreenErrorBoundary';

// Navigation ref for use outside of React components (e.g., notification handlers)
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate(name: keyof RootStackParamList, params?: object) {
  if (navigationRef.isReady()) {
    // @ts-expect-error - navigation params are dynamic
    navigationRef.navigate(name, params);
  }
}

export function navigateToTab(tabName: keyof MainTabParamList) {
  if (navigationRef.isReady()) {
    // @ts-expect-error - navigation params are dynamic
    navigationRef.navigate('MainTabs', { screen: tabName });
  }
}

import { RadioScreen } from '../screens/RadioScreen';
import { NewsScreen } from '../screens/NewsScreen';
import { NewsDetailScreen } from '../screens/NewsDetailScreen';
import { WeatherScreen } from '../screens/WeatherScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

// Wrap screens in ScreenErrorBoundary for per-screen error isolation
const SafeRadioScreen = () => (
  <ScreenErrorBoundary>
    <RadioScreen />
  </ScreenErrorBoundary>
);
const SafeNewsScreen = () => (
  <ScreenErrorBoundary>
    <NewsScreen />
  </ScreenErrorBoundary>
);
const SafeWeatherScreen = () => (
  <ScreenErrorBoundary>
    <WeatherScreen />
  </ScreenErrorBoundary>
);
const SafeSettingsScreen = () => (
  <ScreenErrorBoundary>
    <SettingsScreen />
  </ScreenErrorBoundary>
);
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

// Deep linking configuration
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    Linking.createURL('/'),
    'https://www.olhaqueduas.com',
    'https://olhaqueduas.com',
    'olhaqueduas://',
  ],
  config: {
    screens: {
      NewsDetail: 'noticias/:slug',
      MainTabs: {
        screens: {
          Radio: { path: '', exact: true },
          News: 'noticias',
          Weather: 'clima',
          Settings: 'definicoes',
        },
      },
    },
  },
};

export type RootStackParamList = {
  MainTabs: undefined;
  NewsDetail: { slug: string };
};

export type MainTabParamList = {
  Radio: undefined;
  News: undefined;
  Weather: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.muted,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Radio"
        component={SafeRadioScreen}
        options={{
          tabBarLabel: t('tabs.radio'),
          tabBarAccessibilityLabel: t('tabs.radioA11y'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="radio" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="News"
        component={SafeNewsScreen}
        options={{
          tabBarLabel: t('tabs.news'),
          tabBarAccessibilityLabel: t('tabs.newsA11y'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="newspaper-variant-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Weather"
        component={SafeWeatherScreen}
        options={{
          tabBarLabel: t('tabs.weather'),
          tabBarAccessibilityLabel: t('tabs.weatherA11y'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="weather-partly-cloudy" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SafeSettingsScreen}
        options={{
          tabBarLabel: t('tabs.settings'),
          tabBarAccessibilityLabel: t('tabs.settingsA11y'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { colors, isDark } = useTheme();

  const navigationTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.card,
          text: colors.text,
          border: colors.border,
          notification: colors.notification,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.card,
          text: colors.text,
          border: colors.border,
          notification: colors.notification,
        },
      };

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme} linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen
          name="NewsDetail"
          component={NewsDetailScreen}
          options={{
            animation: 'slide_from_right',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
