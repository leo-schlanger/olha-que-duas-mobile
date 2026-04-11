/**
 * RemindersBottomSheet
 *
 * Central panel for managing show reminders. Replaces the old Alert.alert
 * "list of active shows" flow that lived behind the bell next to the play
 * button. Lets the user:
 *   - See which shows have an active reminder
 *   - Remove individual reminders inline (with optimistic update)
 *   - Adjust the warn-before-start time without leaving the sheet
 *   - Disable all reminders at once
 *   - Jump to the schedule via an empty-state CTA when nothing is active
 */
import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { useTheme, ThemeColors } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { ReminderTime } from '../services/notificationService';

const REMINDER_OPTIONS: ReminderTime[] = [5, 15, 30, 60];

interface RemindersBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  enabledShows: string[];
  reminderMinutes: ReminderTime;
  isLoading: boolean;
  // Per-show metadata so we can show times next to the title.
  // Optional — if a show isn't in the map we just render its name.
  showTimesByName?: Map<string, string[]>;
  onRemoveShow: (_show: string) => Promise<boolean>;
  onChangeReminderMinutes: (_minutes: ReminderTime) => Promise<boolean>;
  onDisableAll: () => Promise<boolean>;
}

export const RemindersBottomSheet = memo(function RemindersBottomSheet({
  visible,
  onClose,
  enabledShows,
  reminderMinutes,
  isLoading,
  showTimesByName,
  onRemoveShow,
  onChangeReminderMinutes,
  onDisableAll,
}: RemindersBottomSheetProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [confirmingDisableAll, setConfirmingDisableAll] = useState(false);
  // Per-show in-flight flag so the user can still tap "remove" on a different
  // row even while another removal is processing.
  const [removingShows, setRemovingShows] = useState<Set<string>>(new Set());

  const styles = useMemo(
    () => createStyles(colors, isDark, insets.top, insets.bottom),
    [colors, isDark, insets.top, insets.bottom]
  );

  const count = enabledShows.length;

  const handleRemove = useCallback(
    async (show: string) => {
      setRemovingShows((prev) => {
        const next = new Set(prev);
        next.add(show);
        return next;
      });
      try {
        const ok = await onRemoveShow(show);
        if (!ok) {
          toast.show(t('notifications.toggleError'), { variant: 'error' });
        }
      } finally {
        setRemovingShows((prev) => {
          const next = new Set(prev);
          next.delete(show);
          return next;
        });
      }
    },
    [onRemoveShow, toast, t]
  );

  const handleChangeMinutes = useCallback(
    async (minutes: ReminderTime) => {
      const ok = await onChangeReminderMinutes(minutes);
      if (!ok) {
        toast.show(t('notifications.toggleError'), { variant: 'error' });
      }
    },
    [onChangeReminderMinutes, toast, t]
  );

  const handleConfirmDisableAll = useCallback(async () => {
    setConfirmingDisableAll(false);
    const ok = await onDisableAll();
    if (!ok) {
      toast.show(t('notifications.toggleError'), { variant: 'error' });
    }
  }, [onDisableAll, toast, t]);

  // Reset confirmation state whenever the sheet hides so reopening starts fresh
  React.useEffect(() => {
    if (!visible) {
      setConfirmingDisableAll(false);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          onPress={onClose}
          activeOpacity={1}
          accessibilityLabel={t('common.close')}
          accessibilityRole="button"
        />

        <View style={styles.sheet}>
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <MaterialCommunityIcons
                  name={count > 0 ? 'bell-ring' : 'bell-outline'}
                  size={24}
                  color={colors.secondary}
                />
              </View>
              <View>
                <Text style={styles.headerTitle}>{t('notifications.myReminders.title')}</Text>
                {count > 0 ? (
                  <Text style={styles.headerSubtitle}>
                    {t('notifications.myReminders.subtitle', { count })}
                  </Text>
                ) : null}
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel={t('common.close')}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Reminder time selector — always visible so the user can adjust ahead of time */}
            <View style={styles.timeSection}>
              <View style={styles.timeSectionHeader}>
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={styles.timeSectionLabel}>
                  {t('notifications.myReminders.warnBefore')}
                </Text>
              </View>
              <View style={styles.timeChips}>
                {REMINDER_OPTIONS.map((minutes) => {
                  const selected = reminderMinutes === minutes;
                  return (
                    <TouchableOpacity
                      key={minutes}
                      style={[
                        styles.timeChip,
                        selected && {
                          backgroundColor: colors.secondary,
                          borderColor: colors.secondary,
                        },
                      ]}
                      onPress={() => handleChangeMinutes(minutes)}
                      disabled={isLoading}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${minutes} ${t('notifications.warnBefore')}`}
                    >
                      <Text style={[styles.timeChipText, selected && { color: colors.white }]}>
                        {minutes < 60 ? `${minutes} min` : `1 h`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* List or empty state */}
            {count === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons
                  name="bell-sleep-outline"
                  size={56}
                  color={colors.textSecondary}
                />
                <Text style={styles.emptyTitle}>{t('notifications.myReminders.empty')}</Text>
                <Text style={styles.emptyHint}>{t('notifications.myReminders.emptyHint')}</Text>
              </View>
            ) : (
              <View style={styles.listSection}>
                {enabledShows.map((show) => {
                  const times = showTimesByName?.get(show) ?? [];
                  const isRemoving = removingShows.has(show);
                  return (
                    <View key={show} style={styles.row}>
                      <View style={styles.rowIconWrap}>
                        <MaterialCommunityIcons
                          name="bell-ring"
                          size={18}
                          color={colors.secondary}
                        />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="tail">
                          {show}
                        </Text>
                        {times.length > 0 ? (
                          <Text style={styles.rowSubtitle} numberOfLines={1}>
                            {times.join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => handleRemove(show)}
                        disabled={isRemoving}
                        accessibilityLabel={t('notifications.myReminders.remove', { show })}
                        accessibilityRole="button"
                      >
                        {isRemoving ? (
                          <ActivityIndicator size="small" color={colors.textSecondary} />
                        ) : (
                          <MaterialCommunityIcons
                            name="close-circle"
                            size={22}
                            color={colors.textSecondary}
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Disable-all footer (only when there's anything to disable) */}
            {count > 0 ? (
              <View style={styles.footer}>
                {confirmingDisableAll ? (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmText}>
                      {t('notifications.myReminders.disableAllConfirm')}
                    </Text>
                    <View style={styles.confirmButtons}>
                      <TouchableOpacity
                        style={[styles.confirmButton, styles.confirmButtonCancel]}
                        onPress={() => setConfirmingDisableAll(false)}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.confirmButtonText, { color: colors.text }]}>
                          {t('common.cancel')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.confirmButton, { backgroundColor: colors.primary }]}
                        onPress={handleConfirmDisableAll}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.confirmButtonText, { color: colors.white }]}>
                          {t('notifications.myReminders.disableAllConfirmYes')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.disableAllButton}
                    onPress={() => setConfirmingDisableAll(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('notifications.myReminders.disableAll')}
                  >
                    <MaterialCommunityIcons
                      name="bell-off-outline"
                      size={18}
                      color={colors.primary}
                    />
                    <Text style={[styles.disableAllText, { color: colors.primary }]}>
                      {t('notifications.myReminders.disableAll')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

function createStyles(colors: ThemeColors, isDark: boolean, insetTop: number, insetBottom: number) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    backdrop: {
      flex: 1,
      minHeight: insetTop + 40,
    },
    sheet: {
      maxHeight: '85%',
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: insetBottom + 16,
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
      flex: 1,
    },
    headerIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.secondary + (isDark ? '30' : '20'),
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      flexGrow: 0,
    },
    contentContainer: {
      padding: 16,
      paddingBottom: 8,
    },
    timeSection: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.muted,
      marginBottom: 16,
    },
    timeSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    timeSectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    timeChips: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    timeChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.muted,
      backgroundColor: colors.background,
      minWidth: 56,
      alignItems: 'center',
    },
    timeChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 32,
      paddingHorizontal: 24,
      gap: 12,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    emptyHint: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
    },
    listSection: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.muted,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.muted,
    },
    rowIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.secondary + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    rowSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      fontFamily: 'monospace',
    },
    removeButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: {
      marginTop: 16,
      paddingHorizontal: 4,
    },
    disableAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
    },
    disableAllText: {
      fontSize: 13,
      fontWeight: '600',
    },
    confirmRow: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.primary + '40',
      gap: 12,
    },
    confirmText: {
      fontSize: 13,
      color: colors.text,
      textAlign: 'center',
      fontWeight: '500',
    },
    confirmButtons: {
      flexDirection: 'row',
      gap: 8,
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
    },
    confirmButtonCancel: {
      backgroundColor: colors.muted,
    },
    confirmButtonText: {
      fontSize: 13,
      fontWeight: '600',
    },
  });
}
