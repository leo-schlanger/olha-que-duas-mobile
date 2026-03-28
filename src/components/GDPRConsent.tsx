import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Linking, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { logger } from '../utils/logger';

const GDPR_CONSENT_KEY = '@olhaqueduas:gdpr_consent';
const PRIVACY_POLICY_URL = 'https://olhaqueduas.com/privacidade';

interface GDPRConsentProps {
  onConsentGiven: (_personalizedAds: boolean) => void;
}

export function GDPRConsent({ onConsentGiven }: GDPRConsentProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    checkConsentStatus();
  }, []);

  async function checkConsentStatus() {
    try {
      const consent = await AsyncStorage.getItem(GDPR_CONSENT_KEY);
      if (consent === null) {
        // No consent recorded, show dialog
        setVisible(true);
      } else {
        // Consent already given
        const personalizedAds = consent === 'personalized';
        onConsentGiven(personalizedAds);
      }
    } catch (error) {
      logger.error('Error checking GDPR consent:', error);
    } finally {
      setHasChecked(true);
    }
  }

  async function handleAcceptAll() {
    try {
      await AsyncStorage.setItem(GDPR_CONSENT_KEY, 'personalized');
      setVisible(false);
      onConsentGiven(true);
    } catch (error) {
      logger.error('Error saving consent:', error);
    }
  }

  async function handleAcceptNonPersonalized() {
    try {
      await AsyncStorage.setItem(GDPR_CONSENT_KEY, 'non_personalized');
      setVisible(false);
      onConsentGiven(false);
    } catch (error) {
      logger.error('Error saving consent:', error);
    }
  }

  function openPrivacyPolicy() {
    Linking.openURL(PRIVACY_POLICY_URL);
  }

  if (!hasChecked || !visible) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.card }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <Text style={[styles.title, { color: colors.text }]}>{t('consent.title')}</Text>

            {/* Content */}
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {t('consent.description')}
            </Text>

            {/* Options explanation */}
            <View style={[styles.optionBox, { backgroundColor: colors.background }]}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>
                {t('consent.personalizedTitle')}
              </Text>
              <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                {t('consent.personalizedDesc')}
              </Text>
            </View>

            <View style={[styles.optionBox, { backgroundColor: colors.background }]}>
              <Text style={[styles.optionTitle, { color: colors.text }]}>
                {t('consent.nonPersonalizedTitle')}
              </Text>
              <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>
                {t('consent.nonPersonalizedDesc')}
              </Text>
            </View>

            {/* Privacy Policy Link */}
            <TouchableOpacity onPress={openPrivacyPolicy}>
              <Text style={[styles.privacyLink, { color: colors.secondary }]}>
                {t('consent.readPrivacyPolicy')}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            <TouchableOpacity
              style={[styles.acceptAllButton, { backgroundColor: colors.primary }]}
              onPress={handleAcceptAll}
            >
              <Text style={[styles.acceptAllText, { color: colors.white }]}>
                {t('consent.acceptAll')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.nonPersonalizedButton, { borderColor: colors.textSecondary }]}
              onPress={handleAcceptNonPersonalized}
            >
              <Text style={[styles.nonPersonalizedText, { color: colors.textSecondary }]}>
                {t('consent.acceptNonPersonalized')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Helper function to reset consent (for settings screen)
export async function resetGDPRConsent(): Promise<void> {
  await AsyncStorage.removeItem(GDPR_CONSENT_KEY);
}

// Helper function to get current consent status
export async function getGDPRConsentStatus(): Promise<'personalized' | 'non_personalized' | null> {
  const consent = await AsyncStorage.getItem(GDPR_CONSENT_KEY);
  if (consent === 'personalized') return 'personalized';
  if (consent === 'non_personalized') return 'non_personalized';
  return null;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    borderRadius: 16,
    padding: 24,
    maxHeight: '80%',
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  optionBox: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  privacyLink: {
    fontSize: 14,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginVertical: 16,
  },
  buttonsContainer: {
    marginTop: 8,
  },
  acceptAllButton: {
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 12,
  },
  acceptAllText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  nonPersonalizedButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    borderWidth: 1,
  },
  nonPersonalizedText: {
    fontSize: 14,
  },
});
