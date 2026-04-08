import React, { memo, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { BlogPost, getCategoryColor, categoryLabels } from '../types/blog';
import { useTheme, getContrastTextColor } from '../context/ThemeContext';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;

interface NewsCardProps {
  post: BlogPost;
  onPress: () => void;
}

/**
 * Memoized news card component with image caching
 */
export const NewsCard = memo(
  function NewsCard({ post, onPress }: NewsCardProps) {
    const { t, i18n } = useTranslation();
    const { colors, isDark } = useTheme();

    const formattedDate = useMemo(() => {
      const locale = i18n.language === 'en' ? 'en-US' : 'pt-PT';
      const date = new Date(post.published_at);
      return date.toLocaleDateString(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }, [post.published_at, i18n.language]);

    // Memoizar cores de categoria
    const categoryColor = useMemo(
      () => getCategoryColor(post.category, isDark),
      [post.category, isDark]
    );

    const categoryLabel = categoryLabels[post.category] || post.category;

    return (
      <TouchableOpacity
        style={[
          styles.container,
          {
            backgroundColor: colors.backgroundCard,
            borderColor: colors.muted,
          },
        ]}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityLabel={t('news.accessibility.newsItem', { title: post.title, category: categoryLabel, date: formattedDate })}
        accessibilityRole="button"
        accessibilityHint={t('news.accessibility.tapToRead')}
      >
        <View style={styles.imageContainer}>
          {post.image_url ? (
            <Image
              source={{ uri: post.image_url }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              recyclingKey={post.id.toString()}
            />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: colors.muted + '30' }]}>
              <MaterialCommunityIcons
                name="newspaper-variant-outline"
                size={40}
                color={colors.textSecondary}
              />
            </View>
          )}

          <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
            <Text style={[styles.categoryText, { color: getContrastTextColor(categoryColor) }]}>
              {categoryLabel}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {post.title}
          </Text>

          <Text style={[styles.summary, { color: colors.textSecondary }]} numberOfLines={3}>
            {post.summary}
          </Text>

          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons
                name="map-marker-outline"
                size={14}
                color={colors.textSecondary}
              />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{post.region}</Text>
            </View>

            <View style={styles.metaItem}>
              <MaterialCommunityIcons
                name="calendar-blank-outline"
                size={14}
                color={colors.textSecondary}
              />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {formattedDate}
              </Text>
            </View>
          </View>

          <Text style={[styles.source, { color: colors.textSecondary }]}>
            {t('news.source', { source: post.source_name })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.post.id === nextProps.post.id &&
      prevProps.post.title === nextProps.post.title &&
      prevProps.post.image_url === nextProps.post.image_url &&
      prevProps.post.summary === nextProps.post.summary
    );
  }
);

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    width: CARD_WIDTH,
    borderWidth: 1,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  meta: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  metaText: {
    fontSize: 12,
    marginLeft: 4,
  },
  source: {
    fontSize: 11,
    fontStyle: 'italic',
  },
});
