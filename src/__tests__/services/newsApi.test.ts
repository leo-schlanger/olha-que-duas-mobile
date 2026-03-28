import { fetchNews, fetchNewsById, invalidateNewsCache } from '../../services/newsApi';
import { supabase } from '../../services/supabase';

// Mock supabase
jest.mock('../../services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            range: jest.fn(() =>
              Promise.resolve({
                data: [{ id: 1, title: 'Test News', slug: 'test-news', category: 'geral' }],
                count: 1,
                error: null,
              })
            ),
            eq: jest.fn(() => ({
              or: jest.fn(() => ({
                range: jest.fn(() =>
                  Promise.resolve({
                    data: [],
                    count: 0,
                    error: null,
                  })
                ),
              })),
            })),
          })),
          single: jest.fn(() =>
            Promise.resolve({
              data: { id: 1, title: 'Test News', slug: 'test-news' },
              error: null,
            })
          ),
        })),
      })),
    })),
  },
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('newsApi', () => {
  beforeEach(() => {
    invalidateNewsCache();
    jest.clearAllMocks();
  });

  describe('fetchNews', () => {
    it('should fetch news with default parameters', async () => {
      const mockData = {
        data: [{ id: 1, title: 'Test News', slug: 'test-news', category: 'geral' }],
        count: 1,
        error: null,
      };

      const mockRange = jest.fn(() => Promise.resolve(mockData));
      const mockOrder = jest.fn(() => ({ range: mockRange, eq: jest.fn() }));
      const mockEq = jest.fn(() => ({ order: mockOrder }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      const result = await fetchNews();

      expect(supabase.from).toHaveBeenCalledWith('blog_posts');
      expect(result.posts).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should use cache on subsequent calls', async () => {
      const mockData = {
        data: [{ id: 1, title: 'Cached News', slug: 'cached-news' }],
        count: 1,
        error: null,
      };

      const mockRange = jest.fn(() => Promise.resolve(mockData));
      const mockOrder = jest.fn(() => ({ range: mockRange, eq: jest.fn() }));
      const mockEq = jest.fn(() => ({ order: mockOrder }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      // First call
      await fetchNews();
      // Second call should use cache
      await fetchNews();

      // Should only call supabase once due to caching
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidateNewsCache', () => {
    it('should clear the cache', async () => {
      const mockData = {
        data: [{ id: 1, title: 'Test', slug: 'test' }],
        count: 1,
        error: null,
      };

      const mockRange = jest.fn(() => Promise.resolve(mockData));
      const mockOrder = jest.fn(() => ({ range: mockRange, eq: jest.fn() }));
      const mockEq = jest.fn(() => ({ order: mockOrder }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      // First call
      await fetchNews();

      // Invalidate cache
      invalidateNewsCache();

      // Second call should hit supabase again
      await fetchNews();

      expect(supabase.from).toHaveBeenCalledTimes(2);
    });
  });

  describe('fetchNewsById', () => {
    it('should fetch a single news post by slug', async () => {
      const mockData = {
        data: { id: 1, title: 'Single News', slug: 'single-news' },
        error: null,
      };

      const mockSingle = jest.fn(() => Promise.resolve(mockData));
      const mockEq = jest.fn(() => ({ single: mockSingle }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      const result = await fetchNewsById('single-news');

      expect(supabase.from).toHaveBeenCalledWith('blog_posts');
      expect(result).toEqual(mockData.data);
    });

    it('should return null on error', async () => {
      const mockSingle = jest.fn(() =>
        Promise.resolve({ data: null, error: new Error('Not found') })
      );
      const mockEq = jest.fn(() => ({ single: mockSingle }));
      const mockSelect = jest.fn(() => ({ eq: mockEq }));
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      const result = await fetchNewsById('non-existent');

      expect(result).toBeNull();
    });
  });
});
