import AsyncStorage from '@react-native-async-storage/async-storage';
import { readScheduleCache, writeScheduleCache } from '../../utils/scheduleCache';

jest.mock('../../utils/logger', () => ({
  logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() },
}));

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;

describe('scheduleCache', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes an envelope with the save time', async () => {
    await writeScheduleCache('k', [{ a: 1 }]);
    const [key, raw] = setItem.mock.calls[0];
    expect(key).toBe('k');
    const parsed = JSON.parse(raw);
    expect(parsed.data).toEqual([{ a: 1 }]);
    expect(typeof parsed.savedAt).toBe('number');
  });

  it('reads back a valid envelope', async () => {
    getItem.mockResolvedValueOnce(JSON.stringify({ savedAt: 10, data: [1, 2] }));
    await expect(readScheduleCache('k')).resolves.toEqual({ savedAt: 10, data: [1, 2] });
  });

  it('returns null for missing, corrupted or malformed cache', async () => {
    getItem.mockResolvedValueOnce(null);
    await expect(readScheduleCache('k')).resolves.toBeNull();
    getItem.mockResolvedValueOnce('{not json');
    await expect(readScheduleCache('k')).resolves.toBeNull();
    getItem.mockResolvedValueOnce(JSON.stringify({ data: [] }));
    await expect(readScheduleCache('k')).resolves.toBeNull();
    getItem.mockRejectedValueOnce(new Error('disk'));
    await expect(readScheduleCache('k')).resolves.toBeNull();
  });

  it('does not throw when storage fails on write', async () => {
    setItem.mockRejectedValueOnce(new Error('full'));
    await expect(writeScheduleCache('k', [])).resolves.toBeUndefined();
  });
});
