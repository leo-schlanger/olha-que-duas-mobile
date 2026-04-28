import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchNews, fetchNewsById, invalidateNewsCache } from '../services/newsApi';
import { BlogPost, BlogFilters } from '../types/blog';
import { logger } from '../utils/logger';

/**
 * Map a thrown error to an i18n key the UI can show. Distinguishes the
 * common cases (offline / timeout / not-found / server) so the user gets
 * actionable feedback instead of a single opaque "loadError" string.
 *
 * Add the matching keys to pt.json/en.json under `news.errors.*`.
 */
function mapNewsErrorToKey(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object') return fallback;
  const e = err as { message?: string; code?: string; status?: number; name?: string };
  const msg = (e.message ?? '').toLowerCase();

  // Offline / DNS / connection refused — fetch throws TypeError
  if (e.name === 'TypeError' && msg.includes('network')) return 'news.errors.offline';
  if (msg.includes('failed to fetch') || msg.includes('network request failed'))
    return 'news.errors.offline';

  // AbortError from fetchWithTimeout
  if (e.name === 'AbortError' || msg.includes('timeout') || msg.includes('aborted'))
    return 'news.errors.timeout';

  // Supabase: PGRST116 = "Results contain 0 rows"
  if (e.code === 'PGRST116') return 'news.errors.notFound';

  // 4xx → user error; 5xx → server
  if (typeof e.status === 'number') {
    if (e.status === 404) return 'news.errors.notFound';
    if (e.status >= 500) return 'news.errors.server';
  }

  return fallback;
}

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

  // useRef para evitar dependency loops e garantir acesso ao valor mais recente
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Request ID tracking to prevent stale responses from overwriting fresh data
  const requestIdRef = useRef(0);

  const loadNews = useCallback(async (pageNum: number = 1, refresh: boolean = false) => {
    const currentRequestId = ++requestIdRef.current;

    try {
      if (refresh) {
        setIsRefreshing(true);
        // Invalidar cache no refresh para garantir dados frescos
        invalidateNewsCache();
      } else {
        setIsLoading(true);
      }
      setError(null);

      const result = await fetchNews(filtersRef.current, pageNum);

      // Discard result if a newer request has been made
      if (currentRequestId !== requestIdRef.current) return;

      if (pageNum === 1) {
        setPosts(result.posts);
      } else {
        setPosts((prev) => [...prev, ...result.posts]);
      }
      setTotal(result.total);
      setPage(pageNum);
    } catch (err) {
      // Only set error if this is still the latest request
      if (currentRequestId !== requestIdRef.current) return;
      setError(mapNewsErrorToKey(err, 'news.loadError'));
      logger.error('Error loading news:', err);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []); // Sem dependencies - usa filtersRef para acesso ao valor atual

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

  // Recarregar quando filtros mudam
  useEffect(() => {
    loadNews(1);
  }, [filters]);

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
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const result = await fetchNewsById(slug);
        if (mountedRef.current) {
          setPost(result);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(mapNewsErrorToKey(err, 'news.detailError'));
          logger.error('Error loading news detail:', err);
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    if (slug) {
      load();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [slug]);

  return { post, isLoading, error };
}
