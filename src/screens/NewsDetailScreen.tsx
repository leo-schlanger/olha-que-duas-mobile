import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Share,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useNewsDetail } from '../hooks/useNews';
import { categoryColors, categoryLabels } from '../types/blog';
import { colors } from '../config/site';

const { width } = Dimensions.get('window');

type RootStackParamList = {
  NewsDetail: { slug: string };
};

type NewsDetailRouteProp = RouteProp<RootStackParamList, 'NewsDetail'>;

/**
 * News detail screen with full article content
 * Supports sharing and opening original source
 */
export function NewsDetailScreen() {
  const route = useRoute<NewsDetailRouteProp>();
  const navigation = useNavigation();
  const { slug } = route.params;
  const { post, isLoading, error } = useNewsDetail(slug);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-PT', {
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
      await Share.share({
        title: post.title,
        message: `${post.title}\n\n${post.summary}\n\nLeia mais em: ${post.source_url}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleOpenSource = () => {
    if (post?.source_url) {
      Linking.openURL(post.source_url);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.secondary} />
          <Text style={styles.loadingText}>A carregar...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !post) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={60} color={colors.textSecondary} />
          <Text style={styles.errorText}>
            {error || 'Notícia não encontrada'}
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const categoryColor = categoryColors[post.category] || '#6b7280';
  const categoryLabel = categoryLabels[post.category] || post.category;
  const paragraphs = post.content.split('\n\n').filter(Boolean);
  const tags = post.tags ? JSON.parse(post.tags) : [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.headerButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Image */}
        <View style={styles.imageContainer}>
          {post.image_url ? (
            <Image
              source={{ uri: post.image_url }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="newspaper-outline" size={60} color={colors.textSecondary} />
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Badges */}
          <View style={styles.badges}>
            <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
              <Text style={styles.categoryText}>{categoryLabel}</Text>
            </View>
            <View style={styles.regionBadge}>
              <Ionicons name="location" size={12} color={colors.text} />
              <Text style={styles.regionText}>{post.region}</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>{post.title}</Text>

          {/* Meta */}
          <View style={styles.meta}>
            <Text style={styles.date}>{formatDate(post.published_at)}</Text>
            <Text style={styles.source}>Fonte: {post.source_name}</Text>
          </View>

          {/* Summary */}
          <Text style={styles.summary}>{post.summary}</Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Body */}
          <View style={styles.body}>
            {paragraphs.map((paragraph, index) => (
              <Text key={index} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>

          {/* Tags */}
          {tags.length > 0 && (
            <View style={styles.tagsContainer}>
              <Text style={styles.tagsLabel}>Tags:</Text>
              <View style={styles.tags}>
                {tags.map((tag: string, index: number) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Source Link */}
          <TouchableOpacity
            style={styles.sourceButton}
            onPress={handleOpenSource}
          >
            <Ionicons name="open-outline" size={18} color={colors.secondary} />
            <Text style={styles.sourceButtonText}>Ver fonte original</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.card,
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
    color: colors.textSecondary,
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderRadius: 8,
  },
  backButtonText: {
    color: colors.text,
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
    backgroundColor: colors.card,
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
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  regionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  regionText: {
    color: colors.text,
    fontSize: 12,
    marginLeft: 4,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    lineHeight: 32,
    marginBottom: 12,
  },
  meta: {
    marginBottom: 16,
  },
  date: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  source: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
    fontStyle: 'italic',
  },
  summary: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: colors.card,
    marginVertical: 20,
  },
  body: {},
  paragraph: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 16,
  },
  tagsContainer: {
    marginTop: 20,
  },
  tagsLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 8,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    color: colors.text,
    fontSize: 12,
  },
  sourceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 40,
  },
  sourceButtonText: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});
