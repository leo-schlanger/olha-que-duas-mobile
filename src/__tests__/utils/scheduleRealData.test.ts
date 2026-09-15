/**
 * Aba Programação com a programação real (nomes compridos, especiais por cima
 * da rotação, especial curto a substituir um bloco).
 */
import { groupDailyRows } from '../../hooks/useDailySchedule';
import { groupScheduleRows, datedRowsForWeek } from '../../hooks/useSchedule';
import { computeLive } from '../../hooks/useLiveProgram';
import { mergeProgramsForDay } from '../../utils/scheduleMerge';
import { buildTimelineEntries } from '../../utils/scheduleTimeline';
import { dailyScheduleRows, scheduleRows, names, dayShort } from '../fixtures/scheduleData';

const TUESDAY = 2;
const labels = { program: 'Programa', music: 'Música' };
const at = (h: number, m = 0) => h * 60 + m;

const daily = groupDailyRows(dailyScheduleRows);
const allShows = groupScheduleRows(scheduleRows, TUESDAY, dayShort);
const showsOf = (day: number) => allShows.filter((s) => s.dayNumber === day);
const mergedTuesday = mergeProgramsForDay(daily, showsOf(TUESDAY));

describe('groupDailyRows', () => {
  it('orders periods and slots by time, not by sort_order', () => {
    expect(daily.map((p) => p.period)).toEqual(['manha', 'tarde', 'noite', 'madrugada']);
    expect(daily[1].slots.map((s) => s.time)).toEqual(['12h-14h', '14h-17h', '17h-19h']);
  });

  it('computes each slot end from its range', () => {
    const noite = daily.find((p) => p.period === 'noite')!;
    expect(noite.slots.map((s) => [s.name, s.endMins])).toEqual([
      ['Golden Time', at(21)],
      ['Noite Duas', at(23)],
      ['Love Sessions', at(24)],
    ]);
  });

  it('keeps unknown periods instead of dropping them', () => {
    const extra = groupDailyRows([
      ...dailyScheduleRows,
      {
        period: 'especial',
        period_label: 'Especial',
        time_range: '07H - 08H',
        slot_time: '07h-08h',
        slot_name: 'X',
        genres: null,
      },
    ]);
    expect(extra.map((p) => p.period)).toContain('especial');
  });
});

describe('groupScheduleRows', () => {
  it('groups by day and show with sorted, aligned times', () => {
    const saturdayCantinho = showsOf(6).find((s) => s.show === names.CANTINHO)!;
    expect(saturdayCantinho.times).toEqual(['11:00', '18:30']);
    expect(saturdayCantinho.endTimes).toEqual(['13:00', '19:30']);
    expect(
      showsOf(TUESDAY)
        .map((s) => s.show)
        .sort()
    ).toEqual([names.CANTINHO, names.ENTREVISTA, names.JAZZ].sort());
  });

  it('ignores duplicated rows and rows without event', () => {
    const dup = groupScheduleRows(
      [scheduleRows[0], { ...scheduleRows[0], id: 'dup' }, { ...scheduleRows[1], event: null }],
      0,
      dayShort
    );
    expect(dup).toHaveLength(1);
    expect(dup[0].times).toEqual(['20:00']);
  });

  it('puts today first', () => {
    expect(allShows[0].dayNumber).toBe(TUESDAY);
  });
});

describe('buildTimelineEntries (terça-feira real)', () => {
  const entries = buildTimelineEntries(TUESDAY, mergedTuesday, labels);
  const byName = (name: string) => entries.filter((e) => e.name === name);

  it('keeps the full names of every program', () => {
    expect(byName(names.JAZZ)).toHaveLength(1);
    expect(byName(names.JAZZ)[0].name).toBe('Noite de JAZZ - Com Olha que Duas');
    expect(byName('Amanhecer Olha que Duas')[0].subtitle).toBe(
      'Luz suave, esperança, músicas que abrem o dia'
    );
  });

  it('lists the day in order with start and end times', () => {
    expect(entries.map((e) => `${e.time}-${e.endTime} ${e.name}`)).toEqual([
      '00h-02h Madrugada Chill',
      '02h-04h Noite Adentro',
      '04h-07h Amanhecer Olha que Duas',
      '07h-10h Bom Dia, Duas!',
      '10h-12h Manhã com Atitude',
      '12h-14h Almoço com Duas',
      '14h-17h Tarde em Movimento',
      '17h-18h30 Ritmo da Cidade',
      `18h30-19h30 ${names.CANTINHO}`,
      '19h-20h Golden Time',
      `20h-21h ${names.JAZZ}`,
      `21h-21h15 ${names.ENTREVISTA}`,
      '21h15-23h Noite Duas',
      '23h-00h Love Sessions',
    ]);
  });

  it('marks only specials with reminders and program subtitle', () => {
    for (const e of entries) {
      expect(!!e.showName).toBe(e.isSpecial);
      if (e.isSpecial) expect(e.subtitle).toBe('Programa');
    }
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
  });

  it('shows an all-day special first, without rotation', () => {
    const merged = mergeProgramsForDay(daily, [
      { show: 'Especial 24h', times: [], isAllDay: true, iconUrl: '' },
    ]);
    const allDay = buildTimelineEntries(TUESDAY, merged, labels);
    expect(allDay[0]).toMatchObject({ name: 'Especial 24h', isAllDay: true, time: '—' });
    expect(allDay[0].endTime).toBeUndefined();
    expect(allDay.every((e) => e.isSpecial)).toBe(true);
  });
});

describe('computeLive (terça-feira real)', () => {
  const live = (
    mins: number,
    today = showsOf(TUESDAY),
    merged = mergedTuesday,
    yesterday = showsOf(1)
  ) => computeLive(mins, today, merged, yesterday);

  it.each([
    [at(18, 45), names.CANTINHO, '18h30 – 19h30', 45, true],
    [at(19, 45), 'Golden Time', '19h – 20h', 15, false],
    [at(20, 30), names.JAZZ, '20h – 21h', 30, true],
    [at(21, 10), names.ENTREVISTA, '21h – 21h15', 5, true],
    [at(21, 20), 'Noite Duas', '21h15 – 23h', 100, false],
    [at(23, 30), 'Love Sessions', '23h – 00h', 30, false],
    [at(8), 'Bom Dia, Duas!', '07h – 10h', 120, false],
    [at(0, 30), 'Madrugada Chill', '00h – 02h', 90, false],
  ])('at %i min shows %s (%s)', (mins, name, label, remaining, special) => {
    const result = live(mins as number);
    expect(result.live?.name).toBe(name);
    expect(result.live?.timeLabel).toBe(label);
    expect(result.minutesRemaining).toBe(remaining);
    expect(result.live?.isSpecial).toBe(special);
    expect(result.hasProgress).toBe(true);
    expect(result.progress).toBeGreaterThanOrEqual(0);
    expect(result.progress).toBeLessThanOrEqual(1);
  });

  it('highlights the same entry in the timeline', () => {
    const entries = buildTimelineEntries(TUESDAY, mergedTuesday, labels);
    const result = live(at(20, 30));
    const highlighted = entries.filter((e) => e.startMins === result.live?.startMins);
    expect(highlighted.map((e) => e.name)).toEqual([names.JAZZ]);
  });

  const nightShow = {
    day: 'Segunda',
    dayNumber: 1,
    show: 'Madrugada Especial',
    description: null,
    times: ['23:00'],
    endTimes: ['01:00'],
    isAllDay: false,
    iconUrl: '',
    icon: 'radio',
    isActive: true,
    isToday: false,
    isLive: false,
  };

  it("keeps yesterday's special on air after midnight", () => {
    const result = computeLive(at(0, 30), showsOf(TUESDAY), mergedTuesday, [nightShow]);
    expect(result.live).toMatchObject({
      name: 'Madrugada Especial',
      timeLabel: '23h – 01h',
      isSpecial: true,
    });
    expect(result.progress).toBeCloseTo(0.75);
    expect(result.minutesRemaining).toBe(30);
  });

  it('stops yesterday special at its end', () => {
    const result = computeLive(at(1, 0), showsOf(TUESDAY), mergedTuesday, [nightShow]);
    expect(result.live?.name).toBe('Madrugada Chill');
  });

  it('handles a special crossing midnight on the same day', () => {
    const result = computeLive(
      at(23, 30),
      [{ ...nightShow, dayNumber: TUESDAY }],
      mergedTuesday,
      []
    );
    expect(result.live?.name).toBe('Madrugada Especial');
    expect(result.progress).toBeCloseTo(0.25);
    expect(result.minutesRemaining).toBe(90);
  });

  it('assumes one hour for a special without end time', () => {
    const noEnd = { ...nightShow, dayNumber: TUESDAY, times: ['10:00'], endTimes: [null] };
    expect(computeLive(at(10, 30), [noEnd], mergedTuesday, []).live).toMatchObject({
      name: 'Madrugada Especial',
      timeLabel: '10h – 11h',
    });
    expect(computeLive(at(11, 0), [noEnd], mergedTuesday, []).live?.name).toBe('Manhã com Atitude');
  });

  it('reports all-day specials without progress and nothing when the grid is empty', () => {
    const allDay = { ...nightShow, dayNumber: TUESDAY, times: [], endTimes: [], isAllDay: true };
    expect(computeLive(at(12), [allDay], mergedTuesday, [])).toMatchObject({
      live: { name: 'Madrugada Especial', isAllDay: true },
      hasProgress: false,
    });
    expect(computeLive(at(12), [], [], []).live).toBeNull();
  });
});

describe('eventos com data (emissões únicas)', () => {
  const event = { id: 'e9', name: names.ENTREVISTA, description: null, icon_url: '' };
  const dated = [
    {
      id: 'x',
      event_id: 'e9',
      event_date: '2026-09-20',
      time: '19:00:00',
      end_time: '20:00:00',
      is_all_day: false,
      event,
    },
    {
      id: 'y',
      event_id: 'e9',
      event_date: '2026-09-22',
      time: '19:00:00',
      end_time: null,
      is_all_day: false,
      event,
    },
    {
      id: 'z',
      event_id: 'e9',
      event_date: '2026-09-14',
      time: '19:00:00',
      end_time: null,
      is_all_day: false,
      event,
    },
  ];

  it('only keeps the next 7 days, on their weekday', () => {
    const week = datedRowsForWeek(dated, '2026-09-15');
    expect(week.map((r) => [r.id, r.day_of_week, r.event_date])).toEqual([['x', 0, '2026-09-20']]);
  });

  it('keeps a dated broadcast apart from the weekly show and without reminder', () => {
    // Domingo: JAZZ semanal + entrevista com data
    const sunday = groupScheduleRows(
      [...scheduleRows, ...datedRowsForWeek(dated, '2026-09-15')],
      TUESDAY,
      dayShort
    ).filter((s) => s.dayNumber === 0);
    const interview = sunday.find((s) => s.show === names.ENTREVISTA)!;
    expect(interview).toMatchObject({ isDated: true, date: '2026-09-20', times: ['19:00'] });
    expect(sunday.find((s) => s.show === names.JAZZ)?.isDated).toBeUndefined();

    const merged = mergeProgramsForDay(daily, sunday);
    const entries = buildTimelineEntries(0, merged, { ...labels, oneOff: 'Emissão especial' });
    const entry = entries.find((e) => e.name === names.ENTREVISTA)!;
    expect(entry).toMatchObject({
      subtitle: 'Emissão especial',
      time: '19h',
      endTime: '20h',
      isSpecial: true,
    });
    expect(entry.showName).toBeUndefined();
    expect(entries.find((e) => e.name === names.JAZZ)?.showName).toBe(names.JAZZ);
  });
});
