/**
 * Constrói as entradas da timeline da aba Programação a partir da grelha de
 * um dia já fundida com os programas especiais (mergeProgramsForDay).
 */

import { DailyPeriod, parseSlotTime } from '../hooks/useDailySchedule';
import { TimelineEntry } from '../components/schedule/types';
import { formatMinsToSlotTime } from './scheduleMerge';

const MINUTES_IN_DAY = 24 * 60;

export function buildTimelineEntries(
  dayNumber: number,
  merged: DailyPeriod[],
  labels: { program: string; music: string }
): TimelineEntry[] {
  const entries: (TimelineEntry & { endMins?: number })[] = [];
  let idx = 0;

  for (const period of merged) {
    for (const slot of period.slots) {
      const isAllDay = !!slot.isAllDay;
      const isSpecial = !!slot.isSpecial;
      const startMins = isAllDay ? -1 : parseSlotTime(slot.time);
      entries.push({
        // Índice garante unicidade da key mesmo com slots no mesmo horário.
        key: `${dayNumber}-${idx++}-${period.period}-${slot.time}-${slot.name}`,
        time: isAllDay ? '—' : formatMinsToSlotTime(startMins),
        startMins,
        endMins: isAllDay ? undefined : slot.endMins,
        name: slot.name,
        // Especiais: "Programa". Rotação: géneros (mais rico) ou "Música".
        subtitle: isAllDay || isSpecial ? labels.program : slot.genres || labels.music,
        iconUrl: slot.iconUrl,
        isSpecial,
        isAllDay,
        showName: isSpecial && !isAllDay ? slot.name : undefined,
        dayNumber,
      });
    }
  }

  entries.sort((a, b) => {
    if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
    if (a.startMins !== b.startMins) return a.startMins - b.startMins;
    // Mesmo início: o especial primeiro
    return Number(b.isSpecial) - Number(a.isSpecial);
  });

  // Fim a mostrar: a rotação termina quando começa um especial por cima
  // (ex.: "Golden Time 19h-21h" com "Noite de JAZZ" às 20h → 19h – 20h).
  const specialStarts = entries.filter((e) => e.isSpecial && !e.isAllDay).map((e) => e.startMins);

  return entries.map(({ endMins, ...entry }) => {
    if (entry.isAllDay || endMins == null) return entry;
    let end = endMins;
    if (!entry.isSpecial) {
      for (const start of specialStarts) {
        if (start > entry.startMins && start < end) end = start;
      }
    }
    return { ...entry, endTime: formatMinsToSlotTime(end % MINUTES_IN_DAY) };
  });
}
