/**
 * Info cards showing radio features (quality, 24/7, background)
 */

import React, { memo, useMemo } from 'react';
import { View, Text } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { RadioInfoCardsProps } from './types';
import { createInfoCardsStyles } from './styles/radioStyles';

interface InfoCard {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  titleKey: string;
  textKey: string;
}

const INFO_CARDS: InfoCard[] = [
  { icon: 'music', titleKey: 'radio.info.highQuality', textKey: 'radio.info.bitrate' },
  { icon: 'clock-outline', titleKey: 'radio.info.alwaysOn', textKey: 'radio.info.twentyFourSeven' },
  { icon: 'headphones', titleKey: 'radio.info.background', textKey: 'radio.info.active' },
];

export const RadioInfoCards = memo(function RadioInfoCards({ colors }: RadioInfoCardsProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => createInfoCardsStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {INFO_CARDS.map((card) => (
        <View key={card.icon} style={styles.card}>
          <MaterialCommunityIcons name={card.icon} size={24} color={colors.secondary} />
          <Text style={styles.title}>{t(card.titleKey)}</Text>
          <Text style={styles.text}>{t(card.textKey)}</Text>
        </View>
      ))}
    </View>
  );
});
