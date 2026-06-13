/**
 * Portugal-timezone (Europe/Lisbon) time helpers.
 *
 * A programação da rádio é definida em hora local de Portugal, por isso todas
 * as verificações de "está ao vivo agora / que dia é hoje" têm de ser avaliadas
 * em Europe/Lisbon, independentemente do fuso horário do dispositivo.
 */

const DAY_NAME_TO_NUMBER: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/** Hora atual em Portugal como minutos desde a meia-noite (0..1439). */
export function getPtNowMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  // Alguns motores emitem "24" para a meia-noite — normalizar para 0.
  return (hour % 24) * 60 + minute;
}

/** Dia da semana atual em Portugal (0=Domingo .. 6=Sábado). */
export function getPtDayNumber(now: Date = new Date()): number {
  const ptDayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    weekday: 'long',
  }).format(now);
  return DAY_NAME_TO_NUMBER[ptDayName] ?? 0;
}

/** Hora atual em Portugal (0..23). */
export function getPtHour(now: Date = new Date()): number {
  return Math.floor(getPtNowMinutes(now) / 60);
}
