/**
 * Network connectivity context
 * Monitors online/offline state and provides it to the entire app
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import * as Network from 'expo-network';
import { AppState, AppStateStatus } from 'react-native';
import { logger } from '../utils/logger';

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
}

const NetworkContext = createContext<NetworkState>({
  isConnected: true,
  isInternetReachable: true,
});

export function useNetwork() {
  return useContext(NetworkContext);
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
  });

  const checkNetwork = useCallback(async () => {
    try {
      const networkState = await Network.getNetworkStateAsync();
      const isConnected = networkState.isConnected ?? true;
      const isInternetReachable = networkState.isInternetReachable ?? isConnected;

      setState((prev) => {
        if (prev.isConnected !== isConnected || prev.isInternetReachable !== isInternetReachable) {
          logger.log('Network state changed:', { isConnected, isInternetReachable });
          return { isConnected, isInternetReachable };
        }
        return prev;
      });
    } catch (error) {
      logger.error('Error checking network state:', error);
    }
  }, []);

  useEffect(() => {
    checkNetwork();

    let interval: ReturnType<typeof setInterval> | null = setInterval(checkNetwork, 10000);

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkNetwork();
        if (!interval) {
          interval = setInterval(checkNetwork, 10000);
        }
      } else {
        // Pause polling when app goes to background to save battery
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);

    return () => {
      subscription.remove();
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [checkNetwork]);

  return <NetworkContext.Provider value={state}>{children}</NetworkContext.Provider>;
}
