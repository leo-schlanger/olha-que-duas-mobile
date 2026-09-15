/**
 * useSchedule / useDailySchedule: servidor, falha de rede com cache, falha
 * sem cache (nunca a grelha de exemplo) e atualização manual.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../services/supabase';
import { useSchedule } from '../../hooks/useSchedule';
import { useDailySchedule } from '../../hooks/useDailySchedule';
import { dailyScheduleRows, scheduleRows, names } from '../fixtures/scheduleData';

// Ambiente de testes com act() (react-test-renderer)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const appStateListeners: ((state: string) => void)[] = [];

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn((_event: string, cb: (state: string) => void) => {
      appStateListeners.push(cb);
      return { remove: jest.fn() };
    }),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../../config/site', () => ({
  siteConfig: {
    supabase: { url: 'https://x.supabase.co', anonKey: 'anon' },
    radio: {
      schedule: [
        {
          day: 'Segunda',
          show: 'Programa de exemplo',
          times: ['12:00'],
          icon: 'x',
          isActive: true,
        },
      ],
    },
  },
}));

type Result = { data: unknown; error: unknown };

// Cadeia do supabase-js: from().select().eq()...order() → Promise
function mockQuery(results: Record<string, () => Promise<Result>>) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    let orders = 0;
    const finalOrders = table === 'schedule' ? 2 : 1;
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.gte = () => chain;
    // schedule_dates termina em .lte(); sem resultado definido devolve vazio
    chain.lte = () => (results[table] ?? (() => Promise.resolve({ data: [], error: null })))();
    chain.order = () => {
      orders += 1;
      return orders >= finalOrders ? results[table]() : chain;
    };
    return chain;
  });
}

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;

function renderHook<T>(hook: () => T) {
  const ref: { current: T | null } = { current: null };
  function Probe() {
    ref.current = hook();
    return null;
  }
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });
  return { result: ref as { current: T }, unmount: () => act(() => renderer.unmount()) };
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });

beforeEach(() => {
  jest.clearAllMocks();
  appStateListeners.length = 0;
  getItem.mockResolvedValue(null);
});

describe('useSchedule', () => {
  it('loads from the server and saves the cache', async () => {
    mockQuery({ schedule: () => Promise.resolve({ data: scheduleRows, error: null }) });
    const { result, unmount } = renderHook(() => useSchedule());
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.fromCache).toBe(false);
    expect(result.current.schedule.map((s) => s.show)).toContain(names.JAZZ);
    expect(setItem).toHaveBeenCalledWith('schedule_cache', expect.stringContaining(names.JAZZ));
    unmount();
  });

  it('falls back to the saved schedule when the network fails', async () => {
    getItem.mockImplementation((key: string) =>
      Promise.resolve(
        key === 'schedule_cache' ? JSON.stringify({ savedAt: 1, data: scheduleRows }) : null
      )
    );
    mockQuery({ schedule: () => Promise.resolve({ data: null, error: new Error('offline') }) });
    const { result, unmount } = renderHook(() => useSchedule());
    await flush();

    expect(result.current.error).toBe('offline');
    expect(result.current.fromCache).toBe(true);
    expect(result.current.schedule.map((s) => s.show)).toContain(names.CANTINHO);
    unmount();
  });

  it('never shows the hard-coded example schedule on failure without cache', async () => {
    mockQuery({ schedule: () => Promise.resolve({ data: null, error: new Error('offline') }) });
    const { result, unmount } = renderHook(() => useSchedule());
    await flush();

    expect(result.current.error).toBe('offline');
    expect(result.current.schedule).toEqual([]);
    unmount();
  });

  it('shows an empty week when the admin deactivates everything', async () => {
    mockQuery({ schedule: () => Promise.resolve({ data: [], error: null }) });
    const { result, unmount } = renderHook(() => useSchedule());
    await flush();
    expect(result.current.schedule).toEqual([]);
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('refresh() fetches again and recovers from an error', async () => {
    let fail = true;
    mockQuery({
      schedule: () =>
        Promise.resolve(
          fail ? { data: null, error: new Error('offline') } : { data: scheduleRows, error: null }
        ),
    });
    const { result, unmount } = renderHook(() => useSchedule());
    await flush();
    expect(result.current.error).toBe('offline');

    fail = false;
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.schedule.length).toBeGreaterThan(0);
    unmount();
  });
});

describe('useSchedule com eventos com data', () => {
  it('junta as emissões desta semana no dia certo, sem lembrete, e guarda a cache', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(
      new Date()
    );
    const [y, m, d] = today.split('-').map(Number);
    const inTwoDays = new Date(Date.UTC(y, m - 1, d + 2)).toISOString().slice(0, 10);
    const inTenDays = new Date(Date.UTC(y, m - 1, d + 10)).toISOString().slice(0, 10);
    const event = { id: 'e9', name: 'Entrevista Especial', description: null, icon_url: '' };
    mockQuery({
      schedule: () => Promise.resolve({ data: scheduleRows, error: null }),
      schedule_dates: () =>
        Promise.resolve({
          data: [
            {
              id: 'd1',
              event_id: 'e9',
              event_date: inTwoDays,
              time: '19:00:00',
              end_time: '20:00:00',
              is_all_day: false,
              event,
            },
            {
              id: 'd2',
              event_id: 'e9',
              event_date: inTenDays,
              time: '19:00:00',
              end_time: null,
              is_all_day: false,
              event,
            },
          ],
          error: null,
        }),
    });
    const { result, unmount } = renderHook(() => useSchedule());
    await flush();

    const dated = result.current.schedule.filter((s) => s.show === 'Entrevista Especial');
    expect(dated).toHaveLength(1);
    expect(dated[0]).toMatchObject({
      isDated: true,
      date: inTwoDays,
      times: ['19:00'],
      endTimes: ['20:00'],
    });
    expect(dated[0].dayNumber).toBe(new Date(Date.UTC(y, m - 1, d + 2)).getUTCDay());
    expect(setItem).toHaveBeenCalledWith(
      'schedule_dates_cache',
      expect.stringContaining('Entrevista Especial')
    );
    unmount();
  });

  it('mantém a grelha semanal se a tabela de datas falhar', async () => {
    mockQuery({
      schedule: () => Promise.resolve({ data: scheduleRows, error: null }),
      schedule_dates: () => Promise.resolve({ data: null, error: new Error('relation missing') }),
    });
    const { result, unmount } = renderHook(() => useSchedule());
    await flush();
    expect(result.current.error).toBeNull();
    expect(result.current.schedule.map((s) => s.show)).toContain(names.JAZZ);
    expect(result.current.schedule.some((s) => s.isDated)).toBe(false);
    unmount();
  });
});

describe('useDailySchedule', () => {
  it('loads and groups the daily grid', async () => {
    mockQuery({ daily_schedule: () => Promise.resolve({ data: dailyScheduleRows, error: null }) });
    const { result, unmount } = renderHook(() => useDailySchedule());
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.schedule.map((p) => p.period)).toEqual([
      'manha',
      'tarde',
      'noite',
      'madrugada',
    ]);
    expect(setItem).toHaveBeenCalledWith('daily_schedule_cache', expect.any(String));
    unmount();
  });

  it('uses the cache when offline and stays empty without it', async () => {
    mockQuery({
      daily_schedule: () => Promise.resolve({ data: null, error: new Error('offline') }),
    });
    const empty = renderHook(() => useDailySchedule());
    await flush();
    expect(empty.result.current.schedule).toEqual([]);
    expect(empty.result.current.error).toBe('offline');
    empty.unmount();

    getItem.mockImplementation((key: string) =>
      Promise.resolve(
        key === 'daily_schedule_cache'
          ? JSON.stringify({ savedAt: 1, data: dailyScheduleRows })
          : null
      )
    );
    const cached = renderHook(() => useDailySchedule());
    await flush();
    expect(cached.result.current.schedule).toHaveLength(4);
    cached.unmount();
  });

  it('refetches when the app returns after the schedule got stale', async () => {
    const fetchDaily = jest.fn(() => Promise.resolve({ data: dailyScheduleRows, error: null }));
    mockQuery({ daily_schedule: fetchDaily });
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);
    const { unmount } = renderHook(() => useDailySchedule());
    await flush();
    expect(fetchDaily).toHaveBeenCalledTimes(1);

    // Pouco tempo depois: não volta a pedir
    nowSpy.mockReturnValue(1_000_000 + 60_000);
    await act(async () => appStateListeners.forEach((cb) => cb('active')));
    await flush();
    expect(fetchDaily).toHaveBeenCalledTimes(1);

    // Mais de 15 min depois: pede de novo
    nowSpy.mockReturnValue(1_000_000 + 16 * 60_000);
    await act(async () => appStateListeners.forEach((cb) => cb('active')));
    await flush();
    expect(fetchDaily).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
    unmount();
  });
});
