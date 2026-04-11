import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { usePremium } from '../context/PremiumContext';
import { useTheme } from '../context/ThemeContext';
import { environment } from '../config/environment';
import { logger } from '../utils/logger';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

// Type definitions for dynamically loaded ad modules
interface AdServiceType {
  isReady: () => boolean;
  getMRectAdUnitId: () => string;
  isPersonalizedAdsEnabled: () => boolean;
}

type BannerAdComponentType = React.ComponentType<{
  unitId: string;
  size: string;
  requestOptions?: { requestNonPersonalizedAdsOnly: boolean };
  onAdLoaded?: () => void;
  onAdFailedToLoad?: (_error: unknown) => void;
}>;

// Lazy load native ad modules (not available in Expo Go)
let GoogleBannerAd: BannerAdComponentType | null = null;
let BannerAdSize: { MEDIUM_RECTANGLE: string } = { MEDIUM_RECTANGLE: 'MEDIUM_RECTANGLE' };
let adService: AdServiceType | null = null;

if (environment.canUseNativeModules) {
  try {
    const adsModule = require('react-native-google-mobile-ads');
    GoogleBannerAd = adsModule.BannerAd;
    BannerAdSize = adsModule.BannerAdSize;
    adService = require('../services/adService').adService;
  } catch (_error) {
    logger.log('Ad modules not available');
  }
}

const { width } = Dimensions.get('window');

// Tempo de espera em segundos antes de poder fechar
const WAIT_TIME_SECONDS = 5;

interface InterstitialAdOverlayProps {
  visible: boolean;
  onClose: () => void;
}

export function InterstitialAdOverlay({ visible, onClose }: InterstitialAdOverlayProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isPremium } = usePremium();
  const [countdown, setCountdown] = useState(WAIT_TIME_SECONDS);
  const [canClose, setCanClose] = useState(false);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adError, setAdError] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const sdkReadyRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check SDK ready status
  useEffect(() => {
    if (!visible) return;
    // Premium users never see ads — skip SDK polling entirely
    if (isPremium) return;

    let mounted = true;
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (adService?.isReady()) {
      sdkReadyRef.current = true;
      setSdkReady(true);
    } else {
      checkInterval = setInterval(() => {
        if (adService?.isReady() && mounted) {
          sdkReadyRef.current = true;
          setSdkReady(true);
          if (checkInterval) clearInterval(checkInterval);
          if (timeoutId) clearTimeout(timeoutId);
        }
      }, 1000);

      // Timeout after 5 seconds — read the ref so we don't capture a stale state value
      timeoutId = setTimeout(() => {
        if (checkInterval) clearInterval(checkInterval);
        if (mounted && !sdkReadyRef.current) {
          setAdError(true);
        }
      }, 5000);
    }

    return () => {
      mounted = false;
      if (checkInterval) clearInterval(checkInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [visible, isPremium]);

  // Reset and start countdown when overlay becomes visible
  useEffect(() => {
    if (visible && !isPremium) {
      setCountdown(WAIT_TIME_SECONDS);
      setCanClose(false);
      setAdLoaded(false);
      setAdError(false);

      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) {
              clearInterval(countdownRef.current);
            }
            setCanClose(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [visible, isPremium]);

  // Don't show for premium users
  if (isPremium) {
    // Auto-close if premium user
    if (visible) {
      onClose();
    }
    return null;
  }

  // Don't render if not visible
  if (!visible) {
    return null;
  }

  const handleClose = () => {
    if (canClose) {
      onClose();
    }
  };

  const adUnitId = adService?.getMRectAdUnitId() ?? '';
  const nonPersonalizedAds = adService ? !adService.isPersonalizedAdsEnabled() : true;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.backgroundCard }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.muted }]}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons
                name="advertisements"
                size={20}
                color={colors.textSecondary}
              />
              <Text style={[styles.headerText, { color: colors.textSecondary }]}>
                {t('ads.title')}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.closeButton,
                {
                  backgroundColor: canClose ? colors.primary : colors.muted,
                  opacity: canClose ? 1 : 0.6,
                },
              ]}
              onPress={handleClose}
              disabled={!canClose}
            >
              {canClose ? (
                <>
                  <MaterialCommunityIcons name="close" size={16} color="#fff" />
                  <Text style={styles.closeButtonText}>{t('ads.close')}</Text>
                </>
              ) : (
                <Text style={styles.closeButtonText}>
                  {t('ads.closeIn', { seconds: countdown })}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Ad Content */}
          <View style={styles.adContainer}>
            {!environment.canUseNativeModules || !adService || !GoogleBannerAd ? (
              // Expo Go fallback
              <View style={[styles.placeholderAd, { backgroundColor: colors.background }]}>
                <MaterialCommunityIcons
                  name="advertisements-off"
                  size={40}
                  color={colors.textSecondary}
                />
                <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                  {t('ads.unavailableExpoGo')}
                </Text>
              </View>
            ) : !sdkReady && !adError ? (
              // Loading SDK
              <View style={[styles.placeholderAd, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                  {t('ads.loadingAd')}
                </Text>
              </View>
            ) : adError ? (
              // Error loading ad
              <View style={[styles.placeholderAd, { backgroundColor: colors.background }]}>
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={40}
                  color={colors.textSecondary}
                />
                <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                  {t('ads.advertisement')}
                </Text>
              </View>
            ) : (
              // Real ad
              <View style={styles.adWrapper}>
                {!adLoaded && (
                  <View style={[styles.adLoading, { backgroundColor: colors.background }]}>
                    <ActivityIndicator size="large" color={colors.primary} />
                  </View>
                )}
                <GoogleBannerAd
                  unitId={adUnitId}
                  size={BannerAdSize.MEDIUM_RECTANGLE}
                  requestOptions={{
                    requestNonPersonalizedAdsOnly: nonPersonalizedAds,
                  }}
                  onAdLoaded={() => {
                    logger.log('InterstitialAdOverlay: Ad loaded');
                    setAdLoaded(true);
                  }}
                  onAdFailedToLoad={(error: unknown) => {
                    logger.log('InterstitialAdOverlay: Failed to load', error);
                    setAdError(true);
                  }}
                />
              </View>
            )}
          </View>

          {/* Footer message */}
          <View style={[styles.footer, { borderTopColor: colors.muted }]}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              {t('ads.helpKeepFree')}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    width: Math.min(width - 40, 340),
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 60,
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  adContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 250,
    padding: 16,
  },
  adWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 250,
  },
  adLoading: {
    position: 'absolute',
    width: 300,
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    zIndex: 1,
  },
  placeholderAd: {
    width: 300,
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  placeholderText: {
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
