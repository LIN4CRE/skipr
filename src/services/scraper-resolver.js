const axios = require('axios');
const logger = require('../utils/logger');
const { DEFAULT_SCRAPERS } = require('../config/constants');

const { LRUCache } = require('lru-cache');

class ScraperResolver {
    constructor() {
        this.cache = new LRUCache({
            max: 1000,
            ttl: 1000 * 60 * 10 // 10 minutes
        });
    }

    /**
     * Query upstream scraper for streams with LRU caching & resilient retry
     */
    async getStreams(scraperUrl, type, id) {
        if (!scraperUrl) {
            scraperUrl = DEFAULT_SCRAPERS.torrentio;
        }

        // Clean scraper URL
        let baseUrl = scraperUrl.replace(/\/manifest\.json$/, '').replace(/\/$/, '');
        const targetUrl = `${baseUrl}/stream/${type}/${id}.json`;
        const cacheKey = `${targetUrl}`;

        if (this.cache.has(cacheKey)) {
            logger.debug(`Cache hit for upstream streams: ${cacheKey}`);
            return this.cache.get(cacheKey);
        }

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                logger.info(`Fetching streams from upstream: ${targetUrl} (attempt ${attempt})`);
                const resp = await axios.get(targetUrl, {
                    timeout: 6000,
                    headers: { 'User-Agent': 'Stremio/4.4' }
                });

                if (resp.data && Array.isArray(resp.data.streams)) {
                    this.cache.set(cacheKey, resp.data.streams);
                    return resp.data.streams;
                }
            } catch (e) {
                logger.warn(`Scraper fetch attempt ${attempt} failed: ${e.message}`);
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 800));
                }
            }
        }

        return [];
    }
}

module.exports = new ScraperResolver();
