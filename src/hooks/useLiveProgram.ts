/**
 * useLiveProgram — calcula o programa/slot que está no ar AGORA (timezone PT)
 * e o respetivo progresso (decorrido/restante), para o Hero "Agora no ar".
 *
 * Prioridade: programa especial de dia inteiro → programa especial com
 * horário → slot de rotação musical atual (grelha fundida de hoje).
 *
 * Recebe `scheduleByDay` e `dailySchedule` (já carregados pelo ecrã) para não
 * duplicar os fetches ao Supabase. Faz tick a cada minuto e recalcula ao
 * voltar do background.
 */

import { useState, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { DailyPeriod, parsePeriodRange, parseSlotTime, parseSlotEndTime } from './useDailySchedule';
import { DaySchedule } from './useSchedule';
import { mergeProgramsForDay } from '../utils/scheduleMerge';
import { getPtNowMinutes, getPtDayNumber } from '../utils/ptTime';
import { formatTimeRange, hhmmToMins } from '../utils/scheduleLabels';

export interface LiveProgram {
  name: string;
  timeLabel: string; // "11h – 13h" (mesmo formato da timeline)
  iconUrl?: string;
  isSpecial: boolean;
  isAllDay: boolean;
  startMins: number; // minutos de início (-1 para all-day) — usado para destacar na timeline
}

export interface UseLiveProgramResult {
  live: LiveProgram | null;
  progress: number; // 0..1
  minutesRemaining: number;
  hasProgress: boolean; // false para all-day / desconhecido
}

const MINUTES_IN_DAY = 24 * 60;

/**
 * Programa/slot no ar em `nowMins` (hora PT). `yesterdayShows` cobre os
 * especiais de ontem que passam da meia-noite (ex.: 23h – 01h).
 * Exportada para testes.
 */
export function computeLive(
  nowMins: number,
  todayShows: DaySchedule['shows'],
  mergedToday: DailyPeriod[],
  yesterdayShows: DaySchedule['shows'] = []
): UseLiveProgramResult {
  // 1. Programa especial de dia inteiro
  const allDay = todayShows.find((s) => s.isAllDay);
  if (allDay) {
    return {
      live: {
        name: allDay.show,
        timeLabel: '',
        iconUrl: allDay.iconUrl || undefined,
        isSpecial: true,
        isAllDay: true,
        startMins: -1,
      },
      progress: 0,
      minutesRemaining: 0,
      hasProgress: false,
    };
  }

  // 2a. Especial de ontem que atravessa a meia-noite e ainda está no ar
  for (const show of yesterdayShows) {
    if (show.isAllDay) continue;
    for (let i = 0; i < show.times.length; i++) {
      const start = hhmmToMins(show.times[i]);
      const rawEnd = show.endTimes?.[i] ?? null;
      if (!rawEnd) continue;
      const end = hhmmToMins(rawEnd);
      if (end > start || nowMins >= end) continue;
      const total = end + MINUTES_IN_DAY - start;
      const elapsed = nowMins + MINUTES_IN_DAY - start;
      return {
        live: {
          name: show.show,
          timeLabel: formatTimeRange(start, end),
          iconUrl: show.iconUrl || undefined,
          isSpecial: true,
          isAllDay: false,
          startMins: start,
        },
        progress: Math.min(1, Math.max(0, elapsed / total)),
        minutesRemaining: Math.max(0, end - nowMins),
        hasProgress: true,
      };
    }
  }

  // 2b. Programa especial de hoje com horário a decorrer agora
  for (const show of todayShows) {
    for (let i = 0; i < show.times.length; i++) {
      const start = hhmmToMins(show.times[i]);
      const rawEnd = show.endTimes?.[i] ?? null;
      let end = rawEnd ? hhmmToMins(rawEnd) : start + 60;
      if (end <= start) end += MINUTES_IN_DAY; // passa a meia-noite

      // A parte depois da meia-noite pertence a amanhã (tratada em 2a)
      const n = nowMins;

      if (n >= start && n < end) {
        const total = end - start;
        const elapsed = n - start;
        return {
          live: {
            name: show.show,
            timeLabel: formatTimeRange(start, end),
            iconUrl: show.iconUrl || undefined,
            isSpecial: true,
            isAllDay: false,
            startMins: start,
          },
          progress: total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0,
          minutesRemaining: Math.max(0, end - n),
          hasProgress: true,
        };
      }
    }
  }

  // 3. Slot de rotação musical atual (grelha fundida de hoje, pré-calculada)
  const flat = mergedToday
    .flatMap((period) => {
      const range = parsePeriodRange(period.range);
      return period.slots
        .filter((s) => !s.isAllDay)
        .map((s) => ({
          name: s.name,
          iconUrl: s.iconUrl,
          isSpecial: !!s.isSpecial,
          start: parseSlotTime(s.time),
          end: s.endMins ?? parseSlotEndTime(s.time),
          rangeEnd: range ? range.end : MINUTES_IN_DAY,
          time: s.time,
        }));
    })
    .sort((a, b) => a.start - b.start);

  const specialStarts = flat.filter((s) => s.isSpecial).map((s) => s.start);

  for (let i = 0; i < flat.length; i++) {
    const slot = flat[i];
    const next = flat[i + 1];
    // Prefer the slot's own embedded end; fall back to the next slot or period end.
    let end = slot.end ?? (next ? next.start : slot.rangeEnd);
    // A rotação termina quando começa um especial por cima (igual à timeline)
    if (!slot.isSpecial) {
      for (const start of specialStarts) {
        if (start > slot.start && start < end) end = start;
      }
    }
    if (nowMins >= slot.start && nowMins < end) {
      const total = end - slot.start;
      const elapsed = nowMins - slot.start;
      return {
        live: {
          name: slot.name,
          timeLabel: formatTimeRange(slot.start, end),
          iconUrl: slot.iconUrl || undefined,
          isSpecial: slot.isSpecial,
          isAllDay: false,
          startMins: slot.start,
        },
        progress: total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0,
        minutesRemaining: Math.max(0, end - nowMins),
        hasProgress: true,
      };
    }
  }

  return { live: null, progress: 0, minutesRemaining: 0, hasProgress: false };
}

export function useLiveProgram(
  scheduleByDay: DaySchedule[],
  dailySchedule: DailyPeriod[]
): UseLiveProgramResult {
  const [nowMins, setNowMins] = useState(() => getPtNowMinutes());
  const [today, setToday] = useState(() => getPtDayNumber());

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const recalc = () => {
      setNowMins(getPtNowMinutes());
      setToday(getPtDayNumber());
    };

    // Alinhar o primeiro tick ao próximo minuto para a barra mudar no segundo certo
    const secondsToNextMinute = 60 - new Date().getSeconds();
    const alignTimeout = setTimeout(() => {
      recalc();
      intervalId = setInterval(recalc, 60_000);
    }, secondsToNextMinute * 1000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') recalc();
    });

    return () => {
      clearTimeout(alignTimeout);
      if (intervalId) clearInterval(intervalId);
      sub.remove();
    };
  }, []);

  // Grelha do dia + merge dos especiais: NÃO depende do minuto, só dos dados
  // e do dia. Evita refazer o merge (caro) a cada tick de 60s.
  const todayShows = useMemo(
    () => scheduleByDay.find((d) => d.dayNumber === today)?.shows ?? [],
    [scheduleByDay, today]
  );
  const yesterdayShows = useMemo(
    () => scheduleByDay.find((d) => d.dayNumber === (today + 6) % 7)?.shows ?? [],
    [scheduleByDay, today]
  );
  const mergedToday = useMemo(
    () => mergeProgramsForDay(dailySchedule, todayShows),
    [dailySchedule, todayShows]
  );

  // Só o cálculo de slot ativo + progresso depende de nowMins.
  return useMemo(
    () => computeLive(nowMins, todayShows, mergedToday, yesterdayShows),
    [nowMins, todayShows, mergedToday, yesterdayShows]
  );
}
