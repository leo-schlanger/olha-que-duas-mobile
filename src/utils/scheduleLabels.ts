/**
 * Formatação dos horários da programação, partilhada pela timeline, pelo
 * Hero "Agora no ar" e pela folha "Os meus lembretes".
 */

import { formatMinsToSlotTime } from './scheduleMerge';

/** "20h – 21h" ou só "20h" quando não há fim conhecido. */
export function formatTimeRange(startMins: number, endMins?: number | null): string {
  const start = formatMinsToSlotTime(startMins);
  if (endMins == null || endMins === startMins) return start;
  return `${start} – ${formatMinsToSlotTime(endMins % (24 * 60))}`;
}

/** "HH:mm" → minutos desde a meia-noite. */
export function hhmmToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export interface WeeklyOccurrence {
  dayNumber: number; // 0=Domingo
  times: string[]; // "HH:mm"
}

// Semana a começar à segunda (como na grelha portuguesa)
const mondayFirst = (day: number) => (day + 6) % 7;

/**
 * Agrupa as ocorrências semanais de um programa por hora:
 *   [{Seg..Sáb 18:30}, {Sáb 11:00}] → ["SÁB · 11h", "SEG–SÁB · 18h30"]
 * Dias seguidos (3 ou mais) são compactados em intervalo; os 7 dias usam
 * `everyDayLabel`. Horas repetidas no mesmo dia aparecem uma só vez.
 */
export function describeWeeklyOccurrences(
  occurrences: WeeklyOccurrence[],
  dayShortLabels: Record<number, string>,
  everyDayLabel: string
): string[] {
  const daysByTime = new Map<number, Set<number>>();
  for (const occ of occurrences) {
    for (const time of occ.times) {
      const mins = hhmmToMins(time);
      const days = daysByTime.get(mins) ?? new Set<number>();
      days.add(occ.dayNumber);
      daysByTime.set(mins, days);
    }
  }

  return [...daysByTime.entries()]
    .sort(([a], [b]) => a - b)
    .map(([mins, daySet]) => {
      const days = [...daySet].sort((a, b) => mondayFirst(a) - mondayFirst(b));
      const dayText = days.length === 7 ? everyDayLabel : compressDays(days, dayShortLabels);
      return `${dayText} · ${formatMinsToSlotTime(mins)}`;
    });
}

function compressDays(days: number[], labels: Record<number, string>): string {
  const parts: string[] = [];
  let runStart = 0;
  for (let i = 1; i <= days.length; i++) {
    const consecutive = i < days.length && mondayFirst(days[i]) === mondayFirst(days[i - 1]) + 1;
    if (consecutive) continue;
    const run = days.slice(runStart, i);
    if (run.length >= 3) {
      parts.push(`${labels[run[0]]}–${labels[run[run.length - 1]]}`);
    } else {
      parts.push(...run.map((d) => labels[d]));
    }
    runStart = i;
  }
  return parts.join(', ');
}
