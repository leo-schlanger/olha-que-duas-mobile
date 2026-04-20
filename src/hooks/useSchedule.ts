import { useState, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../services/supabase';
import { siteConfig } from '../config/site';
import { logger } from '../utils/logger';

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
  end_time: string | null;
  is_all_day: boolean;
  event: ScheduleEvent | ScheduleEvent[] | null;
}

export interface GroupedSchedule {
  day: string;
  dayNumber: number;
  show: string;
  description: string | null;
  times: string[];
  endTimes: (string | null)[];
  isAllDay: boolean;
  iconUrl: string;
  icon: string; // Ionicons fallback
  isActive: boolean;
  isToday: boolean;
  isLive: boolean;
}

export interface DaySchedule {
  dayNumber: number;
  dayName: string;
  isToday: boolean;
  shows: GroupedSchedule[];
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
  Nutrição: 'leaf-outline',
  Motivar: 'bulb-outline',
  'Prazer Feminino': 'heart-outline',
  'Companheiros de Caminho': 'walk-outline',
  'Dizem que...': 'chatbubbles-outline',
  'Olha que Duas!': 'people-outline',
  'Céu de cada mês': 'star-outline',
};

/**
 * Check if a program is currently live based on day and times
 * Uses Portugal timezone (Europe/Lisbon)
 */
function checkIsLive(dayNumber: number, times: string[], endTimes?: (string | null)[], isAllDay?: boolean): boolean {
  const now = new Date();

  // Get current time in Portugal timezone
  const ptFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = ptFormatter.formatToParts(now);
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0';
  const ptHour = parseInt(hourStr, 10);
  const ptMinute = parseInt(minuteStr, 10);
  const ptTimeInMinutes = ptHour * 60 + ptMinute;

  // Get current day in Portugal timezone
  const ptDayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    weekday: 'long',
  });
  const ptDayName = ptDayFormatter.format(now);
  const dayNameToNumber: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const ptDay = dayNameToNumber[ptDayName] ?? 0;

  if (ptDay !== dayNumber) return false;

  // All-day events are always live on their day
  if (isAllDay) return true;

  // Check if current time is within any show slot
  for (let i = 0; i < times.length; i++) {
    const [h, m] = times[i].split(':').map(Number);
    const slotStart = h * 60 + m;
    // Use end_time if available, otherwise assume 1 hour
    let slotEnd: number;
    const endTime = endTimes?.[i];
    if (endTime) {
      const [eh, em] = endTime.split(':').map(Number);
      slotEnd = eh * 60 + em;
      if (slotEnd <= slotStart) slotEnd += 24 * 60;
    } else {
      slotEnd = slotStart + 60;
    }
    if (ptTimeInMinutes >= slotStart && ptTimeInMinutes < slotEnd) {
      return true;
    }
  }

  return false;
}

/**
 * Get current day number in Portugal timezone
 */
function getCurrentPtDayNumber(): number {
  const now = new Date();
  const ptDayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    weekday: 'long',
  });
  const ptDayName = ptDayFormatter.format(now);
  const dayNameToNumber: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  return dayNameToNumber[ptDayName] ?? 0;
}

// Fallback schedule from config (only active items)
function buildFallbackSchedule(currentDay: number): GroupedSchedule[] {
  return siteConfig.radio.schedule
    .filter((item) => item.isActive !== false)
    .map((item) => {
      const dayNumber = [
        'Domingo',
        'Segunda',
        'Terça',
        'Quarta',
        'Quinta',
        'Sexta',
        'Sábado',
      ].indexOf(item.day);
      return {
        day: item.day,
        dayNumber,
        show: item.show,
        description: item.description ?? null,
        times: item.times,
        endTimes: item.times.map(() => null),
        isAllDay: false,
        iconUrl: '',
        icon: item.icon,
        isActive: true,
        isToday: dayNumber === currentDay,
        isLive: checkIsLive(dayNumber, item.times),
      };
    });
}

export function useSchedule() {
  const [rawSchedule, setRawSchedule] = useState<GroupedSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentDay, setCurrentDay] = useState(() => getCurrentPtDayNumber());

  // Update currentDay when app returns to foreground (handles midnight crossover)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setCurrentDay(getCurrentPtDayNumber());
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    async function fetchSchedule() {
      // Check if Supabase is configured
      if (!siteConfig.supabase.url || !siteConfig.supabase.anonKey) {
        setRawSchedule(buildFallbackSchedule(currentDay));
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('schedule')
          .select(
            `
            id,
            event_id,
            day_of_week,
            time,
            end_time,
            is_all_day,
            event:events!inner(id, name, description, icon_url, is_active)
          `
          )
          .eq('is_active', true)
          .eq('events.is_active', true)
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
            const isAllDay = item.is_all_day ?? false;
            const time = item.time.slice(0, 5); // HH:mm
            const endTime = item.end_time ? item.end_time.slice(0, 5) : null;

            if (grouped.has(key)) {
              if (!isAllDay) {
                grouped.get(key)!.times.push(time);
                grouped.get(key)!.endTimes.push(endTime);
              }
            } else {
              const times = isAllDay ? [] : [time];
              const endTimes = isAllDay ? [] : [endTime];
              grouped.set(key, {
                day: DAYS_MAP[item.day_of_week],
                dayNumber: item.day_of_week,
                show: event.name,
                description: event.description,
                times,
                endTimes,
                isAllDay,
                iconUrl: event.icon_url,
                icon: FALLBACK_ICONS[event.name] || 'radio-outline',
                isActive: true,
                isToday: item.day_of_week === currentDay,
                isLive: checkIsLive(item.day_of_week, times, endTimes, isAllDay),
              });
            }
          }

          // Sort times within each show and update isLive after all times are grouped
          for (const schedule of grouped.values()) {
            // Sort times and endTimes together
            const paired = schedule.times.map((t, i) => ({ time: t, endTime: schedule.endTimes[i] }));
            paired.sort((a, b) => a.time.localeCompare(b.time));
            schedule.times = paired.map((p) => p.time);
            schedule.endTimes = paired.map((p) => p.endTime);
            schedule.isLive = checkIsLive(schedule.dayNumber, schedule.times, schedule.endTimes, schedule.isAllDay);
          }

          // Sort: today first, then by day number
          const sortedSchedule = Array.from(grouped.values()).sort((a, b) => {
            // Today's programs first
            if (a.isToday && !b.isToday) return -1;
            if (!a.isToday && b.isToday) return 1;
            // Then by day number
            return a.dayNumber - b.dayNumber;
          });

          setRawSchedule(sortedSchedule);
        } else {
          setRawSchedule(buildFallbackSchedule(currentDay));
        }
      } catch (err) {
        logger.error('Error fetching schedule:', err);
        setError(err instanceof Error ? err.message : 'Error fetching schedule');
        // Keep fallback schedule on error
        setRawSchedule(buildFallbackSchedule(currentDay));
      } finally {
        setLoading(false);
      }
    }

    fetchSchedule();
  }, [currentDay]);

  // Only return active programs
  const schedule = useMemo(() => rawSchedule.filter((item) => item.isActive), [rawSchedule]);

  // Group programs by day for layouts that show day headers.
  // Order: today first, then forward through the week (wrap-around),
  // so the user always sees upcoming days next.
  const scheduleByDay = useMemo<DaySchedule[]>(() => {
    const byDay = new Map<number, DaySchedule>();
    for (const item of schedule) {
      let entry = byDay.get(item.dayNumber);
      if (!entry) {
        entry = {
          dayNumber: item.dayNumber,
          dayName: DAYS_MAP[item.dayNumber] ?? item.day,
          isToday: item.dayNumber === currentDay,
          shows: [],
        };
        byDay.set(item.dayNumber, entry);
      }
      entry.shows.push(item);
    }

    // Sort shows within each day: all-day first, then by first time
    for (const day of byDay.values()) {
      day.shows.sort((a, b) => {
        if (a.isAllDay && !b.isAllDay) return -1;
        if (!a.isAllDay && b.isAllDay) return 1;
        return (a.times[0] ?? '').localeCompare(b.times[0] ?? '');
      });
    }

    // Order: today, then upcoming days, wrapping around the week
    return Array.from(byDay.values()).sort((a, b) => {
      const distA = (a.dayNumber - currentDay + 7) % 7;
      const distB = (b.dayNumber - currentDay + 7) % 7;
      return distA - distB;
    });
  }, [schedule, currentDay]);

  return { schedule, scheduleByDay, loading, error };
}
