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
