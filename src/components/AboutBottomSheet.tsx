import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { useSchedule } from '../hooks/useSchedule';
import { siteConfig } from '../config/site';

interface AboutBottomSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AboutBottomSheet({ visible, onClose }: AboutBottomSheetProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { schedule, loading: scheduleLoading } = useSchedule();
  const insets = useSafeAreaInsets();

  function openLink(url: string) {
    Linking.openURL(url);
  }

  const styles = createStyles(colors, isDark, insets.top);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />

        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="radio" size={28} color={colors.primary} />
              <Text style={styles.headerTitle}>{t('settings.about.aboutRadio')}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel={t('common.close')}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentContainer}
          >
            {/* Description */}
            <Text style={styles.description}>{t('settings.about.description')}</Text>

            {/* Schedule */}
            <View style={styles.scheduleCard}>
              <View style={styles.scheduleHeader}>
                <MaterialCommunityIcons name="calendar-clock" size={20} color={colors.secondary} />
                <Text style={styles.scheduleTitle}>{t('settings.about.featuredPrograms')}</Text>
              </View>

              {scheduleLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={colors.secondary} />
                </View>
              ) : (
                schedule.map((item, index) => (
                  <View
                    key={`${item.day}-${item.show}`}
                    style={[
                      styles.scheduleRow,
                      index === schedule.length - 1 && styles.scheduleRowLast,
                    ]}
                  >
                    <Text style={styles.scheduleDay}>{item.day}</Text>
                    <Text style={styles.scheduleShow}>{item.show}</Text>
                    <Text style={styles.scheduleTimes}>{item.times.join(' / ')}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Community text */}
            <Text style={styles.communityText}>{t('radio.social.communityText')}</Text>

            {/* Website Button */}
            <TouchableOpacity
              style={styles.websiteButton}
              onPress={() => openLink('https://olhaqueduas.com')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="web" size={20} color={colors.white} />
              <Text style={styles.websiteButtonText}>{t('radio.social.visitWebsite')}</Text>
            </TouchableOpacity>

            {/* Social Links */}
            <View style={styles.socialSection}>
              <Text style={styles.socialTitle}>{t('radio.social.followOnSocial')}</Text>
              <View style={styles.socialLinks}>
                <TouchableOpacity
                  style={[styles.socialButton, { backgroundColor: '#E4405F' }]}
                  onPress={() => openLink(siteConfig.social.instagram)}
                >
                  <MaterialCommunityIcons name="instagram" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.socialButton, { backgroundColor: '#1877F2' }]}
                  onPress={() => openLink(siteConfig.social.facebook)}
                >
                  <MaterialCommunityIcons name="facebook" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.socialButton, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
                  onPress={() => openLink(siteConfig.social.tiktok)}
                >
                  <MaterialCommunityIcons
                    name="music-note"
                    size={22}
                    color={isDark ? '#000000' : '#FFFFFF'}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.socialButton, { backgroundColor: '#FF0000' }]}
                  onPress={() => openLink(siteConfig.social.youtube)}
                >
                  <MaterialCommunityIcons name="youtube" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Contact */}
            <TouchableOpacity
              style={styles.contactRow}
              onPress={() => openLink(`mailto:${siteConfig.contact.email}`)}
            >
              <MaterialCommunityIcons name="email-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.contactText}>{siteConfig.contact.email}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean, insetTop: number) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    backdrop: {
      height: insetTop + 20,
    },
    sheet: {
      flex: 1,
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: 30,
    },
    handleContainer: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.muted,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.muted,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    closeButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      flexGrow: 1,
      flexShrink: 1,
    },
    contentContainer: {
      padding: 20,
      paddingBottom: 40,
    },
    description: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.text,
      marginBottom: 20,
    },
    scheduleCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.muted,
    },
    scheduleHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16,
    },
    scheduleTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    loadingContainer: {
      padding: 20,
      alignItems: 'center',
    },
    scheduleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.muted,
    },
    scheduleRowLast: {
      borderBottomWidth: 0,
    },
    scheduleDay: {
      width: 70,
      fontSize: 12,
      fontWeight: '700',
      color: colors.secondary,
    },
    scheduleShow: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    scheduleTimes: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    communityText: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginBottom: 24,
    },
    websiteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 25,
      gap: 8,
      marginBottom: 24,
    },
    websiteButtonText: {
      color: colors.white,
      fontSize: 15,
      fontWeight: '600',
    },
    socialSection: {
      alignItems: 'center',
      marginBottom: 24,
    },
    socialTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 12,
    },
    socialLinks: {
      flexDirection: 'row',
      gap: 12,
    },
    socialButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    contactText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
  });
}
