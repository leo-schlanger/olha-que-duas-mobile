// Programação real do Supabase (15/09/2026), usada para testar a aba Programação
// com os nomes compridos e as sobreposições que existem de facto.
import type { ScheduleItemRaw } from '../../hooks/useSchedule';

export const dailyScheduleRows = [
  {
    period: 'tarde',
    period_label: 'Tarde',
    time_range: '12H - 18H',
    slot_time: '12h-14h',
    slot_name: 'Almoço com Duas',
    genres: 'Hits leves, pop suave, músicas que acompanham o almoço',
  },
  {
    period: 'manha',
    period_label: 'Manhã',
    time_range: '07H - 12H',
    slot_time: '07h-10h',
    slot_name: 'Bom Dia, Duas!',
    genres: 'Energia positiva, pop alegre, hits atuais, vibe de acordar bem',
  },
  {
    period: 'madrugada',
    period_label: 'Madrugada',
    time_range: '00H - 07H',
    slot_time: '00h-02h',
    slot_name: 'Madrugada Chill',
    genres: 'Calmo, atmosférico, indie, lo-fi, pop suave',
  },
  {
    period: 'noite',
    period_label: 'Noite',
    time_range: '18H - 00H',
    slot_time: '19h-21h',
    slot_name: 'Golden Time',
    genres: 'Luz suave, pop elegante, músicas de fim de tarde',
  },
  {
    period: 'noite',
    period_label: 'Noite',
    time_range: '18H - 00H',
    slot_time: '21h-23h',
    slot_name: 'Noite Duas',
    genres: 'Romântico, emocional, íntimo',
  },
  {
    period: 'madrugada',
    period_label: 'Madrugada',
    time_range: '00H - 07H',
    slot_time: '02h-04h',
    slot_name: 'Noite Adentro',
    genres: 'Misterioso, profundo, eletrónico suave, indie alternativo',
  },
  {
    period: 'manha',
    period_label: 'Manhã',
    time_range: '07H - 12H',
    slot_time: '10h-12h',
    slot_name: 'Manhã com Atitude',
    genres: 'Pop forte, motivação, ritmo, músicas que puxam para cima',
  },
  {
    period: 'tarde',
    period_label: 'Tarde',
    time_range: '12H - 18H',
    slot_time: '14h-17h',
    slot_name: 'Tarde em Movimento',
    genres: 'Ritmo, pop dançável, músicas que puxam energia',
  },
  {
    period: 'noite',
    period_label: 'Noite',
    time_range: '18H - 00H',
    slot_time: '23h-00h',
    slot_name: 'Love Sessions',
    genres: 'Baladas, R&B suave, músicas de amor',
  },
  {
    period: 'tarde',
    period_label: 'Tarde',
    time_range: '12H - 18H',
    slot_time: '17h-19h',
    slot_name: 'Ritmo da Cidade',
    genres: 'Urban pop, vibes modernas, mistura de pop, dance e R&B',
  },
  {
    period: 'madrugada',
    period_label: 'Madrugada',
    time_range: '00H - 07H',
    slot_time: '04h-07h',
    slot_name: 'Amanhecer Olha que Duas',
    genres: 'Luz suave, esperança, músicas que abrem o dia',
  },
];

const JAZZ = 'Noite de JAZZ - Com Olha que Duas';
const CANTINHO = 'Cantinho da Pequenada';
const ENTREVISTA = 'Entrevista a Carlos Cruz';

const row = (day: number, time: string, end: string | null, name: string): ScheduleItemRaw => ({
  id: `${day}-${time}-${name}`,
  event_id: name,
  day_of_week: day,
  time: `${time}:00`,
  end_time: end ? `${end}:00` : null,
  is_all_day: false,
  event: {
    id: name,
    name,
    description: null,
    icon_url: `https://cdn.example/${encodeURIComponent(name)}.png`,
  },
});

export const scheduleRows: ScheduleItemRaw[] = [
  row(0, '20:00', '21:00', JAZZ),
  row(1, '20:00', '21:00', JAZZ),
  row(1, '18:30', '19:30', CANTINHO),
  row(2, '21:00', '21:15', ENTREVISTA),
  row(2, '18:30', '19:30', CANTINHO),
  row(2, '20:00', '21:00', JAZZ),
  row(3, '18:30', '19:30', CANTINHO),
  row(3, '20:00', '21:00', JAZZ),
  row(4, '18:30', '19:30', CANTINHO),
  row(4, '20:00', '21:00', JAZZ),
  row(5, '20:00', '20:30', 'Olha que Duas! - TOP 10'),
  row(5, '18:30', '19:30', CANTINHO),
  row(6, '20:00', '21:00', JAZZ),
  row(6, '18:30', '19:30', CANTINHO),
  row(6, '11:00', '13:00', CANTINHO),
];

export const names = { JAZZ, CANTINHO, ENTREVISTA };

export const dayShort: Record<number, string> = {
  0: 'DOM',
  1: 'SEG',
  2: 'TER',
  3: 'QUA',
  4: 'QUI',
  5: 'SEX',
  6: 'SÁB',
};
