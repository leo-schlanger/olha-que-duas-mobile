import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { siteConfig } from '../config/site';

interface ScheduleEvent {
  id: string;
  name: string;
  description: string | null;
  icon_url: string;
}

interface ScheduleItemRaw {
  id: string;
  event_id: string;
  day_of_week: number;
  time: string;
  event: ScheduleEvent | ScheduleEvent[] | null;
}

export interface GroupedSchedule {
  day: string;
  dayNumber: number;
  show: string;
  times: string[];
  iconUrl: string;
  icon: string; // Ionicons fallback
}

const DAYS_MAP: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

// Fallback icons (Ionicons) por nome de programa
const FALLBACK_ICONS: Record<string, string> = {
  'Nutrição': 'leaf-outline',
  'Motivar': 'bulb-outline',
  'Prazer Feminino': 'heart-outline',
  'Companheiros de Caminhada': 'walk-outline',
  'Dizem que...': 'chatbubbles-outline',
  'Olha que Duas!': 'people-outline',
};

// Fallback schedule from config
const fallbackSchedule: GroupedSchedule[] = siteConfig.radio.schedule.map((item) => ({
  day: item.day,
  dayNumber: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].indexOf(item.day),
  show: item.show,
  times: item.times,
  iconUrl: '',
  icon: item.icon,
}));

export function useSchedule() {
  const [schedule, setSchedule] = useState<GroupedSchedule[]>(fallbackSchedule);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSchedule() {
      // Check if Supabase is configured
      if (!siteConfig.supabase.url || !siteConfig.supabase.anonKey) {
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('schedule')
          .select(`
            id,
            event_id,
            day_of_week,
            time,
            event:events(id, name, description, icon_url)
          `)
          .eq('is_active', true)
          .order('day_of_week', { ascending: true })
          .order('time', { ascending: true });

        if (fetchError) throw fetchError;

        if (data && data.length > 0) {
          // Group by day and event
          const grouped = new Map<string, GroupedSchedule>();

          for (const item of data as ScheduleItemRaw[]) {
            // Handle event being array or object
            const event = Array.isArray(item.event) ? item.event[0] : item.event;
            if (!event) continue;

            const key = `${item.day_of_week}-${event.name}`;
            const time = item.time.slice(0, 5); // HH:mm

            if (grouped.has(key)) {
              grouped.get(key)!.times.push(time);
            } else {
              grouped.set(key, {
                day: DAYS_MAP[item.day_of_week],
                dayNumber: item.day_of_week,
                show: event.name,
                times: [time],
                iconUrl: event.icon_url,
                icon: FALLBACK_ICONS[event.name] || 'radio-outline',
              });
            }
          }

          // Sort by day
          const sortedSchedule = Array.from(grouped.values()).sort(
            (a, b) => a.dayNumber - b.dayNumber
          );

          setSchedule(sortedSchedule);
        }
      } catch (err) {
        console.error('Error fetching schedule:', err);
        setError(err instanceof Error ? err.message : 'Error fetching schedule');
        // Keep fallback schedule on error
      } finally {
        setLoading(false);
      }
    }

    fetchSchedule();
  }, []);

  return { schedule, loading, error };
}
