/**
 * Hook for managing device location with expo-location
 */

import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { LocationCoords } from '../types/weather';
import { logger } from '../utils/logger';

export type PermissionStatus = 'undetermined' | 'granted' | 'denied';

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

      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setIsUsingDefaultLocation(false);
    } catch (err) {
      logger.error('Error getting location, using default:', err);
      useDefaultLocation();
    } finally {
      setIsLoading(false);
    }
  }, [useDefaultLocation]);

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
        // Usar localização padrão quando permissão negada ou não determinada
        useDefaultLocation();
      }
    };

    initialize();
  }, [checkPermission, fetchLocation, useDefaultLocation]);

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
