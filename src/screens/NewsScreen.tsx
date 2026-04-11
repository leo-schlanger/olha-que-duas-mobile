import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { NewsCard } from '../components/NewsCard';
import { BannerAd } from '../components/BannerAd';
import { useNews } from '../hooks/useNews';
import { BlogPost, BlogFilters, getCategoryColor, categoryLabels } from '../types/blog';
import { useTheme, getContrastTextColor } from '../context/ThemeContext';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 32;
// Altura estimada do NewsCard: 16 padding + (CARD_WIDTH * 9/16) imagem + ~160 conteúdo
const ITEM_HEIGHT = Math.round((CARD_WIDTH * 9) / 16) + 176;

type RootStackParamList = {
  NewsList: undefined;
  NewsDetail: { slug: string };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'NewsList'>;

// Categorias disponíveis para filtro
const CATEGORIES = Object.keys(categoryLabels);

/**
 * News list screen with search, filters, pull-to-refresh and infinite scroll
 */
export function NewsScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  const {
    posts,
    isLoading,
    isRefreshing,
    error,
    loadMore,
    refresh,
    updateFilters,
    hasMore,
    filters,
  } = useNews();

  // Ref para controlar debounce do loadMore
  const lastLoadMoreTime = useRef(0);
  const loadMoreDebounced = useCallback(() => {
    const now = Date.now();
    if (now - lastLoadMoreTime.current > 500) {
      lastLoadMoreTime.current = now;
      loadMore();
    }
  }, [loadMore]);

  const handlePressNews = useCallback(
    (post: BlogPost) => {
      navigation.navigate('NewsDetail', { slug: post.slug });
    },
    [navigation]
  );

  // Debounce da pesquisa para evitar chamadas excessivas à API
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = useCallback(
    (text: string) => {
      setSearchText(text);
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      searchTimerRef.current = setTimeout(() => {
        const newFilters: BlogFilters = {
          ...filters,
          search: text.trim() || undefined,
        };
        updateFilters(newFilters);
      }, 400);
    },
    [filters, updateFilters]
  );

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const handleCategoryPress = useCallback(
    (category: string) => {
      const newCategory = activeCategory === category ? null : category;
      setActiveCategory(newCategory);
      const newFilters: BlogFilters = {
        ...filters,
        category: newCategory || undefined,
      };
      updateFilters(newFilters);
    },
    [activeCategory, filters, updateFilters]
  );

  const handleClearFilters = useCallback(() => {
    setSearchText('');
    setActiveCategory(null);
    updateFilters({});
  }, [updateFilters]);

  const hasActiveFilters = searchText.trim() !== '' || activeCategory !== null;

  // Memoizar renderItem para evitar recriações
  const renderItem = useCallback(
    ({ item }: { item: BlogPost }) => (
      <NewsCard post={item} onPress={() => handlePressNews(item)} />
    ),
    [handlePressNews]
  );

  // Otimização do FlatList: calcula layout fixo
  const getItemLayout = useCallback(
    (_data: ArrayLike<BlogPost> | null | undefined, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    []
  );

  // Memoizar keyExtractor
  const keyExtractor = useCallback((item: BlogPost) => `${item.id}-${item.slug}`, []);

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
        <MaterialCommunityIcons
          name="newspaper-variant-outline"
          size={48}
          color={colors.textSecondary}
        />
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          {error ? t(error) : t('news.noResults')}
        </Text>
        {hasActiveFilters && (
          <TouchableOpacity
            style={[styles.clearFiltersButton, { backgroundColor: colors.primary }]}
            onPress={handleClearFilters}
          >
            <Text style={styles.clearFiltersButtonText}>{t('news.clearFilters')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderCategoryChip = (category: string) => {
    const isActive = activeCategory === category;
    const categoryColor = getCategoryColor(category, isDark);

    return (
      <TouchableOpacity
        key={category}
        style={[
          styles.categoryChip,
          {
            backgroundColor: isActive ? categoryColor : colors.backgroundCard,
            borderColor: isActive ? categoryColor : colors.muted,
          },
        ]}
        onPress={() => handleCategoryPress(category)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.categoryChipText,
            { color: isActive ? getContrastTextColor(categoryColor) : colors.text },
          ]}
        >
          {categoryLabels[category]}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.background}
        />

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.muted }]}>
          <View style={styles.headerTop}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>{t('news.title')}</Text>
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                {t('news.subtitle')}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.filterToggle, { backgroundColor: colors.backgroundCard }]}
              onPress={() => setShowFilters(!showFilters)}
              accessibilityLabel={t('news.toggleFilters')}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons
                name={showFilters ? 'filter-off' : 'filter'}
                size={20}
                color={colors.text}
              />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          {showFilters && (
            <View
              style={[
                styles.searchContainer,
                { backgroundColor: colors.backgroundCard, borderColor: colors.muted },
              ]}
            >
              <MaterialCommunityIcons name="magnify" size={20} color={colors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder={t('news.searchPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                value={searchText}
                onChangeText={handleSearch}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t('news.searchPlaceholder')}
              />
              {searchText.length > 0 && (
                <TouchableOpacity
                  onPress={() => handleSearch('')}
                  accessibilityLabel={t('news.clearSearch')}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Category Filters */}
        {showFilters && (
          <View style={[styles.filtersContainer, { borderBottomColor: colors.muted }]}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoriesScroll}
            >
              {/* Clear all button */}
              {hasActiveFilters && (
                <TouchableOpacity
                  style={[
                    styles.clearChip,
                    { backgroundColor: colors.vermelho + '20', borderColor: colors.vermelho },
                  ]}
                  onPress={handleClearFilters}
                >
                  <MaterialCommunityIcons name="close" size={14} color={colors.vermelho} />
                  <Text style={[styles.clearChipText, { color: colors.vermelho }]}>
                    {t('news.clear')}
                  </Text>
                </TouchableOpacity>
              )}
              {CATEGORIES.map(renderCategoryChip)}
            </ScrollView>
          </View>
        )}

        {/* Loading State */}
        {isLoading && posts.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              {t('news.loading')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={posts}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemLayout={getItemLayout}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onEndReached={loadMoreDebounced}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            ListEmptyComponent={renderEmpty}
            // Otimizações de performance
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            initialNumToRender={10}
            removeClippedSubviews={true}
            windowSize={5}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  filterToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  filtersContainer: {
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  categoriesScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  clearChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  clearChipText: {
    fontSize: 13,
    fontWeight: '500',
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
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  clearFiltersButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  clearFiltersButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
