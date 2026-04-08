/**
 * Audio visualizer component for radio playback
 */

import React, { memo, useEffect, useRef, useMemo, useState } from 'react';
import { View, Animated, AccessibilityInfo } from 'react-native';
import { RadioVisualizerProps } from './types';
import { createVisualizerStyles } from './styles/radioStyles';

const BAR_COUNT = 12;

export const RadioVisualizer = memo(function RadioVisualizer({
  isPlaying,
  colors,
}: RadioVisualizerProps) {
  const visualizerScales = useRef([...Array(BAR_COUNT)].map(() => new Animated.Value(0.2))).current;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const styles = useMemo(() => createVisualizerStyles(colors), [colors]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
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

    if (isPlaying) {
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
              duration: 150,
              useNativeDriver: true,
            }).start();
          });
        }, 150);
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
  }, [isPlaying, reduceMotion, visualizerScales]);

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
