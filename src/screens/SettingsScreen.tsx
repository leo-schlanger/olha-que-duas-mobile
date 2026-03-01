import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePremium } from '../context/PremiumContext';
import { resetGDPRConsent, getGDPRConsentStatus } from '../components/GDPRConsent';
import { colors } from '../config/site';
import { environment } from '../config/environment';

// URLs
const PRIVACY_POLICY_URL = 'https://olhaqueduas.com/privacidade';
const TERMS_URL = 'https://olhaqueduas.com/termos';

// Lazy load purchase service
let purchaseService: any = null;
if (environment.canUseNativeModules) {
  try {
    purchaseService = require('../services/purchaseService').purchaseService;
  } catch (error) {
    console.log('Purchase service not available');
  }
}

export function SettingsScreen() {
  const { isPremium, isLoading, purchasePremium, restorePurchases } = usePremium();
  const [price, setPrice] = useState('2,99 €');
  const [isProcessing, setIsProcessing] = useState(false);
  const [adsConsentStatus, setAdsConsentStatus] = useState<string | null>(null);

  useEffect(() => {
    loadPrice();
    loadConsentStatus();
  }, []);

  async function loadPrice() {
    if (purchaseService && environment.features.purchases) {
      const formattedPrice = await purchaseService.getFormattedPrice();
      setPrice(formattedPrice);
    }
  }

  async function loadConsentStatus() {
    const status = await getGDPRConsentStatus();
    setAdsConsentStatus(status);
  }

  async function handlePurchase() {
    if (!environment.features.purchases) {
      Alert.alert(
        'Indisponível',
        'As compras não estão disponíveis nesta versão de teste.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsProcessing(true);
    const success = await purchasePremium();

    if (success) {
      Alert.alert(
        'Compra realizada!',
        'Obrigado por apoiar o Olha que Duas! Os anúncios foram removidos.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert(
        'Erro na compra',
        'Não foi possível completar a compra. Tente novamente.',
        [{ text: 'OK' }]
      );
    }

    setIsProcessing(false);
  }

  async function handleRestore() {
    if (!environment.features.purchases) {
      Alert.alert(
        'Indisponível',
        'As compras não estão disponíveis nesta versão de teste.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsProcessing(true);
    const success = await restorePurchases();

    if (success) {
      Alert.alert(
        'Compra restaurada!',
        'A sua compra foi restaurada com sucesso.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert(
        'Nenhuma compra encontrada',
        'Não encontrámos nenhuma compra anterior associada à sua conta.',
        [{ text: 'OK' }]
      );
    }

    setIsProcessing(false);
  }

  async function handleResetAdsConsent() {
    Alert.alert(
      'Redefinir preferências',
      'Pretende redefinir as suas preferências de anúncios? O diálogo de consentimento será mostrado novamente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Redefinir',
          onPress: async () => {
            await resetGDPRConsent();
            setAdsConsentStatus(null);
            Alert.alert(
              'Preferências redefinidas',
              'Reinicie a aplicação para ver o diálogo de consentimento novamente.',
              [{ text: 'OK' }]
            );
          },
        },
      ]
    );
  }

  function openPrivacyPolicy() {
    Linking.openURL(PRIVACY_POLICY_URL);
  }

  function openTerms() {
    Linking.openURL(TERMS_URL);
  }

  function getConsentLabel() {
    if (adsConsentStatus === 'personalized') return 'Anúncios personalizados';
    if (adsConsentStatus === 'non_personalized') return 'Anúncios não personalizados';
    return 'Não definido';
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Definições</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Premium Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Premium</Text>

          <View style={styles.premiumCard}>
            <View style={styles.premiumIconContainer}>
              <Ionicons
                name={isPremium ? 'checkmark-circle' : 'star'}
                size={48}
                color={isPremium ? colors.success : colors.secondary}
              />
            </View>

            {isPremium ? (
              <>
                <Text style={styles.premiumTitle}>Você é Premium!</Text>
                <Text style={styles.premiumDescription}>
                  Obrigado por apoiar o Olha que Duas. Aproveite a experiência sem anúncios.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.premiumTitle}>Remover Anúncios</Text>
                <Text style={styles.premiumDescription}>
                  Apoie o Olha que Duas e remova todos os anúncios do aplicativo com um pagamento único.
                </Text>

                <View style={styles.priceContainer}>
                  <Text style={styles.priceLabel}>Apenas</Text>
                  <Text style={styles.price}>{price}</Text>
                  <Text style={styles.priceLabel}>pagamento único</Text>
                </View>

                <TouchableOpacity
                  style={styles.purchaseButton}
                  onPress={handlePurchase}
                  disabled={isLoading || isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <>
                      <Ionicons name="heart" size={20} color={colors.text} />
                      <Text style={styles.purchaseButtonText}>Remover Anúncios</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.restoreButton}
                  onPress={handleRestore}
                  disabled={isLoading || isProcessing}
                >
                  <Text style={styles.restoreButtonText}>Restaurar compra anterior</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Privacy Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacidade</Text>

          <View style={styles.menuCard}>
            {/* Ads Consent */}
            {!isPremium && (
              <TouchableOpacity style={styles.menuItem} onPress={handleResetAdsConsent}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="eye-outline" size={22} color={colors.text} />
                  <View style={styles.menuItemTextContainer}>
                    <Text style={styles.menuItemTitle}>Preferências de anúncios</Text>
                    <Text style={styles.menuItemSubtitle}>{getConsentLabel()}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}

            {/* Privacy Policy */}
            <TouchableOpacity style={styles.menuItem} onPress={openPrivacyPolicy}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="shield-checkmark-outline" size={22} color={colors.text} />
                <Text style={styles.menuItemTitle}>Política de Privacidade</Text>
              </View>
              <Ionicons name="open-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* Terms */}
            <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={openTerms}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="document-text-outline" size={22} color={colors.text} />
                <Text style={styles.menuItemTitle}>Termos de Utilização</Text>
              </View>
              <Ionicons name="open-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sobre</Text>

          <View style={styles.aboutCard}>
            <Text style={styles.aboutText}>
              O Olha que Duas é uma rádio e portal de notícias dedicado a trazer-lhe as últimas informações.
            </Text>
            <Text style={styles.versionText}>Versão 1.0.0</Text>
          </View>
        </View>

        {/* Debug info in development */}
        {environment.isDevelopment && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Debug</Text>
            <View style={styles.aboutCard}>
              <Text style={styles.debugText}>Expo Go: {environment.isExpoGo ? 'Sim' : 'Não'}</Text>
              <Text style={styles.debugText}>Native Modules: {environment.canUseNativeModules ? 'Sim' : 'Não'}</Text>
              <Text style={styles.debugText}>Ads: {environment.features.ads ? 'Activo' : 'Placeholder'}</Text>
              <Text style={styles.debugText}>Purchases: {environment.features.purchases ? 'Activo' : 'Desactivado'}</Text>
              <Text style={styles.debugText}>GDPR Consent: {adsConsentStatus || 'Não definido'}</Text>
            </View>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.card,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 1,
  },
  premiumCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  premiumIconContainer: {
    marginBottom: 16,
  },
  premiumTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  premiumDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  priceContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  priceLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  price: {
    color: colors.secondary,
    fontSize: 36,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  purchaseButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 30,
    gap: 8,
    width: '100%',
  },
  purchaseButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  restoreButton: {
    marginTop: 16,
    padding: 12,
  },
  restoreButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  menuCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemTextContainer: {
    marginLeft: 12,
  },
  menuItemTitle: {
    color: colors.text,
    fontSize: 16,
    marginLeft: 12,
  },
  menuItemSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  aboutCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
  },
  aboutText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  versionText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  debugText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
});
