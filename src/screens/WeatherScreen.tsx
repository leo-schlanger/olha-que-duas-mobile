/**
 * Weather screen showing current conditions and forecasts
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from '../hooks/useLocation';
import { useWeather } from '../hooks/useWeather';
import { WeatherCard } from '../components/WeatherCard';
import { HourlyForecastSection, DailyForecastSection } from '../components/WeatherForecast';
import { BannerAd } from '../components/BannerAd';

export function WeatherScreen() {
  const { colors, isDark } = useTheme();
  const {
    location,
    isLoading: isLocationLoading,
    error: locationError,
    permissionStatus,
    isUsingDefaultLocation,
    requestPermission,
    refreshLocation,
  } = useLocation();

  const {
    weather,
    isLoading: isWeatherLoading,
    isRefreshing,
    error: weatherError,
    refresh: refreshWeather,
  } = useWeather(location);

  const handleRefresh = useCallback(async () => {
    await refreshLocation();
    await refreshWeather();
  }, [refreshLocation, refreshWeather]);

  const handleRetry = useCallback(async () => {
    if (permissionStatus === 'denied') {
      const granted = await requestPermission();
      if (!granted) {
        // Permission still denied - offer to open settings
        Alert.alert(
          'Permissão Necessária',
          'Para obter dados meteorológicos da sua localização, precisa permitir o acesso à localização nas definições do dispositivo.',
          [
            { text: 'Abrir Definições', onPress: () => Linking.openSettings() },
            { text: 'Usar Lisboa', style: 'cancel' }
          ]
        );
      }
    } else {
      await handleRefresh();
    }
  }, [permissionStatus, requestPermission, handleRefresh]);

  const isLoading = isLocationLoading || isWeatherLoading;
  const error = locationError || weatherError;

  // Loading state
  if (isLoading && !weather) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            A carregar dados meteorológicos...
          </Text>
        </View>
        <BannerAd />
      </SafeAreaView>
    );
  }

  // Error state
  if (error && !weather) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
        <View style={styles.centerContent}>
          <View style={[styles.messageCard, { backgroundColor: colors.card }]}>
            <MaterialCommunityIcons
              name="weather-cloudy-alert"
              size={64}
              color={colors.primary}
            />
            <Text style={[styles.messageTitle, { color: colors.text }]}>
              Erro ao Carregar
            </Text>
            <Text style={[styles.messageText, { color: colors.textSecondary }]}>
              {error}
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={handleRetry}
            >
              <Text style={styles.buttonText}>Tentar Novamente</Text>
            </TouchableOpacity>
          </View>
        </View>
        <BannerAd />
      </SafeAreaView>
    );
  }

  // Success state
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons
              name="map-marker"
              size={20}
              color={colors.textSecondary}
            />
            <Text style={[styles.headerText, { color: colors.textSecondary }]}>
              {isUsingDefaultLocation ? 'Lisboa (padrão)' : 'Localização atual'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: colors.card }]}
            onPress={handleRefresh}
            disabled={isRefreshing}
          >
            <MaterialCommunityIcons
              name="refresh"
              size={20}
              color={isRefreshing ? colors.textSecondary : colors.primary}
            />
          </TouchableOpacity>
        </View>

        {isUsingDefaultLocation && (
          <TouchableOpacity
            style={[styles.defaultLocationBanner, { backgroundColor: colors.primary + '15' }]}
            onPress={async () => {
              const granted = await requestPermission();
              if (!granted) {
                Alert.alert(
                  'Permissão Necessária',
                  'Para obter dados meteorológicos da sua localização, precisa permitir o acesso à localização nas definições do dispositivo.',
                  [
                    { text: 'Abrir Definições', onPress: () => Linking.openSettings() },
                    { text: 'Usar Lisboa', style: 'cancel' }
                  ]
                );
              }
            }}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="map-marker-alert"
              size={20}
              color={colors.primary}
            />
            <Text style={[styles.defaultLocationText, { color: colors.primary }]}>
              A mostrar dados de Lisboa. Toque para ativar a localização.
            </Text>
          </TouchableOpacity>
        )}

        {weather && (
          <>
            <WeatherCard current={weather.current} />
            <HourlyForecastSection hourly={weather.hourly} />
            <DailyForecastSection daily={weather.daily} />
          </>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
      <BannerAd />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 14,
    marginLeft: 6,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultLocationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    gap: 10,
  },
  defaultLocationText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  messageCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 320,
  },
  messageTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  messageText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 16,
  },
});
