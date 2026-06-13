/** Uma entrada da timeline da aba Programação (um slot de um dia). */
export interface TimelineEntry {
  /** Chave estável para listas (time + name). */
  key: string;
  /** Hora a mostrar ("07h", "11:00", "—" para all-day). */
  time: string;
  /** Minutos de início desde a meia-noite (-1 para all-day). */
  startMins: number;
  /** Nome do programa/slot. */
  name: string;
  /** Subtítulo (género / "Programa" / duração). */
  subtitle?: string;
  /** Artwork do programa especial (ausente em slots de rotação). */
  iconUrl?: string;
  /** true = programa especial (tem sino de lembrete + artwork). */
  isSpecial: boolean;
  /** true = programa de dia inteiro. */
  isAllDay: boolean;
  /** Nome canónico do programa para lembretes (só especiais). */
  showName?: string;
  /** Todos os horários (HH:mm) desse programa nesse dia (para agendar lembretes). */
  showTimes?: string[];
  /** Dia da semana (0=Domingo) a que esta entrada pertence. */
  dayNumber: number;
}

/** Um dia no seletor de dias. */
export interface DayOption {
  dayNumber: number;
  label: string; // "SEG", "TER", ...
  isToday: boolean;
}
