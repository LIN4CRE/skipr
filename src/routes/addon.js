const express = require('express');
const router = express.Router();
const { MANIFEST, PUBLIC_URL } = require('../config/constants');
const { decodeConfig } = require('../utils/config-encoding');
const { detectClient } = require('../utils/client-detection');
const skipService = require('../services/skip-service');
const scraperResolver = require('../services/scraper-resolver');
const logger = require('../utils/logger');

function getBaseUrl(req) {
    const host = req.get('host') || '127.0.0.1:7005';
    let protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    if (host.includes('trycloudflare.com') || host.includes('render.com') || host.includes('vercel.app')) {
        protocol = 'https';
    }
    return `${protocol}://${host}`;
}

// Serve Addon Manifest
function handleManifest(req, res) {
    const userConfig = decodeConfig(req.params.config);
    const currentBase = getBaseUrl(req);

    const customManifest = {
        ...MANIFEST,
        logo: `${currentBase}/assets/icon.svg`,
        background: `${currentBase}/assets/banner.jpg`
    };

    if (userConfig.debridProvider && userConfig.debridProvider !== 'none') {
        customManifest.description = `⚡ Skipr [Active: ${userConfig.debridProvider.toUpperCase()}]: Auto-skips intros & recaps seamlessly.`;
    } else {
        customManifest.description = `⚡ Skipr [Free Mode]: Auto-skips TV intros & recaps seamlessly.`;
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
    const currentBase = getBaseUrl(req);

    logger.info(`Stream request for ${type}/${id} on ${clientInfo.client}`);

    // Check for skip segments (Intro & Outro)
    const skipSegments = await skipService.getSkipSegments(id);
    const introSkip = skipSegments ? skipSegments.find(s => s.category === 'Intro') : null;
    const outroSkip = skipSegments ? skipSegments.find(s => s.category === 'Outro') : null;

    // Fetch upstream streams (Torrentio free mode or custom scraper)
    const upstreamUrl = userConfig.scraperUrl || process.env.DEFAULT_SCRAPER_URL;
    const rawStreams = await scraperResolver.getStreams(upstreamUrl, type, id);

    if (!rawStreams || rawStreams.length === 0) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.json({ streams: [] });
    }

    const enhancedStreams = [];

    for (const stream of rawStreams) {
        const isTorrent = !stream.url && !stream.externalUrl && stream.infoHash;
        const effectiveStreamUrl = stream.url || stream.externalUrl || (isTorrent ? `http://127.0.0.1:11470/${stream.infoHash}/${stream.fileIdx || 0}` : null);
        const baseTitle = stream.title || stream.name || 'Stream';

        if (introSkip && effectiveStreamUrl) {
            const skipStart = Math.floor(introSkip.start);
            const skipEnd = Math.ceil(introSkip.end);
            const outroParam = outroSkip ? `&outroStart=${Math.floor(outroSkip.start)}` : '';

            const hlsUrl = `${currentBase}/hls/manifest.m3u8?stream=${encodeURIComponent(effectiveStreamUrl)}&start=${skipStart}&end=${skipEnd}&id=${id}&client=${clientInfo.client}${outroParam}`;

            let skipLabel = `⚡ [Auto-Skip Intro: ${skipStart}s - ${skipEnd}s]`;
            if (outroSkip) {
                skipLabel = `⚡ [Auto-Skip Intro & Outro]`;
            }

            const streamName = isTorrent ? '⚡ Skipr [Free P2P]' : '⚡ Skipr';

            // Add Skip-enabled stream
            enhancedStreams.push({
                name: streamName,
                title: `${skipLabel}\n${baseTitle}`,
                url: hlsUrl,
                behaviorHints: {
                    ...(stream.behaviorHints || {}),
                    bingeGroup: `skipr-${id}`
                }
            });

            // Add Original Direct Stream as fallback
            enhancedStreams.push(stream);
        } else {
            // Passthrough stream
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
