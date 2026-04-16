import { supabase } from './supabase';
import { BlogPost, BlogFilters } from '../types/blog';
import { logger } from '../utils/logger';
import { LIMITS } from '../config/constants';

/**
 * Cache para evitar requisições duplicadas
 */
const newsCache = new Map<
  string,
  { data: { posts: BlogPost[]; total: number }; timestamp: number }
>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

/**
 * Limpa entradas expiradas do cache
 */
function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, value] of newsCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      newsCache.delete(key);
    }
  }
}

/**
 * Escapa metacaracteres do PostgreSQL ILIKE (% e _) para que sejam interpretados
 * como literais e não como wildcards. O Supabase faz parametrização própria,
 * por isso não removemos aspas/backslashes (que partiriam pesquisas legítimas
 * por termos como "C++", "C#" ou "rock'n'roll"). Apenas neutralizamos o que
 * iria mudar o significado do operador ILIKE.
 */
function sanitizeSearchQuery(query: string): string {
  return query.trim().replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Fetch paginated news with optional filters
 * Implementa cache de 5 minutos para evitar requisições duplicadas
 */
export async function fetchNews(
  filters: BlogFilters = {},
  page: number = 1
): Promise<{ posts: BlogPost[]; total: number }> {
  // Verificar cache primeiro
  const cacheKey = JSON.stringify({
    page,
    category: filters.category,
    region: filters.region,
    search: filters.search,
  });
  const cached = newsCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    logger.log('News cache hit:', cacheKey);
    return cached.data;
  }

  // Limpar cache expirado periodicamente
  if (newsCache.size > 50) {
    cleanExpiredCache();
  }

  let query = supabase
    .from('blog_posts')
    .select('*', { count: 'exact' })
    .eq('is_published', true)
    .order('published_at', { ascending: false });

  if (filters.category) {
    query = query.eq('category', filters.category);
  }

  if (filters.region) {
    query = query.eq('region', filters.region);
  }

  if (filters.search) {
    const sanitizedSearch = sanitizeSearchQuery(filters.search);
    if (sanitizedSearch) {
      query = query.or(`title.ilike.%${sanitizedSearch}%,summary.ilike.%${sanitizedSearch}%`);
    }
  }

  const from = (page - 1) * LIMITS.POSTS_PER_PAGE;
  const to = from + LIMITS.POSTS_PER_PAGE - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    logger.error('Error fetching news:', error);
    throw error;
  }

  const result = {
    posts: data || [],
    total: count || 0,
  };

  // Armazenar no cache
  newsCache.set(cacheKey, { data: result, timestamp: Date.now() });

  return result;
}

/**
 * Invalida o cache de notícias (útil após refresh)
 */
export function invalidateNewsCache(): void {
  newsCache.clear();
}

/**
 * Fetch a single news post by slug.
 *
 * Returns `null` only when the slug genuinely doesn't exist (Supabase
 * `PGRST116` from `.single()` on zero rows). Network / server errors are
 * thrown so the hook can distinguish "post not found" from "we couldn't
 * even reach the server" — that distinction matters for the user.
 */
export async function fetchNewsById(slug: string): Promise<BlogPost | null> {
  if (!slug || !slug.trim()) {
    // Empty slug => treat as not found rather than firing a query.
    return null;
  }

  const { data, error } = await supabase.from('blog_posts').select('*').eq('slug', slug).single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Genuine "no row" — let the screen show the not-found state.
      return null;
    }
    logger.error('Error fetching news by slug:', error);
    throw error;
  }

  return data;
}

/**
 * Fetch all available categories
 */
export async function fetchCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('category')
    .eq('is_published', true);

  if (error) {
    logger.error('Error fetching categories:', error);
    return [];
  }

  const categories = [...new Set(data?.map((item) => item.category) || [])];
  return categories.filter(Boolean);
}

/**
 * Fetch all available regions
 */
export async function fetchRegions(): Promise<string[]> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('region')
    .eq('is_published', true);

  if (error) {
    logger.error('Error fetching regions:', error);
    return [];
  }

  const regions = [...new Set(data?.map((item) => item.region) || [])];
  return regions.filter(Boolean);
}
