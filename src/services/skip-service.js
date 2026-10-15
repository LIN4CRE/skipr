const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { LRUCache } = require('lru-cache');
const ffmpeg = require('fluent-ffmpeg');
const logger = require('../utils/logger');

// Load offline skips database
let offlineSkips = {};
try {
    const dataPath = path.join(__dirname, '../data/skips.json');
    if (fs.existsSync(dataPath)) {
        offlineSkips = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        logger.info(`Loaded ${Object.keys(offlineSkips).length} offline skip timestamps`);
    }
} catch (e) {
    logger.warn(`Could not load offline skips.json: ${e.message}`);
}

class SkipService {
    constructor() {
        this.cache = new LRUCache({
            max: 5000,
            ttl: 1000 * 60 * 60 * 24 // 24 hours
        });
    }

    /**
     * Parse video ID (e.g. tt0944947:1:5 or kitsu:1234:1)
     */
    parseVideoId(videoId) {
        if (!videoId) return null;
        const parts = videoId.split(':');
        if (parts.length >= 3) {
            return {
                id: parts[0],
                season: parseInt(parts[1], 10),
                episode: parseInt(parts[2], 10)
            };
        }
        return { id: videoId, season: null, episode: null };
    }

    /**
     * Query Ani-Skip API for Anime episodes
     */
    async getAniSkipSegments(malId, episodeNumber) {
        if (!malId || !episodeNumber) return [];
        try {
            const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}?types=op&types=ed`;
            const resp = await axios.get(url, { timeout: 3000 });
            if (resp.data && resp.data.found && resp.data.results) {
                return resp.data.results.map(r => ({
                    category: r.skipType === 'op' ? 'Intro' : 'Outro',
                    start: r.interval.startTime,
                    end: r.interval.endTime
                }));
            }
        } catch {
            // Quiet fail
        }
        return [];
    }

    /**
     * Query TheIntroDB v3 API for TV series intro and credits/outro
     */
    async getTheIntroDbSegments(imdbId, season, episode) {
        if (!imdbId || season == null || episode == null) return [];
        try {
            const url = `https://api.theintrodb.org/v3/media?imdb_id=${encodeURIComponent(imdbId)}&season=${season}&episode=${episode}`;
            const resp = await axios.get(url, { timeout: 3500 });
            const data = resp.data;
            if (!data) return [];

            const segments = [];

            // Parse intro
            if (Array.isArray(data.intro) && data.intro.length > 0) {
                const item = data.intro[0];
                const startSec = (item.start_ms != null ? item.start_ms : 0) / 1000;
                const endSec = (item.end_ms != null ? item.end_ms : 0) / 1000;
                if (endSec > startSec) {
                    segments.push({
                        category: 'Intro',
                        start: startSec,
                        end: endSec
                    });
                }
            }

            // Parse credits / outro
            if (Array.isArray(data.credits) && data.credits.length > 0) {
                const item = data.credits[0];
                if (item.start_ms != null && item.start_ms > 0) {
                    segments.push({
                        category: 'Outro',
                        start: item.start_ms / 1000,
                        end: item.end_ms ? item.end_ms / 1000 : null
                    });
                }
            }

            return segments;
        } catch {
            // Quiet fail
        }
        return [];
    }

    /**
     * Get skip segments by video ID (tt... or kitsu...)
     */
    async getSkipSegments(videoId) {
        if (!videoId) return null;

        if (this.cache.has(videoId)) {
            return this.cache.get(videoId);
        }

        function normalize(s) {
            const rawCat = s.category || s.label || 'Intro';
            const isIntro = /intro|opening|op/i.test(rawCat);
            const isOutro = /outro|ending|credit|ed/i.test(rawCat);
            return {
                category: isIntro ? 'Intro' : (isOutro ? 'Outro' : rawCat),
                start: parseFloat(s.start) || 0,
                end: parseFloat(s.end) || 0
            };
        }

        // 1. Check offline skips database
        if (offlineSkips[videoId]) {
            const seg = offlineSkips[videoId];
            const rawList = Array.isArray(seg) ? seg : [seg];
            const result = rawList.map(normalize);
            this.cache.set(videoId, result);
            return result;
        }

        const parsed = this.parseVideoId(videoId);
        if (parsed && parsed.season != null && parsed.episode != null) {
            // 2. Try TheIntroDB
            const introDbSegs = await this.getTheIntroDbSegments(parsed.id, parsed.season, parsed.episode);
            if (introDbSegs && introDbSegs.length > 0) {
                const result = introDbSegs.map(normalize);
                this.cache.set(videoId, result);
                return result;
            }
        }

        return null;
    }

    /**
     * Probe video stream with ffprobe for embedded chapter markers
     */
    async getChaptersFromStream(streamUrl) {
        return new Promise((resolve) => {
            if (!streamUrl) return resolve([]);
            
            ffmpeg.ffprobe(streamUrl, (err, metadata) => {
                if (err || !metadata || !metadata.chapters) {
                    return resolve([]);
                }

                const chapters = metadata.chapters.map(c => {
                    const title = (c.tags && (c.tags.title || c.tags.TITLE || c.tags.name)) || '';
                    return {
                        title: title.trim(),
                        startTime: parseFloat(c.start_time) || 0,
                        endTime: parseFloat(c.end_time) || 0
                    };
                });

                resolve(chapters);
            });
        });
    }

    /**
     * Find intro / outro skip candidate from video chapters
     */
    async getSkipFromChapters(streamUrl) {
        const chapters = await this.getChaptersFromStream(streamUrl);
        const introChapter = chapters.find(c => {
            const t = c.title.toLowerCase();
            return t.includes('intro') || t.includes('opening') || t === 'op';
        });

        if (introChapter && introChapter.endTime > introChapter.startTime) {
            return {
                category: 'Intro',
                start: introChapter.startTime,
                end: introChapter.endTime
            };
        }

        return null;
    }
}

module.exports = new SkipService();
