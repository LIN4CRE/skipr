const express = require('express');
const router = express.Router();
const { MANIFEST, PUBLIC_URL } = require('../config/constants');
const { decodeConfig } = require('../utils/config-encoding');
const { detectClient } = require('../utils/client-detection');
const skipService = require('../services/skip-service');
const scraperResolver = require('../services/scraper-resolver');
const logger = require('../utils/logger');

// Serve Addon Manifest
function handleManifest(req, res) {
    const userConfig = decodeConfig(req.params.config);
    const host = req.get('host') || '127.0.0.1:7005';
    const protocol = req.protocol || 'http';
    const currentBase = `${protocol}://${host}`;

    const customManifest = {
        ...MANIFEST,
        logo: `${currentBase}/assets/icon.svg`,
        background: `${currentBase}/assets/banner.jpg`
    };

    if (userConfig.debridProvider) {
        customManifest.description = `⚡ Skipr [Active: ${userConfig.debridProvider.toUpperCase()}]: Auto-skips intros & recaps seamlessly.`;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.json(customManifest);
}

router.get('/manifest.json', handleManifest);
router.get('/:config/manifest.json', handleManifest);

// Serve Streams
async function handleStreams(req, res) {
    const { type, id } = req.params;
    const userConfig = decodeConfig(req.params.config);
    const clientInfo = detectClient(req.get('User-Agent'), req.get('Origin'));

    const host = req.get('host') || '127.0.0.1:7005';
    const protocol = req.protocol || 'http';
    const currentBase = `${protocol}://${host}`;

    logger.info(`Stream request for ${type}/${id} on ${clientInfo.client}`);

    // Check for skip segments
    const skipSegments = await skipService.getSkipSegments(id);
    const introSkip = skipSegments ? skipSegments.find(s => s.category === 'Intro') : null;

    // Fetch upstream streams
    const upstreamUrl = userConfig.scraperUrl || process.env.DEFAULT_SCRAPER_URL;
    const rawStreams = await scraperResolver.getStreams(upstreamUrl, type, id);

    if (!rawStreams || rawStreams.length === 0) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.json({ streams: [] });
    }

    const enhancedStreams = [];

    for (const stream of rawStreams) {
        const streamUrl = stream.url || stream.externalUrl;
        const baseTitle = stream.title || stream.name || 'Stream';

        if (introSkip && streamUrl) {
            const skipStart = Math.floor(introSkip.start);
            const skipEnd = Math.ceil(introSkip.end);

            const hlsUrl = `${currentBase}/hls/manifest.m3u8?stream=${encodeURIComponent(streamUrl)}&start=${skipStart}&end=${skipEnd}&id=${id}&client=${clientInfo.client}`;

            // Add Skip-enabled stream
            enhancedStreams.push({
                name: '⚡ Skipr',
                title: `⚡ [Auto-Skip Intro: ${skipStart}s - ${skipEnd}s]\n${baseTitle}`,
                url: hlsUrl,
                behaviorHints: stream.behaviorHints || {}
            });

            // Add Original Direct Stream as fallback
            enhancedStreams.push({
                name: stream.name || 'Direct',
                title: `📺 [Original Direct]\n${baseTitle}`,
                url: streamUrl,
                behaviorHints: stream.behaviorHints || {}
            });
        } else {
            // Passthrough stream with hint
            enhancedStreams.push(stream);
        }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.json({ streams: enhancedStreams });
}

router.get('/stream/:type/:id.json', handleStreams);
router.get('/:config/stream/:type/:id.json', handleStreams);

// Subtitles status route (optional notification)
router.get(['/subtitles/:type/:id.json', '/:config/subtitles/:type/:id.json'], async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.json({ subtitles: [] });
});

module.exports = router;
