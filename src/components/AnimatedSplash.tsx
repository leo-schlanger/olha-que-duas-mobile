import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { colors } from '../config/site';

const { width } = Dimensions.get('window');

interface AnimatedSplashProps {
  isReady: boolean;
  onAnimationEnd: () => void;
}

export function AnimatedSplash({ isReady, onAnimationEnd }: AnimatedSplashProps) {
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const shimmerPosition = useRef(new Animated.Value(-width)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;
  const hasStartedExit = useRef(false);

  // Entrance animation
  useEffect(() => {
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      // Shimmer effect after logo appears
      Animated.timing(shimmerPosition, {
        toValue: width,
        duration: 800,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  // Exit animation when app is ready
  useEffect(() => {
    if (isReady && !hasStartedExit.current) {
      hasStartedExit.current = true;

      const exitDelay = setTimeout(() => {
        Animated.parallel([
          Animated.timing(logoScale, {
            toValue: 1.2,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(fadeOut, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onAnimationEnd();
        });
      }, 600);

      return () => clearTimeout(exitDelay);
    }
  }, [isReady]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <Image
          source={require('../../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Shimmer overlay */}
      <Animated.View
        style={[
          styles.shimmer,
          { transform: [{ translateX: shimmerPosition }] },
        ]}
      />

      <Animated.Text style={[styles.tagline, { opacity: logoOpacity }]}>
        A sua voz, 24 horas por dia
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 180,
    height: 180,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.15)',
    transform: [{ skewX: '-20deg' }],
  },
  tagline: {
    marginTop: 24,
    fontSize: 16,
    color: colors.charcoal,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
