import { mergeProgramsForDay, formatMinsToSlotTime } from '../../utils/scheduleMerge';
import { DailyPeriod } from '../../hooks/useDailySchedule';

const basePeriods: DailyPeriod[] = [
  {
    period: 'manha',
    label: 'Manhã',
    range: '07H - 12H',
    slots: [
      { time: '07h', name: 'Wake Up Mix' },
      { time: '09h', name: 'Hits da Manhã' },
    ],
  },
];

describe('formatMinsToSlotTime', () => {
  it('formats whole hours and half hours', () => {
    expect(formatMinsToSlotTime(7 * 60)).toBe('07h');
    expect(formatMinsToSlotTime(10 * 60 + 30)).toBe('10h30');
  });
});

describe('mergeProgramsForDay', () => {
  it('returns the periods unchanged when there are no special shows', () => {
    const result = mergeProgramsForDay(basePeriods, []);
    expect(result).toEqual(basePeriods);
  });

  it('injects a special program with its artwork into the right period', () => {
    const result = mergeProgramsForDay(basePeriods, [
      {
        show: 'Nutrição',
        times: ['09:00'],
        endTimes: ['10:00'],
        isAllDay: false,
        iconUrl: 'https://example.com/nutricao.png',
      },
    ]);

    const slots = result[0].slots;
    const special = slots.find((s) => s.name === 'Nutrição');
    expect(special).toBeDefined();
    expect(special?.iconUrl).toBe('https://example.com/nutricao.png');
    // The early rotation slot is preserved
    expect(slots.some((s) => s.name === 'Wake Up Mix')).toBe(true);
  });

  it('places an all-day program at the top and drops icon-less rotation', () => {
    const result = mergeProgramsForDay(basePeriods, [
      {
        show: 'Especial 24h',
        times: [],
        isAllDay: true,
        iconUrl: 'https://example.com/special.png',
      },
    ]);

    const slots = result[0].slots;
    expect(slots[0].isAllDay).toBe(true);
    expect(slots[0].name).toBe('Especial 24h');
    // Rotation slots without artwork are removed under an all-day program
    expect(slots.some((s) => s.name === 'Wake Up Mix')).toBe(false);
  });
});
