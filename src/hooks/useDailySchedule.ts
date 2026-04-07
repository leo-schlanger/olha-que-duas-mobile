import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { siteConfig } from '../config/site';
import { logger } from '../utils/logger';

export interface DailySlot {
  time: string;
  name: string;
}

export interface DailyPeriod {
  period: string;
  label: string;
  range: string;
  slots: DailySlot[];
}

const PERIOD_ORDER = ['manha', 'tarde', 'noite', 'madrugada'];

const fallbackSchedule: DailyPeriod[] = [
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
];

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

  useEffect(() => {
    async function fetchDailySchedule() {
      if (!siteConfig.supabase.url || !siteConfig.supabase.anonKey) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('daily_schedule')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (error) throw error;
        if (!data || data.length === 0) {
          setLoading(false);
          return;
        }

        // Group by period
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

        // Sort by predefined period order
        const sorted = PERIOD_ORDER.filter((p) => grouped.has(p)).map((p) => grouped.get(p)!);

        setSchedule(sorted);
      } catch (err) {
        logger.error('Error fetching daily schedule:', err);
        // Keep fallback on error
      } finally {
        setLoading(false);
      }
    }

    fetchDailySchedule();
  }, []);

  return { schedule, loading };
}
