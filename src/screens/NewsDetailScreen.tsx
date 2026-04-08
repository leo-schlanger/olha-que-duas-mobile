import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Share,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { logger } from '../utils/logger';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { useNewsDetail } from '../hooks/useNews';
import { getCategoryColor, categoryLabels } from '../types/blog';
import { useTheme, getContrastTextColor } from '../context/ThemeContext';
import { InterstitialAdOverlay } from '../components/InterstitialAdOverlay';

const { width } = Dimensions.get('window');

type RootStackParamList = {
  NewsDetail: { slug: string };
};

type NewsDetailRouteProp = RouteProp<RootStackParamList, 'NewsDetail'>;

export function NewsDetailScreen() {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useTheme();
  const route = useRoute<NewsDetailRouteProp>();
  const navigation = useNavigation();
  const { slug } = route.params;
  const { post, isLoading, error } = useNewsDetail(slug);
  const [showAdOverlay, setShowAdOverlay] = useState(true);

  const formatDate = (dateString: string) => {
    const locale = i18n.language === 'en' ? 'en-US' : 'pt-PT';
    const date = new Date(dateString);
    return date.toLocaleDateString(locale, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleShare = async () => {
    if (!post) return;
    try {
      // URL do site oficial do Olha que Duas (com deep link para o app)
      const shareUrl = `https://www.olhaqueduas.com/noticias/${post.slug}`;
      await Share.share({
        title: post.title,
        message: `${post.title}\n\n${post.summary}\n\nLeia mais em: ${shareUrl}`,
        url: shareUrl, // iOS usa este campo separadamente
      });
    } catch (error) {
      logger.error('Error sharing:', error);
    }
  };

  const handleOpenSource = () => {
    if (post?.source_url) {
      const url = post.source_url;
      if (url.startsWith('https://') || url.startsWith('http://')) {
        Linking.openURL(url);
      }
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !post) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={60}
            color={colors.textSecondary}
          />
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            {error ? t(error) : t('news.notFound')}
          </Text>
          <TouchableOpacity
            style={[
              styles.backButton,
              { backgroundColor: colors.backgroundCard, borderColor: colors.muted },
            ]}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.backButtonText, { color: colors.text }]}>{t('news.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const categoryColor = getCategoryColor(post.category, isDark);
  const categoryLabel = categoryLabels[post.category] || post.category;
  const paragraphs = (post.content ?? '').split('\n\n').filter(Boolean);

  let tags: string[] = [];
  if (post.tags) {
    try {
      tags = JSON.parse(post.tags);
    } catch (e) {
      logger.warn('Failed to parse tags:', e);
      tags = [];
    }
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* Interstitial Ad Overlay */}
      <InterstitialAdOverlay visible={showAdOverlay} onClose={() => setShowAdOverlay(false)} />

      <View style={[styles.header, { borderBottomColor: colors.muted }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('news.back')}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleShare}
          accessibilityLabel={t('news.shareNews')}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="share-variant" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.imageContainer}>
          {post.image_url ? (
            <Image
              source={{ uri: post.image_url }}
              style={styles.heroImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={300}
            />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: colors.backgroundCard }]}>
              <MaterialCommunityIcons
                name="newspaper-variant-outline"
                size={60}
                color={colors.textSecondary}
              />
            </View>
          )}
        </View>

        <View style={styles.content}>
          <View style={styles.badges}>
            <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
              <Text style={[styles.categoryText, { color: getContrastTextColor(categoryColor) }]}>
                {categoryLabel}
              </Text>
            </View>
            <View
              style={[
                styles.regionBadge,
                {
                  backgroundColor: colors.backgroundCard,
                  borderColor: colors.muted,
                },
              ]}
            >
              <MaterialCommunityIcons name="map-marker" size={12} color={colors.text} />
              <Text style={[styles.regionText, { color: colors.text }]}>{post.region}</Text>
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{post.title}</Text>

          <View style={styles.meta}>
            <Text style={[styles.date, { color: colors.textSecondary }]}>
              {formatDate(post.published_at)}
            </Text>
            <Text style={[styles.source, { color: colors.textSecondary }]}>
              {t('news.source', { source: post.source_name })}
            </Text>
          </View>

          <Text style={[styles.summary, { color: colors.text }]}>{post.summary}</Text>

          <View style={[styles.divider, { backgroundColor: colors.muted }]} />

          <View style={styles.body}>
            {paragraphs.map((paragraph, index) => (
              <Text key={index} style={[styles.paragraph, { color: colors.textSecondary }]}>
                {paragraph}
              </Text>
            ))}
          </View>

          {tags.length > 0 && (
            <View style={styles.tagsContainer}>
              <Text style={[styles.tagsLabel, { color: colors.textSecondary }]}>{t('news.tags')}</Text>
              <View style={styles.tags}>
                {tags.map((tag: string, index: number) => (
                  <View
                    key={index}
                    style={[
                      styles.tag,
                      {
                        backgroundColor: colors.backgroundCard,
                        borderColor: colors.muted,
                      },
                    ]}
                  >
                    <Text style={[styles.tagText, { color: colors.text }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.sourceButton,
              { backgroundColor: colors.backgroundCard, borderColor: colors.muted },
            ]}
            onPress={handleOpenSource}
            accessibilityLabel={t('news.openOriginalSource')}
            accessibilityRole="link"
          >
            <MaterialCommunityIcons name="open-in-new" size={18} color={colors.primary} />
            <Text style={[styles.sourceButtonText, { color: colors.primary }]}>
              {t('news.viewOriginalSource')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  backButtonText: {
    fontWeight: '600',
  },
  imageContainer: {
    width: width,
    aspectRatio: 16 / 9,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
  },
  badges: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  regionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  regionText: {
    fontSize: 12,
    marginLeft: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    lineHeight: 32,
    marginBottom: 12,
  },
  meta: {
    marginBottom: 16,
  },
  date: {
    fontSize: 13,
  },
  source: {
    fontSize: 13,
    marginTop: 2,
    fontStyle: 'italic',
  },
  summary: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: 20,
  },
  body: {},
  paragraph: {
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 16,
  },
  tagsContainer: {
    marginTop: 20,
  },
  tagsLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 12,
  },
  sourceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 40,
    borderWidth: 1,
  },
  sourceButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});
