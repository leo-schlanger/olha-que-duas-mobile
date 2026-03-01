/**
 * Blog post data structure from Supabase
 */
export interface BlogPost {
  id: number;
  news_id: number;
  title: string;
  slug: string;
  content: string;
  summary: string;
  image_url: string | null;
  source_url: string;
  source_name: string;
  category: string;
  region: string;
  tags: string | null;
  priority_score: number;
  status: string;
  is_published: boolean;
  published_at: string;
  created_at: string;
  updated_at: string;
  meta_description: string | null;
}

/**
 * Filters for news listing
 */
export interface BlogFilters {
  category?: string;
  region?: string;
  search?: string;
}

/**
 * Category color mapping for UI badges
 */
export const categoryColors: Record<string, string> = {
  politics_pt: '#22c55e',
  politics_br: '#10b981',
  politics_world: '#3b82f6',
  controversies: '#f97316',
  conflicts: '#ef4444',
  disasters: '#dc2626',
};

/**
 * Category labels for display (Portuguese)
 */
export const categoryLabels: Record<string, string> = {
  politics_pt: 'Política Portugal',
  politics_br: 'Política Brasil',
  politics_world: 'Política Internacional',
  controversies: 'Controvérsias',
  conflicts: 'Conflitos',
  disasters: 'Desastres',
};
