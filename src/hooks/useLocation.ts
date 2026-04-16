/**
 * Hook for managing device location with expo-location
 * Re-checks permission when app returns to foreground
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { LocationCoords } from '../types/weather';
import { logger } from '../utils/logger';

export type PermissionStatus = 'undetermined' | 'granted' | 'denied' | 'denied-permanent';

// Lisboa como localização padrão
const DEFAULT_LOCATION: LocationCoords = {
  latitude: 38.7223,
  longitude: -9.1393,
};

interface UseLocationResult {
  location: LocationCoords | null;
  isLoading: boolean;
  error: string | null;
  permissionStatus: PermissionStatus;
  isUsingDefaultLocation: boolean;
  requestPermission: () => Promise<boolean>;
  refreshLocation: () => Promise<void>;
}

export function useLocation(): UseLocationResult {
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [isUsingDefaultLocation, setIsUsingDefaultLocation] = useState(false);
  const lastPermissionRef = useRef<PermissionStatus>('undetermined');

  const checkPermission = useCallback(async (): Promise<PermissionStatus> => {
    try {
      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      // 'denied-permanent' means the system will no longer show the permission
      // dialog — the WeatherScreen should offer "Open Settings" rather than
      // "Try again". Important on Android where users can pick "Don't ask again".
      const mappedStatus: PermissionStatus =
        status === Location.PermissionStatus.GRANTED
          ? 'granted'
          : status === Location.PermissionStatus.DENIED
            ? canAskAgain
              ? 'denied'
              : 'denied-permanent'
            : 'undetermined';
      setPermissionStatus(mappedStatus);
      lastPermissionRef.current = mappedStatus;
      return mappedStatus;
    } catch (err) {
      logger.error('Error checking location permission:', err);
      return 'undetermined';
    }
  }, []);

  const useDefaultLocation = useCallback(() => {
    logger.log('Using default location (Lisboa)');
    setLocation(DEFAULT_LOCATION);
    setIsUsingDefaultLocation(true);
    setIsLoading(false);
  }, []);

  const fetchLocation = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Validate coordinates
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      ) {
        logger.error('Invalid coordinates received:', { lat, lon });
        useDefaultLocation();
        return;
      }

      setLocation({ latitude: lat, longitude: lon });
      setIsUsingDefaultLocation(false);
    } catch (err) {
      logger.error('Error getting location, using default:', err);
      useDefaultLocation();
    } finally {
      setIsLoading(false);
    }
  }, [useDefaultLocation]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      const granted = status === Location.PermissionStatus.GRANTED;
      const mappedStatus: PermissionStatus = granted
        ? 'granted'
        : canAskAgain
          ? 'denied'
          : 'denied-permanent';
      setPermissionStatus(mappedStatus);
      lastPermissionRef.current = mappedStatus;

      if (granted) {
        await fetchLocation();
      } else if (mappedStatus === 'denied-permanent') {
        // System will no longer show the dialog — caller should offer Settings
        logger.log('Location permission permanently denied (canAskAgain=false)');
      }

      return granted;
    } catch (err) {
      logger.error('Error requesting location permission:', err);
      setError('weather.locationError');
      return false;
    }
  }, [fetchLocation]);

  const refreshLocation = useCallback(async () => {
    const status = await checkPermission();
    if (status === 'granted') {
      await fetchLocation();
    }
  }, [checkPermission, fetchLocation]);

  // Initial load
  useEffect(() => {
    const initialize = async () => {
      const status = await checkPermission();
      if (status === 'granted') {
        await fetchLocation();
        return;
      }

      // First launch (undetermined): auto-prompt the system permission dialog
      // so the user is not silently sent to the Lisbon fallback.
      if (status === 'undetermined') {
        try {
          const { status: requested } = await Location.requestForegroundPermissionsAsync();
          if (requested === Location.PermissionStatus.GRANTED) {
            setPermissionStatus('granted');
            lastPermissionRef.current = 'granted';
            await fetchLocation();
            return;
          }
          setPermissionStatus('denied');
          lastPermissionRef.current = 'denied';
        } catch (err) {
          logger.error('Error auto-requesting location permission:', err);
        }
      }

      // Permission denied/unavailable — fall back to Lisbon
      useDefaultLocation();
    };

    initialize();
  }, [checkPermission, fetchLocation, useDefaultLocation]);

  // Re-check permission when app returns to foreground
  // This handles the case where user enables location in system Settings
  useEffect(() => {
    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const newStatus = await checkPermission();
        // If permission changed from denied/undetermined to granted, fetch location
        if (newStatus === 'granted' && lastPermissionRef.current !== 'granted') {
          lastPermissionRef.current = newStatus;
          await fetchLocation();
        }
        lastPermissionRef.current = newStatus;
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [checkPermission, fetchLocation]);

  return {
    location,
    isLoading,
    error,
    permissionStatus,
    isUsingDefaultLocation,
    requestPermission,
    refreshLocation,
  };
}
