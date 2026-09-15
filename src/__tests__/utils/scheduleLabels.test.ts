import { describeWeeklyOccurrences, formatTimeRange, hhmmToMins } from '../../utils/scheduleLabels';
import { dayShort } from '../fixtures/scheduleData';

describe('formatTimeRange', () => {
  it('formats a range in the grid format', () => {
    expect(formatTimeRange(20 * 60, 21 * 60)).toBe('20h – 21h');
    expect(formatTimeRange(18 * 60 + 30, 19 * 60 + 30)).toBe('18h30 – 19h30');
  });

  it('wraps ends past midnight and hides a missing end', () => {
    expect(formatTimeRange(23 * 60, 24 * 60)).toBe('23h – 00h');
    expect(formatTimeRange(23 * 60, 25 * 60)).toBe('23h – 01h');
    expect(formatTimeRange(7 * 60)).toBe('07h');
    expect(formatTimeRange(7 * 60, null)).toBe('07h');
  });
});

describe('hhmmToMins', () => {
  it('parses HH:mm and tolerates garbage', () => {
    expect(hhmmToMins('18:30')).toBe(1110);
    expect(hhmmToMins('00:00')).toBe(0);
    expect(hhmmToMins('x')).toBe(0);
  });
});

describe('describeWeeklyOccurrences', () => {
  it('compresses consecutive days (Monday first) and groups by time', () => {
    const jazz = [0, 1, 2, 3, 4, 6].map((d) => ({ dayNumber: d, times: ['20:00'] }));
    expect(describeWeeklyOccurrences(jazz, dayShort, 'Todos os dias')).toEqual([
      'SEG–QUI, SÁB, DOM · 20h',
    ]);
  });

  it('lists each time once, sorted, with its own days', () => {
    const cantinho = [
      ...[1, 2, 3, 4, 5, 6].map((d) => ({ dayNumber: d, times: ['18:30'] })),
      { dayNumber: 6, times: ['11:00'] },
    ];
    expect(describeWeeklyOccurrences(cantinho, dayShort, 'Todos os dias')).toEqual([
      'SÁB · 11h',
      'SEG–SÁB · 18h30',
    ]);
  });

  it('uses the every-day label and ignores repeated entries', () => {
    const daily = [0, 1, 2, 3, 4, 5, 6, 6].map((d) => ({
      dayNumber: d,
      times: ['09:00', '09:00'],
    }));
    expect(describeWeeklyOccurrences(daily, dayShort, 'Todos os dias')).toEqual([
      'Todos os dias · 09h',
    ]);
  });

  it('keeps two consecutive days as a list', () => {
    const weekend = [6, 0].map((d) => ({ dayNumber: d, times: ['10:00'] }));
    expect(describeWeeklyOccurrences(weekend, dayShort, 'x')).toEqual(['SÁB, DOM · 10h']);
    expect(describeWeeklyOccurrences([], dayShort, 'x')).toEqual([]);
  });
});
