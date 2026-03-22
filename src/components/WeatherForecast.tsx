/**
 * Weather forecast components for hourly and daily forecasts
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../context/ThemeContext';
import { HourlyForecast, DailyForecast, getWeatherIcon } from '../types/weather';

interface HourlyForecastSectionProps {
  hourly: HourlyForecast[];
}

interface DailyForecastSectionProps {
  daily: DailyForecast[];
}

/**
 * Format time from ISO string to "HH:mm"
 */
function formatHour(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format date from ISO string to weekday name
 */
function formatWeekday(isoString: string): string {
  const date = new Date(isoString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Hoje';
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Amanhã';
  }

  return date.toLocaleDateString('pt-PT', { weekday: 'short' });
}

/**
 * Check if a given time is during the day (rough approximation)
 */
function isDayTime(isoString: string): boolean {
  const hour = new Date(isoString).getHours();
  return hour >= 7 && hour < 20;
}

export function HourlyForecastSection({ hourly }: HourlyForecastSectionProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Previsão Horária
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hourlyScrollContent}
      >
        {hourly.map((item, index) => {
          const iconName = getWeatherIcon(item.weatherCode, isDayTime(item.time));
          return (
            <View key={index} style={styles.hourlyItem}>
              <Text style={[styles.hourlyTime, { color: colors.textSecondary }]}>
                {index === 0 ? 'Agora' : formatHour(item.time)}
              </Text>
              <MaterialCommunityIcons
                name={iconName as any}
                size={28}
                color={colors.secondary}
              />
              <Text style={[styles.hourlyTemp, { color: colors.text }]}>
                {item.temperature}°
              </Text>
              {item.precipitationProbability > 0 && (
                <Text style={[styles.hourlyPrecip, { color: colors.primary }]}>
                  {item.precipitationProbability}%
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function DailyForecastSection({ daily }: DailyForecastSectionProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Previsão Semanal
      </Text>
      {daily.map((item, index) => {
        const iconName = getWeatherIcon(item.weatherCode, true);
        return (
          <View
            key={index}
            style={[
              styles.dailyItem,
              index < daily.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.dailyDay, { color: colors.text }]}>
              {formatWeekday(item.date)}
            </Text>

            <View style={styles.dailyIconContainer}>
              <MaterialCommunityIcons
                name={iconName as any}
                size={28}
                color={colors.secondary}
              />
              {item.precipitationSum > 0 && (
                <Text style={[styles.dailyPrecip, { color: colors.primary }]}>
                  {item.precipitationSum.toFixed(1)} mm
                </Text>
              )}
            </View>

            <View style={styles.dailyTemps}>
              <Text style={[styles.dailyTempMax, { color: colors.text }]}>
                {item.temperatureMax}°
              </Text>
              <Text style={[styles.dailyTempMin, { color: colors.textSecondary }]}>
                {item.temperatureMin}°
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  // Hourly styles
  hourlyScrollContent: {
    paddingRight: 8,
  },
  hourlyItem: {
    alignItems: 'center',
    marginRight: 16,
    minWidth: 56,
  },
  hourlyTime: {
    fontSize: 12,
    marginBottom: 8,
  },
  hourlyTemp: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  hourlyPrecip: {
    fontSize: 11,
    marginTop: 2,
  },
  // Daily styles
  dailyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  dailyDay: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  dailyIconContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyPrecip: {
    fontSize: 12,
    marginLeft: 4,
  },
  dailyTemps: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 70,
    justifyContent: 'flex-end',
  },
  dailyTempMax: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  dailyTempMin: {
    fontSize: 16,
  },
});
