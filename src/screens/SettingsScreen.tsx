import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Platform,
  BackHandler,
  NativeModules,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { usePremium } from '../context/PremiumContext';
import { useTheme, ThemeMode, ThemeColors } from '../context/ThemeContext';
import { resetGDPRConsent, getGDPRConsentStatus } from '../components/GDPRConsent';
import { useRadioSettings } from '../hooks/useRadioSettings';
import { useNotifications } from '../hooks/useNotifications';
import { SettingRow, MenuItem } from '../components/settings';
import { AboutBottomSheet } from '../components/AboutBottomSheet';
import { ReminderTime } from '../services/notificationService';
import { environment } from '../config/environment';
import { logger } from '../utils/logger';
import { LANGUAGES, LanguageCode, changeLanguage, getCurrentLanguage } from '../i18n';

const PRIVACY_POLICY_URL = 'https://olhaqueduas.com/privacidade';
const TERMS_URL = 'https://olhaqueduas.com/termos';

const REMINDER_OPTIONS: { value: ReminderTime; label: string }[] = [
  { value: 5, label: '5 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
];

interface PurchaseServiceType {
  getFormattedPrice: () => Promise<string>;
}

let purchaseService: PurchaseServiceType | null = null;
if (environment.canUseNativeModules) {
  try {
    purchaseService = require('../services/purchaseService').purchaseService;
  } catch (_error) {
    logger.log('Purchase service not available');
  }
}

// --- Section Components ---

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
  onSelect: (_mode: ThemeMode) => void;
  colors: ThemeColors;
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
        name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
        size={22}
        color={isSelected ? colors.white : colors.text}
      />
      <Text style={[styles.themeOptionText, { color: isSelected ? colors.white : colors.text }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function AppearanceSection({
  colors,
  themeMode,
  setThemeMode,
  dynamicStyles,
}: {
  colors: ThemeColors;
  themeMode: ThemeMode;
  setThemeMode: (_mode: ThemeMode) => void;
  dynamicStyles: ReturnType<typeof createDynamicStyles>;
}) {
  const { t } = useTranslation();
  return (
    <View style={dynamicStyles.section}>
      <Text style={dynamicStyles.sectionTitle}>{t('settings.appearance.title')}</Text>
      <View style={dynamicStyles.themeCard}>
        <View style={dynamicStyles.themeHeader}>
          <MaterialCommunityIcons name="palette-outline" size={22} color={colors.text} />
          <Text style={dynamicStyles.themeHeaderText}>{t('settings.appearance.chooseTheme')}</Text>
        </View>
        <View style={dynamicStyles.themeOptions}>
          <ThemeOption
            mode="light"
            currentMode={themeMode}
            onSelect={setThemeMode}
            colors={colors}
            icon="white-balance-sunny"
            label={t('settings.appearance.light')}
          />
          <ThemeOption
            mode="system"
            currentMode={themeMode}
            onSelect={setThemeMode}
            colors={colors}
            icon="theme-light-dark"
            label={t('settings.appearance.system')}
          />
          <ThemeOption
            mode="dark"
            currentMode={themeMode}
            onSelect={setThemeMode}
            colors={colors}
            icon="weather-night"
            label={t('settings.appearance.dark')}
          />
        </View>
      </View>
    </View>
  );
}

function LanguageSection({
  colors,
  currentLang,
  onLanguageChange,
  dynamicStyles,
}: {
  colors: ThemeColors;
  currentLang: LanguageCode;
  onLanguageChange: (_lang: LanguageCode) => void;
  dynamicStyles: ReturnType<typeof createDynamicStyles>;
}) {
  const { t } = useTranslation();
  return (
    <View style={dynamicStyles.section}>
      <Text style={dynamicStyles.sectionTitle}>{t('settings.language.title')}</Text>
      <View style={dynamicStyles.themeCard}>
        <View style={dynamicStyles.themeHeader}>
          <MaterialCommunityIcons name="translate" size={22} color={colors.text} />
          <Text style={dynamicStyles.themeHeaderText}>{t('settings.language.chooseLanguage')}</Text>
        </View>
        <View style={dynamicStyles.themeOptions}>
          {(Object.keys(LANGUAGES) as LanguageCode[]).map((langCode) => (
            <TouchableOpacity
              key={langCode}
              style={[
                styles.themeOption,
                {
                  backgroundColor: currentLang === langCode ? colors.primary : colors.background,
                  borderColor: currentLang === langCode ? colors.primary : colors.muted,
                },
              ]}
              onPress={() => onLanguageChange(langCode)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.themeOptionText,
                  { color: currentLang === langCode ? colors.white : colors.text },
                ]}
              >
                {LANGUAGES[langCode].nativeName}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

function RadioSection({
  colors,
  radioSettings,
  radioSettingsLoading,
  updateRadioSetting,
  dynamicStyles,
}: {
  colors: ThemeColors;
  radioSettings: ReturnType<typeof useRadioSettings>['settings'];
  radioSettingsLoading: boolean;
  updateRadioSetting: ReturnType<typeof useRadioSettings>['updateSetting'];
  dynamicStyles: ReturnType<typeof createDynamicStyles>;
}) {
  const { t } = useTranslation();
  return (
    <View style={dynamicStyles.section}>
      <Text style={dynamicStyles.sectionTitle}>{t('settings.radio.title')}</Text>
      <View style={dynamicStyles.menuCard}>
        <SettingRow
          icon="play-circle-outline"
          iconColor={colors.primary}
          title={t('settings.radio.backgroundPlayback')}
          subtitle={t('settings.radio.backgroundPlaybackDesc')}
          colors={colors}
          value={radioSettings?.backgroundPlayback ?? true}
          onValueChange={(value) => updateRadioSetting('backgroundPlayback', value)}
          disabled={radioSettingsLoading}
        />
        <SettingRow
          icon="autorenew"
          iconColor={colors.success}
          title={t('settings.radio.autoReconnect')}
          subtitle={t('settings.radio.autoReconnectDesc')}
          colors={colors}
          value={radioSettings?.autoReconnect ?? true}
          onValueChange={(value) => updateRadioSetting('autoReconnect', value)}
          disabled={radioSettingsLoading}
        />
        <SettingRow
          icon="flash-outline"
          iconColor={colors.amarelo}
          title={t('settings.radio.autoPlay')}
          subtitle={t('settings.radio.autoPlayDesc')}
          colors={colors}
          value={radioSettings?.autoPlayOnStart ?? false}
          onValueChange={(value) => updateRadioSetting('autoPlayOnStart', value)}
          disabled={radioSettingsLoading}
        />
        <SettingRow
          icon="close-circle-outline"
          iconColor={colors.error}
          title={t('settings.radio.stopOnClose')}
          subtitle={t('settings.radio.stopOnCloseDesc')}
          colors={colors}
          value={radioSettings?.stopOnClose ?? false}
          onValueChange={(value) => updateRadioSetting('stopOnClose', value)}
          disabled={radioSettingsLoading}
          isLast
        />
      </View>
    </View>
  );
}

function PremiumSection({
  colors,
  isPremium,
  isLoading,
  price,
  isProcessing,
  onPurchase,
  onRestore,
  dynamicStyles,
}: {
  colors: ThemeColors;
  isPremium: boolean;
  isLoading: boolean;
  price: string | null;
  isProcessing: boolean;
  onPurchase: () => void;
  onRestore: () => void;
  dynamicStyles: ReturnType<typeof createDynamicStyles>;
}) {
  const { t } = useTranslation();
  return (
    <View style={dynamicStyles.section}>
      <Text style={dynamicStyles.sectionTitle}>{t('settings.premium.title')}</Text>
      <View style={dynamicStyles.premiumCard}>
        <View
          style={[
            dynamicStyles.premiumBadge,
            { backgroundColor: isPremium ? colors.success : colors.secondary },
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
            <Text style={dynamicStyles.premiumTitle}>{t('settings.premium.youArePremium')}</Text>
            <Text style={dynamicStyles.premiumDescription}>{t('settings.premium.thankYou')}</Text>
          </>
        ) : (
          <>
            <Text style={dynamicStyles.premiumTitle}>{t('settings.premium.removeAds')}</Text>
            <Text style={dynamicStyles.premiumDescription}>
              {t('settings.premium.removeAdsDesc')}
            </Text>
            <View style={dynamicStyles.priceTag}>
              <Text style={dynamicStyles.priceText}>{price ?? '...'}</Text>
              <Text style={dynamicStyles.priceSubtext}>{t('settings.premium.oneTimePayment')}</Text>
            </View>
            <TouchableOpacity
              style={[dynamicStyles.purchaseButton, { backgroundColor: colors.primary }]}
              onPress={onPurchase}
              disabled={isLoading || isProcessing}
              activeOpacity={0.8}
            >
              {isProcessing ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <MaterialCommunityIcons name="heart-outline" size={20} color={colors.white} />
                  <Text style={dynamicStyles.purchaseButtonText}>
                    {t('settings.premium.removeAds')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={dynamicStyles.restoreButton}
              onPress={onRestore}
              disabled={isLoading || isProcessing}
            >
              <Text style={dynamicStyles.restoreButtonText}>
                {t('settings.premium.restorePurchase')}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

function NotificationSection({
  colors,
  notificationPrefs,
  notificationLoading,
  setNotificationsEnabled,
  setReminderMinutes,
  dynamicStyles,
}: {
  colors: ThemeColors;
  notificationPrefs: ReturnType<typeof useNotifications>['preferences'];
  notificationLoading: boolean;
  setNotificationsEnabled: ReturnType<typeof useNotifications>['setEnabled'];
  setReminderMinutes: ReturnType<typeof useNotifications>['setReminderMinutes'];
  dynamicStyles: ReturnType<typeof createDynamicStyles>;
}) {
  const { t } = useTranslation();
  return (
    <View style={dynamicStyles.section}>
      <Text style={dynamicStyles.sectionTitle}>{t('notifications.programReminders')}</Text>
      <View style={dynamicStyles.menuCard}>
        <SettingRow
          icon="bell-outline"
          iconColor={colors.secondary}
          title={t('notifications.programReminders')}
          subtitle={t('notifications.receiveNotifications')}
          colors={colors}
          value={notificationPrefs.enabled}
          onValueChange={setNotificationsEnabled}
          disabled={notificationLoading}
        />
        {notificationPrefs.enabled && (
          <View
            style={[
              styles.reminderTimeRow,
              { borderTopColor: colors.background, borderTopWidth: 1 },
            ]}
          >
            <View style={styles.reminderTimeHeader}>
              <MaterialCommunityIcons name="clock-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.reminderTimeLabel, { color: colors.text }]}>
                {t('notifications.warnBefore')}
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
              <MaterialCommunityIcons name="earth" size={14} color={colors.textSecondary} />
              <Text style={[styles.timezoneInfoText, { color: colors.textSecondary }]}>
                {t('notifications.timezoneInfo')}
              </Text>
            </View>
            {Platform.OS === 'android' && (
              <View style={styles.timezoneInfo}>
                <MaterialCommunityIcons name="alarm-bell" size={14} color={colors.textSecondary} />
                <View style={styles.androidAlarmInfoContent}>
                  <Text style={[styles.timezoneInfoText, { color: colors.textSecondary }]}>
                    {t('notifications.androidExactAlarmInfo')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Linking.openSettings().catch((err) =>
                        logger.error('Error opening system settings:', err)
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('notifications.openSystemSettings')}
                  >
                    <Text style={[styles.androidAlarmInfoLink, { color: colors.secondary }]}>
                      {t('notifications.openSystemSettings')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
      {notificationPrefs.enabled && notificationPrefs.enabledShows.length > 0 && (
        <View style={[dynamicStyles.menuCard, { marginTop: 10 }]}>
          <View style={styles.enabledShowsHeader}>
            <Text style={[styles.enabledShowsTitle, { color: colors.textSecondary }]}>
              {t('notifications.activePrograms')}
            </Text>
          </View>
          {/* Cap the list at ~6 visible rows; long lists scroll inside the card. */}
          <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled showsVerticalScrollIndicator>
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
                <Text style={[styles.enabledShowName, { color: colors.text }]}>{show}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function BrandInstructions({
  brand,
  steps,
  colors,
  isLast,
}: {
  brand: string;
  steps: string;
  colors: ThemeColors;
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      style={[
        {
          padding: 14,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: colors.background,
        },
      ]}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          style={[
            { fontSize: 15, fontWeight: '500' as const },
            { color: colors.text, flex: 1 },
          ]}
        >
          {brand}
        </Text>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </View>
      {expanded && (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 13,
            marginTop: 8,
            lineHeight: 19,
          }}
        >
          {steps}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function TroubleshootingSection({
  colors,
  dynamicStyles,
}: {
  colors: ThemeColors;
  dynamicStyles: ReturnType<typeof createDynamicStyles>;
}) {
  const { t } = useTranslation();
  const [batteryOptimized, setBatteryOptimized] = useState<boolean | null>(null);

  const checkBatteryOptimization = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const { PowerManagerModule } = NativeModules;
      if (PowerManagerModule?.isIgnoringBatteryOptimizations) {
        const isIgnoring = await PowerManagerModule.isIgnoringBatteryOptimizations();
        setBatteryOptimized(!isIgnoring);
      }
    } catch {
      // Module not available — leave as null (unknown)
    }
  }, []);

  useEffect(() => {
    checkBatteryOptimization();
  }, [checkBatteryOptimization]);

  const handleDisableBatteryOptimization = useCallback(async () => {
    try {
      await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    } catch {
      try {
        await Linking.openSettings();
      } catch {
        // Best effort
      }
    }
  }, []);

  const brands = [
    {
      key: 'xiaomi',
      brand: t('settings.troubleshooting.xiaomi'),
      steps: t('settings.troubleshooting.xiaomiSteps'),
    },
    {
      key: 'samsung',
      brand: t('settings.troubleshooting.samsung'),
      steps: t('settings.troubleshooting.samsungSteps'),
    },
    {
      key: 'huawei',
      brand: t('settings.troubleshooting.huawei'),
      steps: t('settings.troubleshooting.huaweiSteps'),
    },
    {
      key: 'oppo',
      brand: t('settings.troubleshooting.oppo'),
      steps: t('settings.troubleshooting.oppoSteps'),
    },
    {
      key: 'other',
      brand: t('settings.troubleshooting.other'),
      steps: t('settings.troubleshooting.otherSteps'),
    },
  ];

  return (
    <View style={dynamicStyles.section}>
      <Text style={dynamicStyles.sectionTitle}>{t('settings.troubleshooting.title')}</Text>

      {Platform.OS === 'android' && (
        <View style={dynamicStyles.menuCard}>
          <View style={{ padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <MaterialCommunityIcons
                name="battery-alert-variant-outline"
                size={22}
                color={colors.primary}
              />
              <Text
                style={[
                  { fontSize: 15, fontWeight: '500' as const },
                  { color: colors.text, marginLeft: 10 },
                ]}
              >
                {t('settings.troubleshooting.batteryTitle')}
              </Text>
            </View>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                lineHeight: 19,
                marginBottom: 12,
              }}
            >
              {t('settings.troubleshooting.batteryDesc')}
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: batteryOptimized === false ? colors.muted : colors.primary,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: 'center',
              }}
              onPress={handleDisableBatteryOptimization}
              disabled={batteryOptimized === false}
              activeOpacity={0.8}
            >
              <Text
                style={{
                  color: batteryOptimized === false ? colors.text : '#FFFFFF',
                  fontWeight: '600',
                  fontSize: 14,
                }}
              >
                {batteryOptimized === false
                  ? `✓ ${t('settings.troubleshooting.batteryDone')}`
                  : t('settings.troubleshooting.batteryButton')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={[dynamicStyles.menuCard, { marginTop: 12 }]}>
        <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <MaterialCommunityIcons name="cellphone-cog" size={22} color={colors.primary} />
            <Text
              style={[
                { fontSize: 15, fontWeight: '500' as const },
                { color: colors.text, marginLeft: 10 },
              ]}
            >
              {t('settings.troubleshooting.brandTitle')}
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {t('settings.troubleshooting.brandDesc')}
          </Text>
        </View>
        {brands.map((b, i) => (
          <BrandInstructions
            key={b.key}
            brand={b.brand}
            steps={b.steps}
            colors={colors}
            isLast={i === brands.length - 1}
          />
        ))}
      </View>

      <View style={[dynamicStyles.menuCard, { marginTop: 12 }]}>
        <View style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <MaterialCommunityIcons name="lock-outline" size={22} color={colors.primary} />
            <Text
              style={[
                { fontSize: 15, fontWeight: '500' as const },
                { color: colors.text, marginLeft: 10 },
              ]}
            >
              {t('settings.troubleshooting.lockApp')}
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {t('settings.troubleshooting.lockAppDesc')}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={{ marginTop: 12, alignItems: 'center', padding: 8 }}
        onPress={() => Linking.openURL(t('settings.troubleshooting.moreInfoUrl'))}
        activeOpacity={0.7}
      >
        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '500' }}>
          {t('settings.troubleshooting.moreInfo')} — dontkillmyapp.com
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function AboutSection({
  colors,
  dynamicStyles,
  onOpenAboutRadio,
}: {
  colors: ThemeColors;
  dynamicStyles: ReturnType<typeof createDynamicStyles>;
  onOpenAboutRadio: () => void;
}) {
  const { t } = useTranslation();
  const version = Constants.expoConfig?.version ?? '—';
  const currentYear = new Date().getFullYear();

  return (
    <View style={dynamicStyles.section}>
      <Text style={dynamicStyles.sectionTitle}>{t('settings.about.title')}</Text>
      <View style={dynamicStyles.aboutCard}>
        <MaterialCommunityIcons name="radio" size={40} color={colors.primary} />
        <Text style={[dynamicStyles.aboutTitle, { marginTop: 16 }]}>Olha que Duas</Text>
        <Text style={[dynamicStyles.aboutText, { marginTop: 4 }]}>
          {t('settings.about.appTagline')}
        </Text>

        <View style={dynamicStyles.versionBlock}>
          <Text style={[dynamicStyles.versionMain, { color: colors.text }]}>
            {t('common.version', { version })}
          </Text>
        </View>

        <TouchableOpacity
          style={[dynamicStyles.aboutRadioButton, { backgroundColor: colors.primary }]}
          onPress={onOpenAboutRadio}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('settings.about.openAboutRadio')}
        >
          <MaterialCommunityIcons name="radio" size={20} color={colors.white} />
          <Text style={dynamicStyles.aboutRadioButtonText}>
            {t('settings.about.openAboutRadio')}
          </Text>
        </TouchableOpacity>

        <Text style={[dynamicStyles.copyrightText, { color: colors.textSecondary }]}>
          {t('settings.about.copyright', { year: currentYear })}
        </Text>
      </View>
    </View>
  );
}

// --- Main Screen ---

export function SettingsScreen() {
  const { t } = useTranslation();
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const { isPremium, isLoading, purchasePremium, restorePurchases } = usePremium();
  const [currentLang, setCurrentLang] = useState<LanguageCode>(getCurrentLanguage());
  const {
    settings: radioSettings,
    updateSetting: updateRadioSetting,
    isLoading: radioSettingsLoading,
  } = useRadioSettings();
  const {
    preferences: notificationPrefs,
    isLoading: notificationLoading,
    setEnabled: setNotificationsEnabled,
    setReminderMinutes,
  } = useNotifications();
  const [price, setPrice] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [adsConsentStatus, setAdsConsentStatus] = useState<string | null>(null);
  const [showAboutSheet, setShowAboutSheet] = useState(false);

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
      Alert.alert(t('purchase.unavailable.title'), t('purchase.unavailable.message'), [
        { text: t('common.ok') },
      ]);
      return;
    }
    setIsProcessing(true);
    const success = await purchasePremium();
    Alert.alert(
      success ? t('purchase.success.title') : t('purchase.error.title'),
      success ? t('purchase.success.message') : t('purchase.error.message'),
      [{ text: t('common.ok') }]
    );
    setIsProcessing(false);
  }

  async function handleRestore() {
    if (!environment.features.purchases) {
      Alert.alert(t('purchase.unavailable.title'), t('purchase.unavailable.message'), [
        { text: t('common.ok') },
      ]);
      return;
    }
    setIsProcessing(true);
    const success = await restorePurchases();
    Alert.alert(
      success ? t('purchase.restored.title') : t('purchase.notFound.title'),
      success ? t('purchase.restored.message') : t('purchase.notFound.message'),
      [{ text: t('common.ok') }]
    );
    setIsProcessing(false);
  }

  async function handleResetAdsConsent() {
    Alert.alert(t('consent.reset.title'), t('consent.reset.message'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('consent.reset.button'),
        onPress: async () => {
          await resetGDPRConsent();
          setAdsConsentStatus(null);
          Alert.alert(t('consent.resetSuccess.title'), t('consent.resetSuccess.message'), [
            { text: t('common.ok') },
          ]);
        },
      },
    ]);
  }

  function getConsentLabel() {
    if (adsConsentStatus === 'personalized') return t('consent.personalized');
    if (adsConsentStatus === 'non_personalized') return t('consent.nonPersonalized');
    return t('consent.notSet');
  }

  async function handleLanguageChange(lang: LanguageCode) {
    await changeLanguage(lang);
    setCurrentLang(lang);
  }

  function handleExitApp() {
    if (Platform.OS === 'android') {
      Alert.alert(t('exitApp.android.title'), t('exitApp.android.message'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('exitApp.android.button'), onPress: () => BackHandler.exitApp() },
      ]);
    } else {
      Alert.alert(t('exitApp.ios.title'), t('exitApp.ios.message'), [{ text: t('common.ok') }]);
    }
  }

  const dynamicStyles = useMemo(() => createDynamicStyles(colors, isDark), [colors, isDark]);

  return (
    <SafeAreaView style={dynamicStyles.container} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <View style={dynamicStyles.header}>
        <Text style={dynamicStyles.headerTitle}>{t('settings.title')}</Text>
      </View>
      <ScrollView style={dynamicStyles.content} showsVerticalScrollIndicator={false}>
        <AppearanceSection
          colors={colors}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          dynamicStyles={dynamicStyles}
        />
        <LanguageSection
          colors={colors}
          currentLang={currentLang}
          onLanguageChange={handleLanguageChange}
          dynamicStyles={dynamicStyles}
        />
        <RadioSection
          colors={colors}
          radioSettings={radioSettings}
          radioSettingsLoading={radioSettingsLoading}
          updateRadioSetting={updateRadioSetting}
          dynamicStyles={dynamicStyles}
        />
        <PremiumSection
          colors={colors}
          isPremium={isPremium}
          isLoading={isLoading}
          price={price}
          isProcessing={isProcessing}
          onPurchase={handlePurchase}
          onRestore={handleRestore}
          dynamicStyles={dynamicStyles}
        />

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>{t('settings.privacy.title')}</Text>
          <View style={dynamicStyles.menuCard}>
            {!isPremium && (
              <MenuItem
                icon="eye-outline"
                title={t('settings.privacy.adPreferences')}
                subtitle={getConsentLabel()}
                colors={colors}
                onPress={handleResetAdsConsent}
              />
            )}
            <MenuItem
              icon="shield-check-outline"
              title={t('settings.privacy.privacyPolicy')}
              colors={colors}
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              showExternal
            />
            <MenuItem
              icon="file-document-outline"
              title={t('settings.privacy.termsOfUse')}
              colors={colors}
              onPress={() => Linking.openURL(TERMS_URL)}
              showExternal
              isLast
            />
          </View>
        </View>

        <NotificationSection
          colors={colors}
          notificationPrefs={notificationPrefs}
          notificationLoading={notificationLoading}
          setNotificationsEnabled={setNotificationsEnabled}
          setReminderMinutes={setReminderMinutes}
          dynamicStyles={dynamicStyles}
        />
        <TroubleshootingSection colors={colors} dynamicStyles={dynamicStyles} />
        <AboutSection
          colors={colors}
          dynamicStyles={dynamicStyles}
          onOpenAboutRadio={() => setShowAboutSheet(true)}
        />

        <View style={dynamicStyles.section}>
          <Text style={dynamicStyles.sectionTitle}>{t('settings.app.title')}</Text>
          <View style={dynamicStyles.menuCard}>
            <MenuItem
              icon="exit-to-app"
              title={t('settings.app.exitApp')}
              subtitle={
                Platform.OS === 'android'
                  ? t('settings.app.exitAppAndroid')
                  : t('settings.app.exitAppIOS')
              }
              colors={colors}
              onPress={handleExitApp}
              isLast
            />
          </View>
        </View>

        {environment.isDevelopment && (
          <View style={dynamicStyles.section}>
            <Text style={dynamicStyles.sectionTitle}>{t('settings.debug.title')}</Text>
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
                value={environment.features.purchases ? 'Activo' : 'Desactivado'}
                colors={colors}
              />
              <DebugRow label="Theme Mode" value={themeMode} colors={colors} />
              <DebugRow label="Is Dark" value={isDark ? 'Sim' : 'Não'} colors={colors} />
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <AboutBottomSheet visible={showAboutSheet} onClose={() => setShowAboutSheet(false)} />
    </SafeAreaView>
  );
}

function DebugRow({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) {
  return (
    <View style={styles.debugRow}>
      <Text style={[styles.debugLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.debugValue, { color: colors.text }]}>{value}</Text>
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
    borderTopColor: 'rgba(128,128,128,0.15)',
  },
  timezoneInfoText: {
    fontSize: 11,
    flex: 1,
  },
  androidAlarmInfoContent: {
    flex: 1,
    flexDirection: 'column',
    gap: 4,
  },
  androidAlarmInfoLink: {
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
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

function createDynamicStyles(colors: ThemeColors, _isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.muted,
    },
    headerTitle: { color: colors.text, fontSize: 28, fontWeight: 'bold' },
    content: { flex: 1, padding: 16 },
    section: { marginBottom: 24 },
    sectionTitle: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      marginBottom: 10,
      marginLeft: 4,
      letterSpacing: 0.5,
    },
    themeCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16 },
    themeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 },
    themeHeaderText: { color: colors.text, fontSize: 16, fontWeight: '600' },
    themeOptions: { flexDirection: 'row', gap: 10 },
    menuCard: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden' },
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
    priceText: { color: colors.secondary, fontSize: 28, fontWeight: 'bold' },
    priceSubtext: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
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
    purchaseButtonText: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
    restoreButton: { marginTop: 16, padding: 12 },
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
    aboutTitle: { color: colors.text, fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
    aboutText: {
      color: colors.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
    },
    versionBlock: {
      alignItems: 'center',
      marginTop: 20,
      marginBottom: 20,
    },
    versionMain: {
      fontSize: 14,
      fontWeight: '700',
    },
    aboutRadioButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 25,
      gap: 8,
      alignSelf: 'stretch',
    },
    aboutRadioButtonText: { color: colors.white, fontSize: 15, fontWeight: '600' },
    copyrightText: {
      fontSize: 11,
      marginTop: 16,
    },
    debugCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16 },
  });
}
