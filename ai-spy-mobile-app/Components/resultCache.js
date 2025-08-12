import AsyncStorage from '@react-native-async-storage/async-storage';

class ResultCacheService {
  constructor() {
    this.COMPLETED_RESULTS_KEY = 'completed_analysis_results';
  }

  /**
   * Initialize cache service (clears any corrupted data)
   */
  async initialize() {
    try {
      // Clear any existing cache to prevent old structure issues
      await this.clearAllCache();
      console.log('Cache service initialized');
    } catch (error) {
      console.error('Failed to initialize cache service:', error);
    }
  }

  /**
   * Cache completed results locally (only one at a time)
   */
  async cacheResult(jobId, result, transcriptionData = null) {
    try {
      // Clear any existing cache first
      await this.clearAllCache();

      // Validate that result has the expected structure
      if (!result || typeof result !== 'object') {
        console.warn('Invalid result data, skipping cache');
        return;
      }

      const cacheData = {
        jobId,
        result,
        transcriptionData,
        cachedAt: Date.now(),
        source: 'background_completion',
        shown: false,
      };

      await AsyncStorage.setItem(this.COMPLETED_RESULTS_KEY, JSON.stringify(cacheData));
      console.log(`Cached results for job ${jobId}`);
    } catch (error) {
      console.error('Failed to cache result:', error);
    }
  }

  /**
   * Get the single cached result
   */
  async getCachedResult() {
    try {
      const cached = await AsyncStorage.getItem(this.COMPLETED_RESULTS_KEY);
      if (!cached) return null;

      const cacheData = JSON.parse(cached);

      // Validate cache structure - if it's old/corrupted, clear it
      if (!cacheData.jobId || !cacheData.result || typeof cacheData.result !== 'object') {
        console.warn('Invalid cache structure detected, clearing cache');
        await this.clearAllCache();
        return null;
      }

      return cacheData;
    } catch (error) {
      console.error('Failed to get cached result:', error);
      // Clear corrupted cache
      await this.clearAllCache();
      return null;
    }
  }

  /**
   * Check for and return unshown completed result
   */
  async getUnshownCompletedResults() {
    try {
      const cacheData = await this.getCachedResult();

      if (cacheData && !cacheData.shown) {
        // Double-check that result has expected structure
        if (cacheData.result && typeof cacheData.result === 'object') {
          return [
            {
              jobId: cacheData.jobId,
              result: cacheData.result,
              transcriptionData: cacheData.transcriptionData,
              cachedAt: cacheData.cachedAt,
            },
          ];
        } else {
          console.warn('Cached result has invalid structure, clearing cache');
          await this.clearAllCache();
        }
      }

      return [];
    } catch (error) {
      console.error('Failed to get unshown results:', error);
      return [];
    }
  }

  /**
   * Mark result as shown and clear the cache
   */
  async markResultAsShown(jobId) {
    try {
      const cacheData = await this.getCachedResult();
      if (cacheData && cacheData.jobId === jobId) {
        // Clear the cache since it's been viewed
        await this.clearAllCache();
        console.log(`Cleared cache for viewed job ${jobId}`);
      }
    } catch (error) {
      console.error('Failed to mark result as shown:', error);
    }
  }

  /**
   * Clear all cached results
   */
  async clearAllCache() {
    try {
      await AsyncStorage.removeItem(this.COMPLETED_RESULTS_KEY);
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    try {
      const cacheData = await this.getCachedResult();

      if (cacheData) {
        return {
          totalCached: 1,
          unshownCount: cacheData.shown ? 0 : 1,
          oldCount: 0,
          cacheKeys: [cacheData.jobId],
        };
      }

      return {
        totalCached: 0,
        unshownCount: 0,
        oldCount: 0,
        cacheKeys: [],
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return { totalCached: 0, unshownCount: 0, oldCount: 0, cacheKeys: [] };
    }
  }
}

export default new ResultCacheService();
