/**
 * Main weather card component showing current conditions
 * Optimized with memoization
 */

import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { CurrentWeather, getWeatherDescription, getWeatherIcon } from '../types/weather';

interface WeatherCardProps {
  current: CurrentWeather;
}

export const WeatherCard = memo(function WeatherCard({ current }: WeatherCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  // Memoizar cálculos de ícone e descrição
  const iconName = useMemo(
    () => getWeatherIcon(current.weatherCode, current.isDay),
    [current.weatherCode, current.isDay]
  );

  const description = useMemo(
    () => getWeatherDescription(current.weatherCode),
    [current.weatherCode]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <View style={styles.mainRow}>
        <MaterialCommunityIcons
          name={iconName as keyof typeof MaterialCommunityIcons.glyphMap}
          size={80}
          color={colors.secondary}
        />
        <View style={styles.temperatureContainer}>
          <Text style={[styles.temperature, { color: colors.text }]}>{current.temperature}°</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
        </View>
      </View>

      <Text style={[styles.feelsLike, { color: colors.textSecondary }]}>
        {t('weather.feelsLike', { temp: current.apparentTemperature })}
      </Text>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <MaterialCommunityIcons name="water-percent" size={24} color={colors.primary} />
          <Text style={[styles.detailValue, { color: colors.text }]}>{current.humidity}%</Text>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
            {t('weather.humidity')}
          </Text>
        </View>

        <View style={styles.detailItem}>
          <MaterialCommunityIcons name="weather-windy" size={24} color={colors.primary} />
          <Text style={[styles.detailValue, { color: colors.text }]}>{current.windSpeed} km/h</Text>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
            {t('weather.wind')}
          </Text>
        </View>

        <View style={styles.detailItem}>
          <MaterialCommunityIcons name="water" size={24} color={colors.primary} />
          <Text style={[styles.detailValue, { color: colors.text }]}>
            {current.precipitation} mm
          </Text>
          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
            {t('weather.precipitation')}
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  temperatureContainer: {
    marginLeft: 16,
    alignItems: 'flex-start',
  },
  temperature: {
    fontSize: 64,
    fontWeight: 'bold',
    lineHeight: 72,
  },
  description: {
    fontSize: 18,
    marginTop: -4,
  },
  feelsLike: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    marginBottom: 16,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  detailItem: {
    alignItems: 'center',
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  detailLabel: {
    fontSize: 12,
    marginTop: 2,
  },
});
