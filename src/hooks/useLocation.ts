/**
 * Hook for managing device location with expo-location
 */

import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { LocationCoords } from '../types/weather';
import { logger } from '../utils/logger';

export type PermissionStatus = 'undetermined' | 'granted' | 'denied';

interface UseLocationResult {
  location: LocationCoords | null;
  isLoading: boolean;
  error: string | null;
  permissionStatus: PermissionStatus;
  requestPermission: () => Promise<boolean>;
  refreshLocation: () => Promise<void>;
}

export function useLocation(): UseLocationResult {
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');

  const checkPermission = useCallback(async (): Promise<PermissionStatus> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      const mappedStatus: PermissionStatus =
        status === Location.PermissionStatus.GRANTED ? 'granted' :
        status === Location.PermissionStatus.DENIED ? 'denied' : 'undetermined';
      setPermissionStatus(mappedStatus);
      return mappedStatus;
    } catch (err) {
      logger.error('Error checking location permission:', err);
      return 'undetermined';
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === Location.PermissionStatus.GRANTED;
      setPermissionStatus(granted ? 'granted' : 'denied');

      if (granted) {
        await fetchLocation();
      }

      return granted;
    } catch (err) {
      logger.error('Error requesting location permission:', err);
      setError('Erro ao solicitar permissão de localização');
      return false;
    }
  }, []);

  const fetchLocation = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch (err) {
      logger.error('Error getting location:', err);
      setError('Erro ao obter localização. Verifique as definições de localização.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshLocation = useCallback(async () => {
    const status = await checkPermission();
    if (status === 'granted') {
      await fetchLocation();
    }
  }, [checkPermission, fetchLocation]);

  useEffect(() => {
    const initialize = async () => {
      const status = await checkPermission();
      if (status === 'granted') {
        await fetchLocation();
      } else {
        setIsLoading(false);
      }
    };

    initialize();
  }, [checkPermission, fetchLocation]);

  return {
    location,
    isLoading,
    error,
    permissionStatus,
    requestPermission,
    refreshLocation,
  };
}
