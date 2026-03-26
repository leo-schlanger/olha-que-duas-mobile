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
  Switch,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { usePremium } from '../context/PremiumContext';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import {
  resetGDPRConsent,
  getGDPRConsentStatus,
} from '../components/GDPRConsent';
import { useRadioSettings } from '../hooks/useRadioSettings';
import { useNotifications } from '../hooks/useNotifications';
import { useSchedule } from '../hooks/useSchedule';
import { ReminderTime } from '../services/notificationService';
import { environment } from '../config/environment';
import { siteConfig } from '../config/site';
import { logger } from '../utils/logger';

const PRIVACY_POLICY_URL = 'https://olhaqueduas.com/privacidade';
const TERMS_URL = 'https://olhaqueduas.com/termos';
const WEBSITE_URL = 'https://olhaqueduas.com';

const REMINDER_OPTIONS: { value: ReminderTime; label: string }[] = [
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
];

let purchaseService: any = null;
if (environment.canUseNativeModules) {
  try {
    purchaseService = require('../services/purchaseService').purchaseService;
  } catch (error) {
    logger.log('Purchase service not available');
  }
}

function ThemeOption({
  mode,
  currentMode,
  onSelect,
  colors,
  icon,
  label,
}: {
  mode: ThemeMode;
  currentMode: ThemeMode;
  onSelect: (mode: ThemeMode) => void;
  colors: any;
  icon: string;
  label: string;
}) {
  const isSelected = mode === currentMode;

  return (
    <TouchableOpacity
      style={[
        styles.themeOption,
        {
          backgroundColor: isSelected ? colors.primary : colors.background,
          borderColor: isSelected ? colors.primary : colors.muted,
        },
      ]}
      onPress={() => onSelect(mode)}
      activeOpacity={0.7}
    >
      <MaterialCommunityIcons
        name={icon as any}
        size={22}
        color={isSelected ? colors.white : colors.text}
      />
      <Text
        style={[
          styles.themeOptionText,
          { color: isSelected ? colors.white : colors.text },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function SettingsScreen() {
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const { isPremium, isLoading, purchasePremium, restorePurchases } =
    usePremium();
  const {
    settings: radioSettings,
    updateSetting: updateRadioSetting,
    isLoading: radioSettingsLoading,
  } = useRadioSettings();
  const {
    preferences: notificationPrefs,
    isLoading: notificationLoading,
    hasPermission: notificationPermission,
    setEnabled: setNotificationsEnabled,
    setReminderMinutes,
  } = useNotifications();
  const { schedule, loading: scheduleLoading } = useSchedule();
  const [price, setPrice] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [adsConsentStatus, setAdsConsentStatus] = useState<string | null>(null);

  useEffect(() => {
    loadPrice();
    loadConsentStatus();
  }, []);

  async function loadPrice() {
    if (purchaseService && environment.features.purchases) {
      try {
        const formattedPrice = await purchaseService.getFormattedPrice();
        setPrice(formattedPrice);
      } catch (error) {
        logger.error('Error loading price:', error);
        setPrice('3,69 €');
      }
    } else {
      setPrice('3,69 €');
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
    if (adsConsentStatus === 'non_personalized')
      return 'Anúncios não personalizados';
    return 'Não definido';
  }

  function handleExitApp() {
    if (Platform.OS === 'android') {
      Alert.alert(
        'Sair da aplicação',
        'Tem a certeza que pretende sair?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sair', onPress: () => BackHandler.exitApp() },
        ]
      );
    } else {
      Alert.alert(
        'Informação',
        'No iOS, deslize para cima a partir do fundo do ecrã e arraste a app para cima para a fechar.',
        [{ text: 'OK' }]
      );
    }
  }

  function openWebsite() {
    Linking.openURL(WEBSITE_URL);
  }

  function openSocialLink(url: string) {
    Linking.openURL(url);
  }

  const dynamicStyles = createDynamicStyles(colors, isDark);

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      <View style={dynamicStyles.header}>
        <Text style={dynamicStyles.headerTitle}>Definições</Text>
      </View>

      <ScrollView
        style={dynamicStyles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Aparência</Text>

          <View style={dynamicStyles.themeCard}>
            <View style={dynamicStyles.themeHeader}>
              <MaterialCommunityIcons
                name="palette-outline"
                size={22}
                color={colors.text}
              />
              <Text style={dynamicStyles.themeHeaderText}>Escolha o tema</Text>
            </View>

            <View style={dynamicStyles.themeOptions}>
              <ThemeOption
                mode="light"
                currentMode={themeMode}
                onSelect={setThemeMode}
                colors={colors}
                icon="white-balance-sunny"
                label="Claro"
              />
              <ThemeOption
                mode="system"
                currentMode={themeMode}
                onSelect={setThemeMode}
                colors={colors}
                icon="theme-light-dark"
                label="Sistema"
              />
              <ThemeOption
                mode="dark"
                currentMode={themeMode}
                onSelect={setThemeMode}
                colors={colors}
                icon="weather-night"
                label="Escuro"
              />
            </View>
          </View>
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Rádio</Text>

          <View style={dynamicStyles.menuCard}>
            <SettingRow
              icon="play-circle-outline"
              iconColor={colors.primary}
              title="Reprodução em segundo plano"
              subtitle="Continuar a tocar com o ecrã desligado"
              colors={colors}
              value={radioSettings?.backgroundPlayback ?? true}
              onValueChange={(value) =>
                updateRadioSetting('backgroundPlayback', value)
              }
              disabled={radioSettingsLoading}
            />

            <SettingRow
              icon="autorenew"
              iconColor={colors.success}
              title="Reconexão automática"
              subtitle="Reconectar se a ligação for perdida"
              colors={colors}
              value={radioSettings?.autoReconnect ?? true}
              onValueChange={(value) =>
                updateRadioSetting('autoReconnect', value)
              }
              disabled={radioSettingsLoading}
            />

            <SettingRow
              icon="flash-outline"
              iconColor={colors.amarelo}
              title="Reprodução automática"
              subtitle="Iniciar a rádio ao abrir a aplicação"
              colors={colors}
              value={radioSettings?.autoPlayOnStart ?? false}
              onValueChange={(value) =>
                updateRadioSetting('autoPlayOnStart', value)
              }
              disabled={radioSettingsLoading}
              isLast
            />
          </View>
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Premium</Text>

          <View style={dynamicStyles.premiumCard}>
            <View
              style={[
                dynamicStyles.premiumBadge,
                {
                  backgroundColor: isPremium ? colors.success : colors.secondary,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={isPremium ? 'check-circle' : 'star'}
                size={28}
                color={colors.white}
              />
            </View>

            {isPremium ? (
              <>
                <Text style={dynamicStyles.premiumTitle}>
                  Você é Premium!
                </Text>
                <Text style={dynamicStyles.premiumDescription}>
                  Obrigado por apoiar o Olha que Duas. Aproveite a experiência
                  sem anúncios.
                </Text>
              </>
            ) : (
              <>
                <Text style={dynamicStyles.premiumTitle}>Remover Anúncios</Text>
                <Text style={dynamicStyles.premiumDescription}>
                  Apoie o Olha que Duas e remova todos os anúncios com um
                  pagamento único.
                </Text>

                <View style={dynamicStyles.priceTag}>
                  <Text style={dynamicStyles.priceText}>
                    {price ?? '...'}
                  </Text>
                  <Text style={dynamicStyles.priceSubtext}>
                    pagamento único
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    dynamicStyles.purchaseButton,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={handlePurchase}
                  disabled={isLoading || isProcessing}
                  activeOpacity={0.8}
                >
                  {isProcessing ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name="heart-outline"
                        size={20}
                        color={colors.white}
                      />
                      <Text style={dynamicStyles.purchaseButtonText}>
                        Remover Anúncios
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={dynamicStyles.restoreButton}
                  onPress={handleRestore}
                  disabled={isLoading || isProcessing}
                >
                  <Text style={dynamicStyles.restoreButtonText}>
                    Restaurar compra anterior
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Privacidade</Text>

          <View style={dynamicStyles.menuCard}>
            {!isPremium && (
              <MenuItem
                icon="eye-outline"
                title="Preferências de anúncios"
                subtitle={getConsentLabel()}
                colors={colors}
                onPress={handleResetAdsConsent}
              />
            )}

            <MenuItem
              icon="shield-check-outline"
              title="Política de Privacidade"
              colors={colors}
              onPress={openPrivacyPolicy}
              showExternal
            />

            <MenuItem
              icon="file-document-outline"
              title="Termos de Utilização"
              colors={colors}
              onPress={openTerms}
              showExternal
              isLast
            />
          </View>
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Notificações</Text>

          <View style={dynamicStyles.menuCard}>
            <SettingRow
              icon="bell-outline"
              iconColor={colors.secondary}
              title="Lembretes de programas"
              subtitle="Receber notificações antes dos programas"
              colors={colors}
              value={notificationPrefs.enabled}
              onValueChange={setNotificationsEnabled}
              disabled={notificationLoading}
            />

            {notificationPrefs.enabled && (
              <View style={[styles.reminderTimeRow, { borderTopColor: colors.background, borderTopWidth: 1 }]}>
                <View style={styles.reminderTimeHeader}>
                  <MaterialCommunityIcons
                    name="clock-outline"
                    size={18}
                    color={colors.textSecondary}
                  />
                  <Text style={[styles.reminderTimeLabel, { color: colors.text }]}>
                    Avisar antes:
                  </Text>
                </View>
                <View style={styles.reminderTimeOptions}>
                  {REMINDER_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.reminderTimeOption,
                        {
                          backgroundColor:
                            notificationPrefs.reminderMinutes === option.value
                              ? colors.secondary
                              : colors.background,
                          borderColor:
                            notificationPrefs.reminderMinutes === option.value
                              ? colors.secondary
                              : colors.muted,
                        },
                      ]}
                      onPress={() => setReminderMinutes(option.value)}
                      disabled={notificationLoading}
                    >
                      <Text
                        style={[
                          styles.reminderTimeText,
                          {
                            color:
                              notificationPrefs.reminderMinutes === option.value
                                ? colors.white
                                : colors.text,
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.timezoneInfo}>
                  <MaterialCommunityIcons
                    name="earth"
                    size={14}
                    color={colors.textSecondary}
                  />
                  <Text style={[styles.timezoneInfoText, { color: colors.textSecondary }]}>
                    Horários em Portugal (PT). Ajustamos automaticamente ao seu fuso horário.
                  </Text>
                </View>
              </View>
            )}
          </View>

          {notificationPrefs.enabled && notificationPrefs.enabledShows.length > 0 && (
            <View style={[dynamicStyles.menuCard, { marginTop: 10 }]}>
              <View style={styles.enabledShowsHeader}>
                <Text style={[styles.enabledShowsTitle, { color: colors.textSecondary }]}>
                  Programas com lembrete ativo:
                </Text>
              </View>
              {notificationPrefs.enabledShows.map((show, index) => (
                <View
                  key={show}
                  style={[
                    styles.enabledShowItem,
                    { borderBottomColor: colors.background },
                    index === notificationPrefs.enabledShows.length - 1 && styles.enabledShowItemLast,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="bell-ring-outline"
                    size={16}
                    color={colors.secondary}
                  />
                  <Text style={[styles.enabledShowName, { color: colors.text }]}>
                    {show}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Sobre</Text>

          <View style={dynamicStyles.aboutCard}>
            <MaterialCommunityIcons
              name="radio"
              size={40}
              color={colors.primary}
            />
            <Text style={[dynamicStyles.aboutTitle, { marginTop: 24 }]}>Olha que Duas</Text>
            <Text style={dynamicStyles.aboutText}>
              O Olha que Duas é uma rádio online portuguesa que une entretenimento, bem-estar e conversas autênticas. Com uma programação diversificada que vai desde nutrição e motivação até debates descontraídos, estamos no ar 24 horas por dia para lhe fazer companhia.
            </Text>

            <View style={dynamicStyles.programsCard}>
              <Text style={[dynamicStyles.programsTitle, { color: colors.text }]}>
                Programas em destaque
              </Text>
              {scheduleLoading ? (
                <ActivityIndicator size="small" color={colors.secondary} style={{ padding: 10 }} />
              ) : (
                schedule.map((item) => (
                  <View key={`${item.day}-${item.show}`} style={dynamicStyles.programRow}>
                    <Text style={[dynamicStyles.programDay, { color: colors.secondary }]}>
                      {item.day}
                    </Text>
                    <Text style={[dynamicStyles.programName, { color: colors.text }]}>
                      {item.show}
                    </Text>
                    <Text style={[dynamicStyles.programTimes, { color: colors.textSecondary }]}>
                      {item.times.join(' / ')}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <Text style={[dynamicStyles.aboutText, { marginTop: 16 }]}>
              Somos mais do que uma rádio - somos uma comunidade. Cada programa é pensado para trazer valor ao seu dia, seja através de dicas práticas de saúde, inspiração para os seus objetivos ou simplesmente boas conversas para descontrair.
            </Text>

            <TouchableOpacity
              style={[dynamicStyles.websiteButton, { backgroundColor: colors.primary }]}
              onPress={openWebsite}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="web" size={20} color={colors.white} />
              <Text style={dynamicStyles.websiteButtonText}>Visitar Website</Text>
            </TouchableOpacity>

            <View style={dynamicStyles.socialLinks}>
              <TouchableOpacity
                style={[dynamicStyles.socialButton, { backgroundColor: '#E4405F' }]}
                onPress={() => openSocialLink(siteConfig.social.instagram)}
              >
                <MaterialCommunityIcons name="instagram" size={22} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[dynamicStyles.socialButton, { backgroundColor: '#1877F2' }]}
                onPress={() => openSocialLink(siteConfig.social.facebook)}
              >
                <MaterialCommunityIcons name="facebook" size={22} color={colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[dynamicStyles.socialButton, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
                onPress={() => openSocialLink(siteConfig.social.tiktok)}
              >
                <MaterialCommunityIcons name="music-note" size={22} color={isDark ? '#000000' : '#FFFFFF'} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[dynamicStyles.socialButton, { backgroundColor: '#FF0000' }]}
                onPress={() => openSocialLink(siteConfig.social.youtube)}
              >
                <MaterialCommunityIcons name="youtube" size={22} color={colors.white} />
              </TouchableOpacity>
            </View>

            <View style={dynamicStyles.versionBadge}>
              <Text style={dynamicStyles.versionText}>Versão 1.0.0</Text>
            </View>
          </View>
        </View>

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>Aplicação</Text>

          <View style={dynamicStyles.menuCard}>
            <MenuItem
              icon="exit-to-app"
              title="Sair da Aplicação"
              subtitle={Platform.OS === 'android' ? 'Fechar completamente a app' : 'Ver instruções para fechar'}
              colors={colors}
              onPress={handleExitApp}
              isLast
            />
          </View>
        </View>

        {environment.isDevelopment && (
          <View style={dynamicStyles.section}>
            <Text style={dynamicStyles.sectionTitle}>Debug</Text>
            <View style={dynamicStyles.debugCard}>
              <DebugRow
                label="Expo Go"
                value={environment.isExpoGo ? 'Sim' : 'Não'}
                colors={colors}
              />
              <DebugRow
                label="Native Modules"
                value={environment.canUseNativeModules ? 'Sim' : 'Não'}
                colors={colors}
              />
              <DebugRow
                label="Ads"
                value={environment.features.ads ? 'Activo' : 'Placeholder'}
                colors={colors}
              />
              <DebugRow
                label="Purchases"
                value={
                  environment.features.purchases ? 'Activo' : 'Desactivado'
                }
                colors={colors}
              />
              <DebugRow
                label="Theme Mode"
                value={themeMode}
                colors={colors}
              />
              <DebugRow
                label="Is Dark"
                value={isDark ? 'Sim' : 'Não'}
                colors={colors}
              />
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({
  icon,
  iconColor,
  title,
  subtitle,
  colors,
  value,
  onValueChange,
  disabled,
  isLast,
}: {
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  colors: any;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  isLast?: boolean;
}) {
  return (
    <View
      style={[
        styles.settingRow,
        { borderBottomColor: colors.background },
        isLast && styles.settingRowLast,
      ]}
    >
      <View
        style={[
          styles.settingIconBox,
          { backgroundColor: iconColor + '15' },
        ]}
      >
        <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: colors.text }]}>
          {title}
        </Text>
        <Text
          style={[styles.settingSubtitle, { color: colors.textSecondary }]}
        >
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.muted, true: iconColor + '60' }}
        thumbColor={value ? iconColor : colors.textSecondary}
        disabled={disabled}
      />
    </View>
  );
}

function MenuItem({
  icon,
  title,
  subtitle,
  colors,
  onPress,
  showExternal,
  isLast,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  colors: any;
  onPress: () => void;
  showExternal?: boolean;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.menuItem,
        { borderBottomColor: colors.background },
        isLast && styles.menuItemLast,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.menuIconBox,
          { backgroundColor: colors.muted },
        ]}
      >
        <MaterialCommunityIcons name={icon as any} size={20} color={colors.text} />
      </View>
      <View style={styles.menuContent}>
        <Text style={[styles.menuTitle, { color: colors.text }]}>
          {title}
        </Text>
        {subtitle && (
          <Text
            style={[styles.menuSubtitle, { color: colors.textSecondary }]}
          >
            {subtitle}
          </Text>
        )}
      </View>
      <MaterialCommunityIcons
        name={showExternal ? 'open-in-new' : 'chevron-right'}
        size={18}
        color={colors.textSecondary}
      />
    </TouchableOpacity>
  );
}

function DebugRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={styles.debugRow}>
      <Text style={[styles.debugLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.debugValue, { color: colors.text }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  themeOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    gap: 6,
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  settingIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  settingSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuContent: {
    flex: 1,
    marginLeft: 12,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  menuSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  debugLabel: {
    fontSize: 13,
  },
  debugValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  reminderTimeRow: {
    padding: 14,
  },
  reminderTimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  reminderTimeLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  reminderTimeOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  reminderTimeOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  reminderTimeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  timezoneInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  timezoneInfoText: {
    fontSize: 11,
    flex: 1,
  },
  enabledShowsHeader: {
    padding: 12,
    paddingBottom: 8,
  },
  enabledShowsTitle: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  enabledShowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  enabledShowItemLast: {
    borderBottomWidth: 0,
  },
  enabledShowName: {
    fontSize: 14,
    fontWeight: '500',
  },
});

function createDynamicStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.muted,
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
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      marginBottom: 10,
      marginLeft: 4,
      letterSpacing: 0.5,
    },
    themeCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
    },
    themeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 14,
      gap: 10,
    },
    themeHeaderText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    themeOptions: {
      flexDirection: 'row',
      gap: 10,
    },
    menuCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      overflow: 'hidden',
    },
    premiumCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
    },
    premiumBadge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    premiumTitle: {
      color: colors.text,
      fontSize: 20,
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
    priceTag: {
      backgroundColor: colors.secondary + '15',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 20,
    },
    priceText: {
      color: colors.secondary,
      fontSize: 28,
      fontWeight: 'bold',
    },
    priceSubtext: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    purchaseButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      paddingHorizontal: 32,
      borderRadius: 25,
      gap: 8,
      width: '100%',
    },
    purchaseButtonText: {
      color: colors.white,
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
    aboutCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
    },
    aboutTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 8,
    },
    aboutText: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 16,
    },
    programsCard: {
      width: '100%',
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    programsTitle: {
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 12,
      textAlign: 'center',
    },
    programRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      gap: 8,
    },
    programDay: {
      fontSize: 12,
      fontWeight: '700',
      width: 60,
    },
    programName: {
      fontSize: 13,
      fontWeight: '500',
      flex: 1,
    },
    programTimes: {
      fontSize: 11,
      fontWeight: '500',
    },
    websiteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 25,
      gap: 8,
      marginBottom: 16,
    },
    websiteButtonText: {
      color: colors.white,
      fontSize: 15,
      fontWeight: '600',
    },
    socialLinks: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
    },
    socialButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    versionBadge: {
      backgroundColor: colors.muted,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
    },
    versionText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    debugCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
    },
  });
}
