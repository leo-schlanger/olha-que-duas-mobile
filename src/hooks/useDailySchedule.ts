import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { siteConfig } from '../config/site';
import { logger } from '../utils/logger';

export interface DailySlot {
  time: string;
  name: string;
  duration?: string;
  iconUrl?: string;
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

/** Parse "07h" → 420, "10h30" → 630 (minutes from midnight). */
export function parseSlotTime(t: string): number {
  const match = t.match(/^(\d{1,2})h(\d{2})?$/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + (match[2] ? parseInt(match[2]) : 0);
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
      const start = parseSlotTime(slot.time);
      let end: number;
      if (i < period.slots.length - 1) {
        end = parseSlotTime(period.slots[i + 1].time);
      } else {
        end = rangeEnd;
      }
      let diff = end - start;
      if (diff <= 0) diff += 24 * 60;
      return { ...slot, duration: formatDuration(diff) };
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

export function getCurrentPeriod(): string {
  const hour = new Date().getHours();
  if (hour >= 7 && hour < 12) return 'manha';
  if (hour >= 12 && hour < 18) return 'tarde';
  if (hour >= 18) return 'noite';
  return 'madrugada';
}

export function useDailySchedule() {
  const [schedule, setSchedule] = useState<DailyPeriod[]>(fallbackSchedule);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDailySchedule() {
      if (!siteConfig.supabase.url || !siteConfig.supabase.anonKey) {
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('daily_schedule')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (fetchError) throw fetchError;
        if (!data || data.length === 0) {
          setLoading(false);
          return;
        }

        const grouped = new Map<string, DailyPeriod>();

        for (const row of data) {
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
          });
        }

        const sorted = PERIOD_ORDER.filter((p) => grouped.has(p)).map((p) => grouped.get(p)!);

        setSchedule(addDurations(sorted));
        setError(null);
      } catch (err) {
        logger.error('Error fetching daily schedule:', err);
        setError(err instanceof Error ? err.message : 'unknown');
      } finally {
        setLoading(false);
      }
    }

    fetchDailySchedule();
  }, []);

  return { schedule, loading, error };
}
