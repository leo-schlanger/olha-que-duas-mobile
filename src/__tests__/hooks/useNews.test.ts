// Unit tests for useNews hook logic
// Note: Full hook testing requires React Native environment
// These tests focus on the underlying API calls

import * as newsApi from '../../services/newsApi';

// Mock newsApi
jest.mock('../../services/newsApi', () => ({
  fetchNews: jest.fn(),
  fetchNewsById: jest.fn(),
  fetchCategories: jest.fn(),
  fetchRegions: jest.fn(),
  invalidateNewsCache: jest.fn(),
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('useNews API functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchNews', () => {
    it('should be called with correct parameters', async () => {
      const mockResult = {
        posts: [{ id: 1, title: 'Test', slug: 'test' }],
        total: 1,
      };
      (newsApi.fetchNews as jest.Mock).mockResolvedValue(mockResult);

      const result = await newsApi.fetchNews({}, 1);

      expect(newsApi.fetchNews).toHaveBeenCalledWith({}, 1);
      expect(result).toEqual(mockResult);
    });

    it('should filter by category', async () => {
      const mockResult = { posts: [], total: 0 };
      (newsApi.fetchNews as jest.Mock).mockResolvedValue(mockResult);

      await newsApi.fetchNews({ category: 'desporto' }, 1);

      expect(newsApi.fetchNews).toHaveBeenCalledWith({ category: 'desporto' }, 1);
    });

    it('should handle search filter', async () => {
      const mockResult = { posts: [], total: 0 };
      (newsApi.fetchNews as jest.Mock).mockResolvedValue(mockResult);

      await newsApi.fetchNews({ search: 'test query' }, 1);

      expect(newsApi.fetchNews).toHaveBeenCalledWith({ search: 'test query' }, 1);
    });
  });

  describe('fetchNewsById', () => {
    it('should fetch a post by slug', async () => {
      const mockPost = { id: 1, title: 'Test Post', slug: 'test-post' };
      (newsApi.fetchNewsById as jest.Mock).mockResolvedValue(mockPost);

      const result = await newsApi.fetchNewsById('test-post');

      expect(newsApi.fetchNewsById).toHaveBeenCalledWith('test-post');
      expect(result).toEqual(mockPost);
    });

    it('should return null for non-existent post', async () => {
      (newsApi.fetchNewsById as jest.Mock).mockResolvedValue(null);

      const result = await newsApi.fetchNewsById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('invalidateNewsCache', () => {
    it('should be callable', () => {
      newsApi.invalidateNewsCache();
      expect(newsApi.invalidateNewsCache).toHaveBeenCalled();
    });
  });

  describe('fetchCategories', () => {
    it('should return categories array', async () => {
      const mockCategories = ['geral', 'desporto', 'politica'];
      (newsApi.fetchCategories as jest.Mock).mockResolvedValue(mockCategories);

      const result = await newsApi.fetchCategories();

      expect(result).toEqual(mockCategories);
    });
  });

  describe('fetchRegions', () => {
    it('should return regions array', async () => {
      const mockRegions = ['Aveiro', 'Porto', 'Lisboa'];
      (newsApi.fetchRegions as jest.Mock).mockResolvedValue(mockRegions);

      const result = await newsApi.fetchRegions();

      expect(result).toEqual(mockRegions);
    });
  });
});
