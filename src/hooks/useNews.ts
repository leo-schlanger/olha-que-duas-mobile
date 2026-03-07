import { useState, useEffect, useCallback } from 'react';
import { fetchNews, fetchNewsById, fetchCategories, fetchRegions } from '../services/newsApi';
import { BlogPost, BlogFilters } from '../types/blog';

/**
 * Hook for fetching and managing news list with pagination
 */
export function useNews(initialFilters: BlogFilters = {}) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<BlogFilters>(initialFilters);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNews = useCallback(async (pageNum: number = 1, refresh: boolean = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const result = await fetchNews(filters, pageNum);

      if (pageNum === 1) {
        setPosts(result.posts);
      } else {
        setPosts(prev => [...prev, ...result.posts]);
      }
      setTotal(result.total);
      setPage(pageNum);
    } catch (err) {
      setError('Erro ao carregar notícias. Tente novamente.');
      console.error('Error loading news:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filters]);

  const loadMore = useCallback(() => {
    if (!isLoading && posts.length < total) {
      loadNews(page + 1);
    }
  }, [isLoading, posts.length, total, page, loadNews]);

  const refresh = useCallback(() => {
    loadNews(1, true);
  }, [loadNews]);

  const updateFilters = useCallback((newFilters: BlogFilters) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  useEffect(() => {
    loadNews(1);
  }, [filters, loadNews]);

  return {
    posts,
    total,
    page,
    filters,
    isLoading,
    isRefreshing,
    error,
    loadMore,
    refresh,
    updateFilters,
    hasMore: posts.length < total,
  };
}

/**
 * Hook for fetching a single news post by slug
 */
export function useNewsDetail(slug: string) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await fetchNewsById(slug);
        setPost(result);
      } catch (err) {
        setError('Erro ao carregar notícia.');
        console.error('Error loading news detail:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (slug) {
      load();
    }
  }, [slug]);

  return { post, isLoading, error };
}

/**
 * Hook for fetching available categories
 */
export function useCategories() {
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await fetchCategories();
        setCategories(result);
      } catch (err) {
        console.error('Error loading categories:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  return { categories, isLoading };
}

/**
 * Hook for fetching available regions
 */
export function useRegions() {
  const [regions, setRegions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await fetchRegions();
        setRegions(result);
      } catch (err) {
        console.error('Error loading regions:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  return { regions, isLoading };
}
