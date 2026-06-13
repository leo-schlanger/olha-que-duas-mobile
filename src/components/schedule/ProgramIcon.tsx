/**
 * Ícone/artwork de um programa, com fallback robusto.
 *
 * Tenta carregar a imagem remota (`iconUrl`); se estiver ausente, for um
 * placeholder (placehold.co) ou falhar, mostra um ícone MaterialCommunity
 * mapeado pelo nome do programa. Partilhado entre a aba Programação e a
 * secção diária do RadioPlayer.
 */

import React, { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ThemeColors } from '../../context/ThemeContext';

export const FALLBACK_PROGRAM_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> =
  {
    Nutrição: 'leaf',
    Motivar: 'lightbulb-on-outline',
    'Prazer Feminino': 'heart-outline',
    'Companheiros de Caminho': 'walk',
    'Companheiros de Caminhada': 'walk',
    'Dizem que...': 'chat-outline',
    'Olha que Duas!': 'account-group',
    'Céu de cada mês': 'star-outline',
  };

interface ProgramIconProps {
  name: string;
  iconUrl: string;
  size: number;
  colors: ThemeColors;
}

export function ProgramIcon({ name, iconUrl, size, colors }: ProgramIconProps) {
  const [errored, setErrored] = useState(false);
  const hasUrl = iconUrl && !iconUrl.includes('placehold.co');
  const fallbackIcon =
    FALLBACK_PROGRAM_ICONS[name] || ('radio' as keyof typeof MaterialCommunityIcons.glyphMap);

  if (!hasUrl || errored) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          backgroundColor: colors.secondary + '20',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name={fallbackIcon} size={size * 0.55} color={colors.secondary} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: iconUrl }}
      style={{ width: size, height: size, borderRadius: 8 }}
      contentFit="cover"
      cachePolicy="memory-disk"
      onError={() => setErrored(true)}
    />
  );
}
