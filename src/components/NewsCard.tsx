import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlogPost, categoryColors, categoryLabels } from '../types/blog';
import { colors } from '../config/site';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;

interface NewsCardProps {
  post: BlogPost;
  onPress: () => void;
}

/**
 * News card component for list display
 * Shows image, title, summary, category badge, and meta info
 */
export function NewsCard({ post, onPress }: NewsCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const categoryColor = categoryColors[post.category] || '#6b7280';
  const categoryLabel = categoryLabels[post.category] || post.category;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Image */}
      <View style={styles.imageContainer}>
        {post.image_url ? (
          <Image
            source={{ uri: post.image_url }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="newspaper-outline" size={40} color={colors.textSecondary} />
          </View>
        )}

        {/* Category Badge */}
        <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
          <Text style={styles.categoryText}>{categoryLabel}</Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {post.title}
        </Text>

        <Text style={styles.summary} numberOfLines={3}>
          {post.summary}
        </Text>

        {/* Meta Info */}
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>{post.region}</Text>
          </View>

          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>{formatDate(post.published_at)}</Text>
          </View>
        </View>

        {/* Source */}
        <Text style={styles.source}>
          Fonte: {post.source_name}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    width: CARD_WIDTH,
    borderWidth: 1,
    borderColor: colors.muted,
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
    backgroundColor: colors.muted + '20',
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
    color: colors.text,
    fontSize: 11,
    fontWeight: 'bold',
  },
  content: {
    padding: 16,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 24,
    marginBottom: 8,
  },
  summary: {
    color: colors.textSecondary,
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
    color: colors.textSecondary,
    fontSize: 12,
    marginLeft: 4,
  },
  source: {
    color: colors.textSecondary,
    fontSize: 11,
    fontStyle: 'italic',
  },
});
