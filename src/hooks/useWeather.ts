/**
 * Hook for fetching and managing weather data
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWeatherData } from '../services/weatherService';
import { WeatherData, LocationCoords } from '../types/weather';
import { logger } from '../utils/logger';

interface UseWeatherResult {
  weather: WeatherData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useWeather(location: LocationCoords | null): UseWeatherResult {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadWeather = useCallback(async (coords: LocationCoords, refreshing = false) => {
    try {
      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      // Force refresh bypasses cache
      const data = await fetchWeatherData(coords, refreshing);
      if (!mountedRef.current) return;
      setWeather(data);
    } catch (err) {
      logger.error('Error loading weather:', err);
      if (!mountedRef.current) return;
      setError('Erro ao carregar dados meteorológicos. Tente novamente.');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    if (location) {
      await loadWeather(location, true);
    }
  }, [location, loadWeather]);

  useEffect(() => {
    if (location) {
      loadWeather(location);
    }
  }, [location, loadWeather]);

  return {
    weather,
    isLoading,
    isRefreshing,
    error,
    refresh,
  };
}
