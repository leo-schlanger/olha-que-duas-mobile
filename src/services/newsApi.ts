import { supabase } from './supabase';
import { BlogPost, BlogFilters } from '../types/blog';
import { logger } from '../utils/logger';

const POSTS_PER_PAGE = 10;

/**
 * Fetch paginated news with optional filters
 */
export async function fetchNews(
  filters: BlogFilters = {},
  page: number = 1
): Promise<{ posts: BlogPost[]; total: number }> {
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
    query = query.or(
      `title.ilike.%${filters.search}%,summary.ilike.%${filters.search}%`
    );
  }

  const from = (page - 1) * POSTS_PER_PAGE;
  const to = from + POSTS_PER_PAGE - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    logger.error('Error fetching news:', error);
    throw error;
  }

  return {
    posts: data || [],
    total: count || 0,
  };
}

/**
 * Fetch a single news post by slug
 */
export async function fetchNewsById(slug: string): Promise<BlogPost | null> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    logger.error('Error fetching news by slug:', error);
    return null;
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
