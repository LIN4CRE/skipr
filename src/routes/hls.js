const express = require('express');
const router = express.Router();
const hlsProxy = require('../services/hls-proxy');
const skipService = require('../services/skip-service');
const { detectClient } = require('../utils/client-detection');
const logger = require('../utils/logger');

router.get(['/hls/manifest.m3u8', '/:config/hls/manifest.m3u8'], async (req, res) => {
    const { stream, start, end, id, client } = req.query;

    if (!stream) {
        return res.status(400).send('Missing stream URL parameter');
    }

    const clientInfo = detectClient(req.get('User-Agent'), req.get('Origin'));
    let introStart = parseFloat(start) || 0;
    let introEnd = parseFloat(end) || 0;

    logger.info(`Generating Skipr HLS manifest for ${id || 'stream'} (Skip: ${introStart}s - ${introEnd}s) on ${clientInfo.client}`);

    try {
        // Fetch stream media details
        const details = await hlsProxy.getStreamDetails(stream);
        const resolvedUrl = details.finalUrl || stream;
        const totalLength = details.contentLength;
        const duration = details.duration || 2400;

        // If no skip data was supplied in query params, attempt chapter detection
        if ((!introStart && !introEnd) || introEnd <= introStart) {
            const chapterSkip = await skipService.getSkipFromChapters(resolvedUrl);
            if (chapterSkip) {
                introStart = chapterSkip.start;
                introEnd = chapterSkip.end;
                logger.info(`Found intro via embedded chapters: ${introStart}s - ${introEnd}s`);
            }
        }

        // Generate manifest if skip interval exists
        let manifestContent = '';

        if (introEnd > introStart && totalLength > 0) {
            const startByte = await hlsProxy.getByteOffset(resolvedUrl, introStart, duration, totalLength);
            const endByte = await hlsProxy.getByteOffset(resolvedUrl, introEnd, duration, totalLength);

            if (clientInfo.isTv || introStart < 5) {
                // For TV or if intro begins early in the episode, use single-segment smart splice
                manifestContent = hlsProxy.generateSmartManifest(resolvedUrl, duration, endByte, totalLength);
            } else {
                // Multi-segment fragmented skip
                manifestContent = hlsProxy.generateFragmentedManifest(resolvedUrl, duration, totalLength, {
                    startTime: introStart,
                    endTime: introEnd,
                    startOffset: startByte,
                    endOffset: endByte
                });
            }
        } else {
            // Direct passthrough manifest or 302 redirect
            if (clientInfo.isTv) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.redirect(302, resolvedUrl);
            }
            manifestContent = hlsProxy.generateFragmentedManifest(resolvedUrl, duration, totalLength || 1000000, null);
        }

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(manifestContent);
    } catch (e) {
        logger.error(`HLS Manifest error: ${e.message}`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.redirect(302, stream);
    }
});

module.exports = router;
