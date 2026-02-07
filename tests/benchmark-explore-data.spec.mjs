import { test, expect } from '@playwright/test';

test.describe('Explore Data Performance Benchmark', () => {
  test('benchmark buildWatchHistoryTagCounts and buildTagIdf', async ({ page }) => {
    // Go to the app to ensure environment is loaded
    await page.goto('/');

    // Wait for modules to load (optional, but good practice)
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      // Dynamic import of the service
      const { buildWatchHistoryTagCounts, buildTagIdf } = await import('./js/services/exploreDataService.js');

      // --- Mock Data Generation ---
      const VIDEO_COUNT = 5000;
      const HISTORY_COUNT = 1000;

      const videosMap = new Map();
      const videosArray = [];
      const tagsPool = ['bitcoin', 'nostr', 'art', 'music', 'coding', 'performance', 'web', 'worker', 'nature', 'space'];

      for (let i = 0; i < VIDEO_COUNT; i++) {
        const id = `video-${i}`;
        const tags = [];
        const numTags = Math.floor(Math.random() * 5) + 1;
        for (let t = 0; t < numTags; t++) {
          tags.push(['t', tagsPool[Math.floor(Math.random() * tagsPool.length)]]);
        }

        const video = {
          id,
          kind: 30078,
          pubkey: '0000000000000000000000000000000000000000000000000000000000000000',
          tags: [['d', id], ...tags],
        };
        videosMap.set(id, video);
        videosArray.push(video);
      }

      // Mock NostrService
      const mockNostrService = {
        getVideosMap: () => videosMap,
        getFilteredActiveVideos: () => videosArray,
      };

      // Mock WatchHistoryService
      const historyItems = [];
      for (let i = 0; i < HISTORY_COUNT; i++) {
        const videoId = `video-${Math.floor(Math.random() * VIDEO_COUNT)}`;
        historyItems.push({
          pointer: { type: 'a', value: `30078:0000000000000000000000000000000000000000000000000000000000000000:${videoId}` },
          video: videosMap.get(videoId),
        });
      }

      const mockWatchHistoryService = {
        loadLatest: () => Promise.resolve(historyItems),
      };

      // --- Benchmark Counts ---
      const startCounts = performance.now();
      const counts = await buildWatchHistoryTagCounts({
        watchHistoryService: mockWatchHistoryService,
        nostrService: mockNostrService,
        actor: 'test-actor',
      });
      const endCounts = performance.now();

      // --- Benchmark IDF ---
      const startIdf = performance.now();
      const idf = await buildTagIdf({ videos: videosArray });
      const endIdf = performance.now();

      return {
        countsTime: endCounts - startCounts,
        idfTime: endIdf - startIdf,
        countsSize: counts.size,
        idfSize: idf.size
      };
    });

    console.log(`[Benchmark] buildWatchHistoryTagCounts: ${result.countsTime.toFixed(2)}ms`);
    console.log(`[Benchmark] buildTagIdf: ${result.idfTime.toFixed(2)}ms`);
    console.log(`[Benchmark] Counts Size: ${result.countsSize}`);
    console.log(`[Benchmark] IDF Size: ${result.idfSize}`);

    // Assertions to ensure it actually ran and produced results
    expect(result.countsSize).toBeGreaterThan(0);
    expect(result.idfSize).toBeGreaterThan(0);
  });
});
