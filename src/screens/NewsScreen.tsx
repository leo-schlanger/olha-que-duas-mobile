import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { NewsCard } from '../components/NewsCard';
import { BannerAd } from '../components/BannerAd';
import { useNews } from '../hooks/useNews';
import { BlogPost } from '../types/blog';
import { colors } from '../config/site';

type RootStackParamList = {
  NewsList: undefined;
  NewsDetail: { slug: string };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'NewsList'>;

/**
 * News list screen with pull-to-refresh and infinite scroll
 */
export function NewsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    posts,
    isLoading,
    isRefreshing,
    error,
    loadMore,
    refresh,
    hasMore,
  } = useNews();

  const handlePressNews = (post: BlogPost) => {
    navigation.navigate('NewsDetail', { slug: post.slug });
  };

  const renderItem = ({ item }: { item: BlogPost }) => (
    <NewsCard post={item} onPress={() => handlePressNews(item)} />
  );

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          {error || 'Nenhuma notícia encontrada.'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notícias</Text>
        <Text style={styles.headerSubtitle}>As últimas notícias para si</Text>
      </View>

      {/* Loading State */}
      {isLoading && posts.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>A carregar notícias...</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}

      {/* Banner Ad */}
      <BannerAd />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.muted,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  list: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
