/**
 * Audio visualizer component for radio playback
 */

import React, { memo, useEffect, useRef, useMemo, useState } from 'react';
import { View, Animated, AccessibilityInfo, AppState, AppStateStatus } from 'react-native';
import { RadioVisualizerProps } from './types';
import { createVisualizerStyles } from './styles/radioStyles';

// Performance tuning: this used to be 12 bars at 150ms (≈80 animations/sec
// on the JS thread). On low-end Android that contributed to audio jank —
// every Animated.timing instance triggers a JS↔native bridge call even with
// useNativeDriver, because the native driver only takes over after the JS
// side schedules the animation. 7 bars at 220ms ≈ 32 anims/sec is enough
// to look "alive" without saturating the bridge.
const BAR_COUNT = 7;
const TICK_INTERVAL_MS = 220;
const TICK_DURATION_MS = 200;

export const RadioVisualizer = memo(function RadioVisualizer({
  isPlaying,
  colors,
}: RadioVisualizerProps) {
  const visualizerScales = useRef([...Array(BAR_COUNT)].map(() => new Animated.Value(0.2))).current;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  // Pause the animation loop when the app is backgrounded. The lock screen
  // doesn't show the visualizer and burning JS cycles to animate something
  // nobody can see is a waste of battery.
  const [isForeground, setIsForeground] = useState(() => AppState.currentState === 'active');

  const styles = useMemo(() => createVisualizerStyles(colors), [colors]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      setIsForeground(state === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Clear previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Stop all previous animations
    visualizerScales.forEach((scale) => scale.stopAnimation());

    const shouldAnimate = isPlaying && isForeground;

    if (shouldAnimate) {
      if (reduceMotion) {
        // Static bars at fixed heights when reduce motion is enabled
        visualizerScales.forEach((scale, i) => {
          scale.setValue(0.3 + (i % 3) * 0.2);
        });
      } else {
        intervalRef.current = setInterval(() => {
          visualizerScales.forEach((scale) => {
            Animated.timing(scale, {
              toValue: Math.random() * 0.8 + 0.2, // 0.2 to 1.0
              duration: TICK_DURATION_MS,
              useNativeDriver: true,
            }).start();
          });
        }, TICK_INTERVAL_MS);
      }
    } else {
      // Animate back to initial state
      visualizerScales.forEach((scale) => {
        Animated.timing(scale, {
          toValue: 0.2,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      visualizerScales.forEach((scale) => scale.stopAnimation());
    };
  }, [isPlaying, isForeground, reduceMotion, visualizerScales]);

  return (
    <View style={styles.container}>
      {visualizerScales.map((scale, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: isPlaying ? colors.secondary : colors.muted,
              transform: [{ scaleY: scale }],
            },
          ]}
        />
      ))}
    </View>
  );
});
