import { createClient } from '@supabase/supabase-js';
import { siteConfig } from '../config/site';

export const supabase = createClient(
  siteConfig.supabase.url,
  siteConfig.supabase.anonKey
);
