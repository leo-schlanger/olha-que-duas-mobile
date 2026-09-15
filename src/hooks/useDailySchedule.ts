import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../services/supabase';
import { siteConfig } from '../config/site';
import { logger } from '../utils/logger';
import { STORAGE_KEYS } from '../config/constants';
import { readScheduleCache, writeScheduleCache, SCHEDULE_STALE_MS } from '../utils/scheduleCache';

export interface DailySlot {
  time: string;
  name: string;
  duration?: string;
  /** Fim do slot em minutos desde a meia-noite (pode passar de 1440). */
  endMins?: number;
  iconUrl?: string;
  isAllDay?: boolean;
  genres?: string;
  /** true = programa especial (programação semanal), definido no merge. */
  isSpecial?: boolean;
  /** true = evento com data (emissão única), sem lembrete. */
  isDated?: boolean;
}

export interface DailyPeriod {
  period: string;
  label: string;
  range: string;
  slots: DailySlot[];
}

const PERIOD_ORDER = ['manha', 'tarde', 'noite', 'madrugada'];

/** Parse "07H - 12H" → { start: 420, end: 720 } (minutes from midnight). */
export function parsePeriodRange(range: string): { start: number; end: number } | null {
  const match = range.match(/^\s*(\d{1,2})\s*[Hh]\s*-\s*(\d{1,2})\s*[Hh]\s*$/);
  if (!match) return null;
  const start = parseInt(match[1], 10) * 60;
  let end = parseInt(match[2], 10) * 60;
  if (end === 0) end = 24 * 60;
  return { start, end };
}

/**
 * Parse o INÍCIO de um slot em minutos. Aceita tempo único ("07h", "10h30")
 * e intervalo ("07h-10h" → 420), que é o formato usado no Supabase.
 */
export function parseSlotTime(t: string): number {
  const start = t.split('-')[0].trim();
  const match = start.match(/^(\d{1,2})h(\d{2})?$/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + (match[2] ? parseInt(match[2]) : 0);
}

/**
 * Parse o FIM de um slot em intervalo ("07h-10h" → 600). Devolve null se o
 * slot não tiver fim explícito (tempo único). "00h" no fim = 1440 (meia-noite).
 */
export function parseSlotEndTime(t: string): number | null {
  const parts = t.split('-');
  if (parts.length < 2) return null;
  const match = parts[1].trim().match(/^(\d{1,2})h(\d{2})?$/);
  if (!match) return null;
  const mins = parseInt(match[1]) * 60 + (match[2] ? parseInt(match[2]) : 0);
  return mins === 0 ? 24 * 60 : mins;
}

/** Format a duration in minutes as e.g. "2h", "1h30". */
function formatDuration(minutes: number): string {
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Calculate duration for each slot based on the next slot or period end time. */
export function addDurations(periods: DailyPeriod[]): DailyPeriod[] {
  return periods.map((period) => {
    const range = parsePeriodRange(period.range);
    const rangeEnd = range ? range.end : 24 * 60;
    const slots = period.slots.map((slot, i) => {
      // Skip all-day slots and slots that already have a duration (from end_time)
      if (slot.isAllDay || slot.duration) return slot;
      const start = parseSlotTime(slot.time);
      // Prefer the slot's own embedded end ("07h-10h"); fall back to the next
      // slot's start, then the period end.
      let end = parseSlotEndTime(slot.time);
      if (end == null) {
        end = i < period.slots.length - 1 ? parseSlotTime(period.slots[i + 1].time) : rangeEnd;
      }
      let diff = end - start;
      if (diff <= 0) diff += 24 * 60;
      return { ...slot, duration: formatDuration(diff), endMins: start + diff };
    });
    return { ...period, slots };
  });
}

const fallbackSchedule: DailyPeriod[] = addDurations([
  {
    period: 'manha',
    label: 'Manhã',
    range: '07H - 12H',
    slots: [
      { time: '07h', name: 'Wake Up Mix' },
      { time: '09h', name: 'Hits da Manhã' },
      { time: '10h30', name: 'Mini Break' },
    ],
  },
  {
    period: 'tarde',
    label: 'Tarde',
    range: '12H - 18H',
    slots: [
      { time: '12h', name: 'Lunch Beats' },
      { time: '14h', name: 'Playlist Chill & Work' },
      { time: '16h', name: 'Power Hour' },
    ],
  },
  {
    period: 'noite',
    label: 'Noite',
    range: '18H - 00H',
    slots: [
      { time: '18h', name: 'Sunset Mix' },
      { time: '20h', name: 'Especial do Dia' },
      { time: '21h', name: 'Canal Infantil' },
      { time: '22h', name: 'Night Flow' },
    ],
  },
  {
    period: 'madrugada',
    label: 'Madrugada',
    range: '00H - 07H',
    slots: [
      { time: '00h', name: 'Midnight Session' },
      { time: '03h', name: 'Relax Mode' },
    ],
  },
]);

interface DailyScheduleRow {
  period: string;
  period_label: string;
  time_range: string;
  slot_time: string;
  slot_name: string;
  genres?: string | null;
  icon_url?: string | null;
}

/** Agrupa as linhas de `daily_schedule` em períodos ordenados. Exportada para testes. */
export function groupDailyRows(rows: DailyScheduleRow[]): DailyPeriod[] {
  const grouped = new Map<string, DailyPeriod>();

  for (const row of rows) {
    if (!grouped.has(row.period)) {
      grouped.set(row.period, {
        period: row.period,
        label: row.period_label,
        range: row.time_range,
        slots: [],
      });
    }
    grouped.get(row.period)!.slots.push({
      time: row.slot_time,
      name: row.slot_name,
      genres: row.genres || undefined,
      iconUrl: row.icon_url || undefined,
    });
  }

  // A fonte ordena por sort_order dentro do período; a grelha precisa da hora.
  for (const period of grouped.values()) {
    period.slots.sort((a, b) => parseSlotTime(a.time) - parseSlotTime(b.time));
  }

  const known = PERIOD_ORDER.filter((p) => grouped.has(p));
  const unknown = [...grouped.keys()].filter((p) => !PERIOD_ORDER.includes(p));
  return addDurations([...known, ...unknown].map((p) => grouped.get(p)!));
}

const supabaseConfigured = () => !!siteConfig.supabase.url && !!siteConfig.supabase.anonKey;

export function useDailySchedule() {
  // Sem Supabase (dev) usa a grelha de exemplo; com Supabase começa vazia e
  // mostra a cache/servidor — nunca nomes de exemplo desatualizados.
  const [schedule, setSchedule] = useState<DailyPeriod[]>(() =>
    supabaseConfigured() ? [] : fallbackSchedule
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const lastFetchRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const fetchDailySchedule = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;

    const run = (async () => {
      if (!supabaseConfigured()) {
        if (mountedRef.current) setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('daily_schedule')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (fetchError) throw fetchError;
        const rows = (data ?? []) as DailyScheduleRow[];
        lastFetchRef.current = Date.now();
        writeScheduleCache(STORAGE_KEYS.DAILY_SCHEDULE_CACHE, rows);
        if (!mountedRef.current) return;
        setSchedule(groupDailyRows(rows));
        setError(null);
      } catch (err) {
        logger.error('Error fetching daily schedule:', err);
        const cached = await readScheduleCache<DailyScheduleRow[]>(
          STORAGE_KEYS.DAILY_SCHEDULE_CACHE
        );
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'unknown');
        if (cached) setSchedule(groupDailyRows(cached.data));
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();

    inFlightRef.current = run.finally(() => {
      inFlightRef.current = null;
    });
    return inFlightRef.current;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    if (supabaseConfigured()) {
      readScheduleCache<DailyScheduleRow[]>(STORAGE_KEYS.DAILY_SCHEDULE_CACHE).then((cached) => {
        if (cancelled || !cached || lastFetchRef.current > 0) return;
        setSchedule(groupDailyRows(cached.data));
      });
    }
    fetchDailySchedule();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastFetchRef.current > SCHEDULE_STALE_MS) {
        fetchDailySchedule();
      }
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      sub.remove();
    };
  }, [fetchDailySchedule]);

  return { schedule, loading, error, refresh: fetchDailySchedule };
}
