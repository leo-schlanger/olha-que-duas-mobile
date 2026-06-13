/**
 * Funde os programas especiais (programação semanal) na grelha de períodos
 * (programação diária / "soundtrack do dia"). Os programas especiais recebem
 * um `iconUrl` para renderizar o logo; os slots de rotação ficam sem ícone.
 *
 * Portado do projeto web irmão e generalizado para funcionar com QUALQUER dia
 * (não apenas hoje), para ser reutilizado pela aba Programação.
 */

import {
  DailyPeriod,
  DailySlot,
  parsePeriodRange,
  parseSlotTime,
  parseSlotEndTime,
  addDurations,
} from '../hooks/useDailySchedule';

/** Subconjunto de GroupedSchedule de que o merge precisa. */
export interface MergeableShow {
  show: string;
  times: string[];
  endTimes?: (string | null)[];
  isAllDay?: boolean;
  iconUrl: string;
}

/** Formata minutos-desde-a-meia-noite como "12h" ou "12h30". */
export function formatMinsToSlotTime(totalMins: number): string {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return m
    ? `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`
    : `${String(h).padStart(2, '0')}h`;
}

/**
 * Funde os programas especiais de um dia específico na grelha de períodos.
 * @param periods Grelha de períodos (rotação musical) — base imutável.
 * @param dayShows Programas especiais desse dia (de scheduleByDay[dia].shows).
 * @param defaultSlotName Nome a usar quando não se sabe que rotação retomar.
 */
export function mergeProgramsForDay(
  periods: DailyPeriod[],
  dayShows: MergeableShow[],
  defaultSlotName = 'Programação'
): DailyPeriod[] {
  if (!dayShows || dayShows.length === 0) return periods;

  // Mantém os períodos originais para gap-filling
  const originalPeriods = periods;

  const merged: DailyPeriod[] = periods.map((p) => ({
    ...p,
    slots: [...p.slots],
  }));

  const allDayProg = dayShows.find((p) => p.isAllDay);

  if (allDayProg) {
    const allDaySlot: DailySlot = {
      time: '—',
      name: allDayProg.show,
      iconUrl: allDayProg.iconUrl,
      isAllDay: true,
      isSpecial: true,
    };
    for (const period of merged) {
      // Sob um programa de dia inteiro, remove a rotação (slots não-especiais).
      // Usa a flag isSpecial — a rotação agora também tem iconUrl (artwork).
      period.slots = period.slots.filter((s) => !!s.isSpecial);
      period.slots.unshift({ ...allDaySlot });
    }
  }

  const specialsWithEnd: { periodIdx: number; endMins: number }[] = [];

  for (const prog of dayShows) {
    if (prog.isAllDay) continue;

    for (let i = 0; i < prog.times.length; i++) {
      const rawTime = prog.times[i];
      const rawEndTime = prog.endTimes?.[i] ?? null;

      const [h, m] = rawTime.split(':').map(Number);
      const mins = h * 60 + (m || 0);

      const periodIdx = merged.findIndex((p) => {
        const range = parsePeriodRange(p.range);
        return range ? mins >= range.start && mins < range.end : false;
      });
      if (periodIdx < 0) continue;
      const target = merged[periodIdx];

      const formatted = formatMinsToSlotTime(mins);

      let duration: string | undefined;
      let endMins: number | undefined;
      if (rawEndTime) {
        const [eh, em] = rawEndTime.split(':').map(Number);
        endMins = eh * 60 + (em || 0);
        let diff = endMins - mins;
        if (diff <= 0) diff += 24 * 60;
        const dh = Math.floor(diff / 60);
        const dm = diff % 60;
        duration =
          dh === 0 ? `${dm}min` : dm > 0 ? `${dh}h${String(dm).padStart(2, '0')}` : `${dh}h`;
      }

      const existingIdx = target.slots.findIndex(
        (s) => !s.isAllDay && parseSlotTime(s.time) === mins
      );
      const specialSlot: DailySlot = {
        time: formatted,
        name: prog.show,
        iconUrl: prog.iconUrl,
        isSpecial: true,
        ...(duration && { duration }),
      };

      if (existingIdx >= 0) {
        target.slots[existingIdx] = specialSlot;
      } else {
        target.slots.push(specialSlot);
      }

      if (endMins !== undefined) {
        specialsWithEnd.push({ periodIdx, endMins });
      }
    }
  }

  // Ordenar todos os períodos
  for (const period of merged) {
    period.slots.sort((a, b) => {
      if (a.isAllDay) return -1;
      if (b.isAllDay) return 1;
      return parseSlotTime(a.time) - parseSlotTime(b.time);
    });
  }

  // Gap-fill: após cada especial com end_time, inserir um slot de "retoma" se houver dead air
  for (const { periodIdx, endMins } of specialsWithEnd) {
    const target = merged[periodIdx];
    const range = parsePeriodRange(target.range);
    if (!range) continue;

    if (endMins >= range.end || endMins < range.start) continue;

    const alreadyExists = target.slots.some(
      (s) => !s.isAllDay && parseSlotTime(s.time) === endMins
    );
    if (alreadyExists) continue;

    // Se um slot de rotação visível já cobre este instante (o seu intervalo
    // [início, fim) contém endMins), não criar um slot de retoma duplicado.
    // Ex.: "Golden Time 19h-21h" já cobre o fim de um especial às 19h30.
    const alreadyCovered = target.slots.some((s) => {
      if (s.isAllDay || s.isSpecial) return false;
      const sStart = parseSlotTime(s.time);
      const sEnd = parseSlotEndTime(s.time);
      return sEnd != null && sStart <= endMins && endMins < sEnd;
    });
    if (alreadyCovered) continue;

    const nextSlot = target.slots.find((s) => !s.isAllDay && parseSlotTime(s.time) > endMins);
    const nextStart = nextSlot ? parseSlotTime(nextSlot.time) : range.end;
    if (endMins >= nextStart) continue;

    let resumeSlot: DailySlot;
    if (allDayProg) {
      resumeSlot = {
        time: formatMinsToSlotTime(endMins),
        name: allDayProg.show,
        iconUrl: allDayProg.iconUrl,
        isSpecial: true,
      };
    } else {
      const origPeriod = originalPeriods.find((p) => {
        const r = parsePeriodRange(p.range);
        return r ? endMins >= r.start && endMins < r.end : false;
      });
      // Ordenar cronologicamente: a fonte (Supabase) ordena por sort_order, não
      // por hora, por isso "o último slot que cobre endMins" exige ordenação.
      const origSlots = [...(origPeriod?.slots ?? [])].sort(
        (a, b) => parseSlotTime(a.time) - parseSlotTime(b.time)
      );
      const covering = origSlots.filter((s) => parseSlotTime(s.time) <= endMins);
      const origSlot = covering[covering.length - 1];

      // Herda artwork e géneros do slot de rotação original (consistência visual).
      resumeSlot = {
        time: formatMinsToSlotTime(endMins),
        name: origSlot?.name ?? defaultSlotName,
        iconUrl: origSlot?.iconUrl,
        genres: origSlot?.genres,
      };
    }

    target.slots.push(resumeSlot);

    target.slots.sort((a, b) => {
      if (a.isAllDay) return -1;
      if (b.isAllDay) return 1;
      return parseSlotTime(a.time) - parseSlotTime(b.time);
    });
  }

  return addDurations(merged);
}
