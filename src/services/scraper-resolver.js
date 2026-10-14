const axios = require('axios');
const logger = require('../utils/logger');
const { DEFAULT_SCRAPERS } = require('../config/constants');

class ScraperResolver {
    /**
     * Query upstream scraper for streams
     */
    async getStreams(scraperUrl, type, id) {
        if (!scraperUrl) {
            scraperUrl = DEFAULT_SCRAPERS.torrentio;
        }

        // Clean scraper URL
        let baseUrl = scraperUrl.replace(/\/manifest\.json$/, '').replace(/\/$/, '');
        const targetUrl = `${baseUrl}/stream/${type}/${id}.json`;

        try {
            logger.info(`Fetching streams from upstream: ${targetUrl}`);
            const resp = await axios.get(targetUrl, {
                timeout: 8000,
                headers: { 'User-Agent': 'Stremio/4.4' }
            });

            if (resp.data && Array.isArray(resp.data.streams)) {
                return resp.data.streams;
            }
        } catch (e) {
            logger.warn(`Failed to fetch upstream streams: ${e.message}`);
        }

        return [];
    }
}

module.exports = new ScraperResolver();
