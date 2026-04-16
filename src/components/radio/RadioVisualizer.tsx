/**
 * Audio visualizer component for radio playback.
 *
 * Performance critical: this lives next to the audio decoder, so any
 * JS-thread work (Animated.timing scheduling, intervals, callbacks) costs
 * the listener — the JS bridge is the same thread that handles audio
 * lifecycle calls. We use ONE `Animated.Value` driven by `Animated.loop`
 * with the native driver. Each bar's scaleY is an `interpolate()` with a
 * unique phase shift over a fixed pseudo-random pattern. Result: after the
 * single `Animated.loop().start()` call, animation runs 100% on the native
 * thread at 60fps with zero JS work — even the heights are computed
 * natively. Compare to the previous setInterval+Animated.timing approach
 * that was emitting 30+ JS scheduling calls per second.
 */

import React, { memo, useEffect, useRef, useMemo, useState } from 'react';
import { View, Animated, AccessibilityInfo, AppState, AppStateStatus } from 'react-native';
import { RadioVisualizerProps } from './types';
import { createVisualizerStyles } from './styles/radioStyles';

const BAR_COUNT = 7;
// Loop duration controls the perceived "speed" of the visualizer. 1500ms
// is fast enough to look responsive, slow enough to avoid feeling chaotic.
const LOOP_DURATION_MS = 1500;
// Number of keyframes per bar. More keyframes = more visual variation per
// loop, at the cost of a slightly larger interpolation table. 12 is a
// good sweet spot.
const KEYFRAMES = 12;
// Pseudo-random heights used for each bar. Generated once at module load
// and reused — produces deterministic, consistent visual rhythm. Each bar
// gets the same array but offset by `i / BAR_COUNT` to look out of sync.
const PATTERNS: number[][] = (() => {
  const seed = (n: number) => {
    // Simple LCG for reproducible per-bar patterns
    let s = (n + 1) * 9301 + 49297;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  };
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const rng = seed(i);
    return Array.from({ length: KEYFRAMES + 1 }, () => 0.2 + rng() * 0.8);
  });
})();
// 0..1 keyframe positions, evenly spaced.
const KEY_POSITIONS = Array.from({ length: KEYFRAMES + 1 }, (_, i) => i / KEYFRAMES);

export const RadioVisualizer = memo(function RadioVisualizer({
  isPlaying,
  colors,
}: RadioVisualizerProps) {
  // Single driver value — loops 0 → 1 → 0 → 1 ... entirely on native side.
  const driver = useRef(new Animated.Value(0)).current;
  // Idle scale used when not playing — separate so we can transition smoothly.
  const idleScale = useRef(new Animated.Value(0.2)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  // Pause the loop when the app is backgrounded. The lock screen doesn't
  // show the visualizer and burning native cycles to animate something
  // nobody can see is a waste of battery (even with native driver).
  const [isForeground, setIsForeground] = useState(() => AppState.currentState === 'active');

  const styles = useMemo(() => createVisualizerStyles(colors), [colors]);

  // Per-bar animated scales — derived from the driver via interpolate, so
  // they update natively whenever the driver advances. Memoized to keep
  // referential stability across renders.
  const barScales = useMemo(
    () =>
      PATTERNS.map((pattern, i) => {
        // Phase-shift the input range so adjacent bars look offset.
        const phase = i / BAR_COUNT;
        const inputRange = KEY_POSITIONS.map((p) => (p + phase) % 1).sort((a, b) => a - b);
        // Re-order the output range to match the sorted input range.
        const indexedPattern = KEY_POSITIONS.map((p, idx) => ({
          p: (p + phase) % 1,
          v: pattern[idx],
        })).sort((a, b) => a.p - b.p);
        const outputRange = indexedPattern.map((entry) => entry.v);
        return driver.interpolate({ inputRange, outputRange });
      }),
    [driver]
  );

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
    // Stop any in-flight loop. We rebuild it whenever the driver's animated
    // state needs to change — much rarer than per-tick scheduling.
    loopRef.current?.stop();
    loopRef.current = null;

    const shouldAnimate = isPlaying && isForeground && !reduceMotion;

    if (shouldAnimate) {
      driver.setValue(0);
      const loop = Animated.loop(
        Animated.timing(driver, {
          toValue: 1,
          duration: LOOP_DURATION_MS,
          useNativeDriver: true,
        }),
        { resetBeforeIteration: true }
      );
      loopRef.current = loop;
      loop.start();
    } else if (isPlaying && reduceMotion) {
      // Static "alive" pattern when reduce-motion is on — no animation.
      driver.setValue(0.5);
    } else {
      // Smooth fade back to idle.
      Animated.timing(idleScale, {
        toValue: 0.2,
        duration: 300,
        useNativeDriver: true,
      }).start();
      driver.setValue(0);
    }

    return () => {
      loopRef.current?.stop();
      loopRef.current = null;
    };
  }, [isPlaying, isForeground, reduceMotion, driver, idleScale]);

  return (
    <View style={styles.container}>
      {barScales.map((scale, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: isPlaying ? colors.secondary : colors.muted,
              transform: [{ scaleY: isPlaying ? scale : idleScale }],
            },
          ]}
        />
      ))}
    </View>
  );
});
