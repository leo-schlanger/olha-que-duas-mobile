/**
 * Cache local (AsyncStorage) da programação vinda do Supabase.
 *
 * Permite mostrar a última programação conhecida sem rede ou com o Supabase
 * em baixo, em vez de uma grelha de exemplo desatualizada.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

interface CacheEnvelope<T> {
  savedAt: number;
  data: T;
}

/** Programação só é refeita ao voltar à app se tiver mais do que isto. */
export const SCHEDULE_STALE_MS = 15 * 60 * 1000;

export async function readScheduleCache<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.savedAt !== 'number' || parsed.data == null) return null;
    return parsed;
  } catch (err) {
    logger.warn('Schedule cache read failed:', err);
    return null;
  }
}

export async function writeScheduleCache<T>(key: string, data: T): Promise<void> {
  try {
    const envelope: CacheEnvelope<T> = { savedAt: Date.now(), data };
    await AsyncStorage.setItem(key, JSON.stringify(envelope));
  } catch (err) {
    logger.warn('Schedule cache write failed:', err);
  }
}
