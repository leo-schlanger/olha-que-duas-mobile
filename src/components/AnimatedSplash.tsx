import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, StyleSheet, Dimensions, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { colors } from '../config/site';

const { width, height } = Dimensions.get('window');

interface AnimatedSplashProps {
  isReady: boolean;
  onAnimationEnd: () => void;
}

export function AnimatedSplash({ isReady, onAnimationEnd }: AnimatedSplashProps) {
  const { t } = useTranslation();
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const ringScale1 = useRef(new Animated.Value(0.8)).current;
  const ringScale2 = useRef(new Animated.Value(0.8)).current;
  const ringOpacity1 = useRef(new Animated.Value(0.6)).current;
  const ringOpacity2 = useRef(new Animated.Value(0.4)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslate = useRef(new Animated.Value(20)).current;
  const dotsOpacity = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;
  const hasStartedExit = useRef(false);

  // Refs para armazenar animações e timeouts para cleanup adequado
  const animationsRef = useRef<Animated.CompositeAnimation[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Entrance animation
  useEffect(() => {
    const animations = animationsRef.current;
    const timeouts = timeoutsRef.current;

    // Logo entrance with bounce
    const entranceAnimation = Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 40,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(logoRotate, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]),
    ]);
    animations.push(entranceAnimation);
    entranceAnimation.start();

    // Pulse animation loop
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.05,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animations.push(pulseAnimation);
    pulseAnimation.start();

    // Expanding rings animation
    const ringLoopAnimation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.parallel([
            Animated.timing(ringScale1, {
              toValue: 2.5,
              duration: 2000,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(ringOpacity1, {
              toValue: 0,
              duration: 2000,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(ringScale1, { toValue: 0.8, duration: 0, useNativeDriver: true }),
            Animated.timing(ringOpacity1, { toValue: 0.6, duration: 0, useNativeDriver: true }),
          ]),
        ]),
        Animated.sequence([
          Animated.delay(500),
          Animated.parallel([
            Animated.timing(ringScale2, {
              toValue: 2.5,
              duration: 2000,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(ringOpacity2, {
              toValue: 0,
              duration: 2000,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(ringScale2, { toValue: 0.8, duration: 0, useNativeDriver: true }),
            Animated.timing(ringOpacity2, { toValue: 0.4, duration: 0, useNativeDriver: true }),
          ]),
        ]),
      ])
    );
    animations.push(ringLoopAnimation);
    ringLoopAnimation.start();

    // Tagline entrance
    const taglineTimeout = setTimeout(() => {
      const taglineAnimation = Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(taglineTranslate, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]);
      animations.push(taglineAnimation);
      taglineAnimation.start();
    }, 400);
    timeouts.push(taglineTimeout);

    // Loading dots
    const dotsTimeout = setTimeout(() => {
      const dotsOpacityAnimation = Animated.timing(dotsOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      });
      animations.push(dotsOpacityAnimation);
      dotsOpacityAnimation.start();

      const dotsLoopAnimation = Animated.loop(
        Animated.stagger(200, [
          Animated.sequence([
            Animated.timing(dot1, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(dot1, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(dot2, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(dot2, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(dot3, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(dot3, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]),
        ])
      );
      animations.push(dotsLoopAnimation);
      dotsLoopAnimation.start();
    }, 800);
    timeouts.push(dotsTimeout);

    return () => {
      // Limpar todos os timeouts
      timeouts.forEach((t) => clearTimeout(t));
      timeoutsRef.current = [];

      // Parar todas as animações
      animations.forEach((anim) => anim.stop());
      animationsRef.current = [];
    };
  }, []);

  // Exit animation when app is ready
  useEffect(() => {
    if (isReady && !hasStartedExit.current) {
      hasStartedExit.current = true;

      const exitDelay = setTimeout(() => {
        Animated.parallel([
          Animated.timing(logoScale, {
            toValue: 1.3,
            duration: 400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(fadeOut, {
            toValue: 0,
            duration: 500,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(() => {
          onAnimationEnd();
        });
      }, 500);

      return () => clearTimeout(exitDelay);
    }
  }, [isReady]);

  const rotateInterpolate = logoRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-10deg', '0deg'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <LinearGradient
        colors={['#f7f4ed', '#efe8da', '#e8dcc8']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Decorative circles in background */}
      <View style={styles.decorativeContainer}>
        <View style={[styles.decorativeCircle, styles.circle1]} />
        <View style={[styles.decorativeCircle, styles.circle2]} />
        <View style={[styles.decorativeCircle, styles.circle3]} />
      </View>

      {/* Expanding rings */}
      <Animated.View
        style={[
          styles.ring,
          {
            transform: [{ scale: ringScale1 }],
            opacity: ringOpacity1,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            transform: [{ scale: ringScale2 }],
            opacity: ringOpacity2,
          },
        ]}
      />

      {/* Logo with glow */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [
              { scale: Animated.multiply(logoScale, pulseScale) },
              { rotate: rotateInterpolate },
            ],
          },
        ]}
      >
        <View style={styles.logoShadow} />
        <Image
          source={require('../../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Tagline */}
      <Animated.View
        style={[
          styles.taglineContainer,
          {
            opacity: taglineOpacity,
            transform: [{ translateY: taglineTranslate }],
          },
        ]}
      >
        <Animated.Text style={styles.tagline}>{t('splash.tagline')}</Animated.Text>
      </Animated.View>

      {/* Loading dots */}
      <Animated.View style={[styles.dotsContainer, { opacity: dotsOpacity }]}>
        <Animated.View
          style={[
            styles.dot,
            { opacity: dot1.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            { opacity: dot2.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            { opacity: dot3.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  decorativeContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  decorativeCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: colors.secondary,
    opacity: 0.08,
  },
  circle1: {
    width: width * 0.8,
    height: width * 0.8,
    top: -width * 0.3,
    right: -width * 0.2,
  },
  circle2: {
    width: width * 0.6,
    height: width * 0.6,
    bottom: -width * 0.2,
    left: -width * 0.2,
  },
  circle3: {
    width: width * 0.4,
    height: width * 0.4,
    bottom: height * 0.3,
    right: -width * 0.15,
    backgroundColor: colors.primary,
    opacity: 0.05,
  },
  ring: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoShadow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.primary,
    opacity: 0.15,
    transform: [{ scale: 1.1 }],
  },
  logo: {
    width: 280,
    height: 280,
  },
  taglineContainer: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  tagline: {
    fontSize: 18,
    color: colors.charcoal,
    fontWeight: '600',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: 40,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.secondary,
  },
});
