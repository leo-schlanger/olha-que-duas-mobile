import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Linking,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../config/site';

const GDPR_CONSENT_KEY = '@olhaqueduas:gdpr_consent';
const PRIVACY_POLICY_URL = 'https://olhaqueduas.com/privacidade';

interface GDPRConsentProps {
  onConsentGiven: (personalizedAds: boolean) => void;
}

export function GDPRConsent({ onConsentGiven }: GDPRConsentProps) {
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
      console.error('Error checking GDPR consent:', error);
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
      console.error('Error saving consent:', error);
    }
  }

  async function handleAcceptNonPersonalized() {
    try {
      await AsyncStorage.setItem(GDPR_CONSENT_KEY, 'non_personalized');
      setVisible(false);
      onConsentGiven(false);
    } catch (error) {
      console.error('Error saving consent:', error);
    }
  }

  function openPrivacyPolicy() {
    Linking.openURL(PRIVACY_POLICY_URL);
  }

  if (!hasChecked || !visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <Text style={styles.title}>A sua privacidade</Text>

            {/* Content */}
            <Text style={styles.description}>
              Utilizamos cookies e tecnologias semelhantes para exibir anúncios.
              Pode escolher como pretende que os seus dados sejam utilizados:
            </Text>

            {/* Options explanation */}
            <View style={styles.optionBox}>
              <Text style={styles.optionTitle}>Anúncios personalizados</Text>
              <Text style={styles.optionDescription}>
                Anúncios baseados nos seus interesses e histórico de navegação.
                Os dados são processados pelo Google AdMob.
              </Text>
            </View>

            <View style={styles.optionBox}>
              <Text style={styles.optionTitle}>Anúncios não personalizados</Text>
              <Text style={styles.optionDescription}>
                Anúncios genéricos que não utilizam os seus dados pessoais
                para personalização.
              </Text>
            </View>

            {/* Privacy Policy Link */}
            <TouchableOpacity onPress={openPrivacyPolicy}>
              <Text style={styles.privacyLink}>
                Ler Política de Privacidade completa
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            <TouchableOpacity
              style={styles.acceptAllButton}
              onPress={handleAcceptAll}
            >
              <Text style={styles.acceptAllText}>Aceitar todos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.nonPersonalizedButton}
              onPress={handleAcceptNonPersonalized}
            >
              <Text style={styles.nonPersonalizedText}>
                Apenas anúncios não personalizados
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
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    maxHeight: '80%',
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  optionBox: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  privacyLink: {
    color: colors.secondary,
    fontSize: 14,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginVertical: 16,
  },
  buttonsContainer: {
    marginTop: 8,
  },
  acceptAllButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 12,
  },
  acceptAllText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  nonPersonalizedButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  nonPersonalizedText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
