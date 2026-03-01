import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useRadio } from '../hooks/useRadio';
import { colors } from '../config/site';

/**
 * Radio player component with play/pause controls and volume slider
 * Displays status indicator and audio quality information
 */
export function RadioPlayer() {
  const {
    isPlaying,
    isLoading,
    volume,
    radioName,
    radioTagline,
    togglePlayPause,
    setVolume,
  } = useRadio();

  return (
    <View style={styles.container}>
      {/* Status Badge */}
      <View style={styles.statusBadge}>
        <View style={[styles.statusDot, isPlaying && styles.statusDotActive]} />
        <Text style={styles.statusText}>
          {isPlaying ? 'No Ar' : 'Offline'}
        </Text>
      </View>

      {/* Radio Info */}
      <Text style={styles.radioName}>{radioName}</Text>
      <Text style={styles.tagline}>{radioTagline}</Text>

      {/* Play Button */}
      <TouchableOpacity
        style={[styles.playButton, isPlaying && styles.playButtonActive]}
        onPress={togglePlayPause}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.background} />
        ) : (
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={40}
            color={colors.background}
          />
        )}
      </TouchableOpacity>

      {/* Volume Control */}
      <View style={styles.volumeContainer}>
        <Ionicons
          name={volume === 0 ? 'volume-mute' : 'volume-low'}
          size={20}
          color={colors.textSecondary}
        />
        <Slider
          style={styles.volumeSlider}
          minimumValue={0}
          maximumValue={1}
          value={volume}
          onValueChange={setVolume}
          minimumTrackTintColor={colors.secondary}
          maximumTrackTintColor={colors.textSecondary}
          thumbTintColor={colors.secondary}
        />
        <Ionicons
          name="volume-high"
          size={20}
          color={colors.textSecondary}
        />
      </View>

      {/* Audio Visualizer (decorative) */}
      {isPlaying && (
        <View style={styles.visualizer}>
          {[...Array(12)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.visualizerBar,
                { height: Math.random() * 20 + 5 },
              ]}
            />
          ))}
        </View>
      )}

      {/* Info Cards */}
      <View style={styles.infoCards}>
        <View style={styles.infoCard}>
          <Ionicons name="musical-notes" size={24} color={colors.secondary} />
          <Text style={styles.infoCardTitle}>Alta Qualidade</Text>
          <Text style={styles.infoCardText}>192kbps</Text>
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="time" size={24} color={colors.secondary} />
          <Text style={styles.infoCardTitle}>Sempre no Ar</Text>
          <Text style={styles.infoCardText}>24/7</Text>
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="headset" size={24} color={colors.secondary} />
          <Text style={styles.infoCardTitle}>Background</Text>
          <Text style={styles.infoCardText}>Ativo</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textSecondary,
    marginRight: 8,
  },
  statusDotActive: {
    backgroundColor: colors.success,
  },
  statusText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  radioName: {
    color: colors.text,
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    shadowColor: colors.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  playButtonActive: {
    backgroundColor: colors.primary,
  },
  volumeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  volumeSlider: {
    flex: 1,
    marginHorizontal: 10,
  },
  visualizer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 30,
    marginBottom: 30,
  },
  visualizerBar: {
    width: 4,
    backgroundColor: colors.secondary,
    marginHorizontal: 2,
    borderRadius: 2,
  },
  infoCards: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  infoCard: {
    backgroundColor: colors.card,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
  },
  infoCardTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  infoCardText: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
});
