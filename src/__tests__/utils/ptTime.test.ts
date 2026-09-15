import { getPtNowMinutes, getPtDayNumber, getPtHour } from '../../utils/ptTime';

describe('ptTime', () => {
  describe('getPtNowMinutes', () => {
    it('converts a winter UTC instant to Lisbon time (UTC+0)', () => {
      // 2026-01-15 10:30 UTC → 10:30 WET → 630 minutes
      expect(getPtNowMinutes(new Date('2026-01-15T10:30:00Z'))).toBe(630);
    });

    it('applies DST in summer (Lisbon UTC+1)', () => {
      // 2026-07-15 10:30 UTC → 11:30 WEST → 690 minutes
      expect(getPtNowMinutes(new Date('2026-07-15T10:30:00Z'))).toBe(690);
    });
  });

  describe('getPtDayNumber', () => {
    it('returns the Lisbon weekday (0=Sunday)', () => {
      // 2026-01-15 is a Thursday
      expect(getPtDayNumber(new Date('2026-01-15T10:30:00Z'))).toBe(4);
    });

    it('rolls over to the next day across midnight in PT', () => {
      // 2026-07-15 23:30 UTC → 00:30 (16th, Thursday) WEST
      expect(getPtDayNumber(new Date('2026-07-15T23:30:00Z'))).toBe(4);
    });
  });

  describe('getPtHour', () => {
    it('derives the hour from the PT minutes', () => {
      expect(getPtHour(new Date('2026-01-15T10:30:00Z'))).toBe(10);
    });
  });
});

describe('datas em Portugal', () => {
  const { getPtDateString, addDaysToDate, weekdayOfDate } = require('../../utils/ptTime');

  it('getPtDateString muda de dia à meia-noite de Lisboa', () => {
    expect(getPtDateString(new Date('2026-09-15T22:59:00Z'))).toBe('2026-09-15');
    expect(getPtDateString(new Date('2026-09-15T23:00:00Z'))).toBe('2026-09-16');
    expect(getPtDateString(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-15');
  });

  it('addDaysToDate e weekdayOfDate atravessam meses e anos', () => {
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOfDate('2026-09-13')).toBe(0);
    expect(weekdayOfDate('2026-09-15')).toBe(2);
  });
});
