import { parseSlotTime, parseSlotEndTime, parsePeriodRange } from '../../hooks/useDailySchedule';

describe('parseSlotTime', () => {
  it('parses single times', () => {
    expect(parseSlotTime('07h')).toBe(420);
    expect(parseSlotTime('10h30')).toBe(630);
  });

  it('parses the START of a range (Supabase format)', () => {
    expect(parseSlotTime('07h-10h')).toBe(420);
    expect(parseSlotTime('12h-14h')).toBe(720);
    expect(parseSlotTime('00h-02h')).toBe(0);
  });

  it('returns 0 for unparseable input', () => {
    expect(parseSlotTime('—')).toBe(0);
    expect(parseSlotTime('')).toBe(0);
  });
});

describe('parseSlotEndTime', () => {
  it('parses the END of a range', () => {
    expect(parseSlotEndTime('07h-10h')).toBe(600);
    expect(parseSlotEndTime('19h-21h')).toBe(1260);
  });

  it('treats 00h at the end as midnight (1440)', () => {
    expect(parseSlotEndTime('23h-00h')).toBe(1440);
  });

  it('returns null when there is no explicit end', () => {
    expect(parseSlotEndTime('07h')).toBeNull();
    expect(parseSlotEndTime('—')).toBeNull();
  });
});

describe('parsePeriodRange', () => {
  it('parses "07H - 12H"', () => {
    expect(parsePeriodRange('07H - 12H')).toEqual({ start: 420, end: 720 });
  });

  it('treats the trailing 00 as end of day', () => {
    expect(parsePeriodRange('18H - 00H')).toEqual({ start: 1080, end: 1440 });
  });
});
