/**
 * Social media links and website button component
 */

import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { siteConfig } from '../../config/site';
import { SocialLinksProps } from './types';
import { createSocialStyles } from './styles/radioStyles';

export const SocialLinks = memo(function SocialLinks({
  colors,
  isDark,
  onOpenLink,
}: SocialLinksProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createSocialStyles(colors), [colors]);

  return (
    <>
      {/* Website Button */}
      <TouchableOpacity
        style={styles.websiteButton}
        onPress={() => onOpenLink('https://olhaqueduas.com')}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="web" size={20} color={colors.white} />
        <Text style={styles.websiteButtonText}>{t('radio.social.visitWebsite')}</Text>
      </TouchableOpacity>

      {/* Social Section */}
      <View style={styles.container}>
        <Text style={styles.title}>{t('radio.social.followUs')}</Text>
        <View style={styles.links}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#E4405F' }]}
            onPress={() => onOpenLink(siteConfig.social.instagram)}
          >
            <MaterialCommunityIcons name="instagram" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#1877F2' }]}
            onPress={() => onOpenLink(siteConfig.social.facebook)}
          >
            <MaterialCommunityIcons name="facebook" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
            onPress={() => onOpenLink(siteConfig.social.tiktok)}
          >
            <MaterialCommunityIcons
              name="music-note"
              size={22}
              color={isDark ? '#000000' : '#FFFFFF'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#FF0000' }]}
            onPress={() => onOpenLink(siteConfig.social.youtube)}
          >
            <MaterialCommunityIcons name="youtube" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.communityText}>{t('radio.social.communityText')}</Text>
      </View>
    </>
  );
});
