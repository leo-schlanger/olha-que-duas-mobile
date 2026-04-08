/**
 * Weather forecast components for hourly and daily forecasts
 * Optimized with FlatList and memoization
 */

import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { useTheme, ThemeColors } from '../context/ThemeContext';
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
function formatHour(isoString: string, locale: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format date from ISO string to weekday name
 */
function formatWeekday(
  isoString: string,
  todayLabel: string,
  tomorrowLabel: string,
  locale: string
): string {
  const date = new Date(isoString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return todayLabel;
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return tomorrowLabel;
  }

  return date.toLocaleDateString(locale, { weekday: 'short' });
}

/**
 * Check if a given time is during the day (rough approximation)
 */
function isDayTime(isoString: string): boolean {
  const hour = new Date(isoString).getHours();
  return hour >= 7 && hour < 20;
}

// Memoized hourly item component
interface HourlyItemProps {
  item: HourlyForecast;
  index: number;
  colors: ThemeColors;
  nowLabel: string;
  locale: string;
}

const HourlyItem = memo(function HourlyItem({ item, index, colors, nowLabel, locale }: HourlyItemProps) {
  const iconName = useMemo(
    () => getWeatherIcon(item.weatherCode, isDayTime(item.time)),
    [item.weatherCode, item.time]
  );

  return (
    <View style={styles.hourlyItem}>
      <Text style={[styles.hourlyTime, { color: colors.textSecondary }]}>
        {index === 0 ? nowLabel : formatHour(item.time, locale)}
      </Text>
      <MaterialCommunityIcons
        name={iconName as keyof typeof MaterialCommunityIcons.glyphMap}
        size={28}
        color={colors.secondary}
      />
      <Text style={[styles.hourlyTemp, { color: colors.text }]}>{item.temperature}°</Text>
      {item.precipitationProbability > 0 && (
        <Text style={[styles.hourlyPrecip, { color: colors.primary }]}>
          {item.precipitationProbability}%
        </Text>
      )}
    </View>
  );
});

export const HourlyForecastSection = memo(function HourlyForecastSection({
  hourly,
}: HourlyForecastSectionProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const nowLabel = t('weather.now');
  const locale = i18n.language === 'en' ? 'en-US' : 'pt-PT';

  const renderItem = useCallback(
    ({ item, index }: { item: HourlyForecast; index: number }) => (
      <HourlyItem item={item} index={index} colors={colors} nowLabel={nowLabel} locale={locale} />
    ),
    [colors, nowLabel, locale]
  );

  const keyExtractor = useCallback((_item: HourlyForecast, index: number) => index.toString(), []);

  return (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {t('weather.hourlyForecast')}
      </Text>
      <FlatList
        data={hourly}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hourlyScrollContent}
        removeClippedSubviews={true}
        initialNumToRender={8}
        maxToRenderPerBatch={5}
        windowSize={3}
      />
    </View>
  );
});

// Memoized daily item component
interface DailyItemProps {
  item: DailyForecast;
  isLast: boolean;
  colors: ThemeColors;
  todayLabel: string;
  tomorrowLabel: string;
  locale: string;
}

const DailyItem = memo(function DailyItem({
  item,
  isLast,
  colors,
  todayLabel,
  tomorrowLabel,
  locale,
}: DailyItemProps) {
  const iconName = useMemo(() => getWeatherIcon(item.weatherCode, true), [item.weatherCode]);

  return (
    <View
      style={[
        styles.dailyItem,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
      ]}
    >
      <Text style={[styles.dailyDay, { color: colors.text }]}>
        {formatWeekday(item.date, todayLabel, tomorrowLabel, locale)}
      </Text>

      <View style={styles.dailyIconContainer}>
        <MaterialCommunityIcons
          name={iconName as keyof typeof MaterialCommunityIcons.glyphMap}
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
        <Text style={[styles.dailyTempMax, { color: colors.text }]}>{item.temperatureMax}°</Text>
        <Text style={[styles.dailyTempMin, { color: colors.textSecondary }]}>
          {item.temperatureMin}°
        </Text>
      </View>
    </View>
  );
});

export const DailyForecastSection = memo(function DailyForecastSection({
  daily,
}: DailyForecastSectionProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const todayLabel = t('weather.today');
  const tomorrowLabel = t('weather.tomorrow');
  const locale = i18n.language === 'en' ? 'en-US' : 'pt-PT';

  return (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        {t('weather.weeklyForecast')}
      </Text>
      {daily.map((item, index) => (
        <DailyItem
          key={index}
          item={item}
          isLast={index === daily.length - 1}
          colors={colors}
          todayLabel={todayLabel}
          tomorrowLabel={tomorrowLabel}
          locale={locale}
        />
      ))}
    </View>
  );
});

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
