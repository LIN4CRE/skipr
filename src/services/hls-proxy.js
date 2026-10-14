const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const logger = require('../utils/logger');

class HlsProxyService {
    /**
     * Inspect stream headers: get total duration and content length
     */
    async getStreamDetails(streamUrl) {
        let contentLength = 0;
        let finalUrl = streamUrl;

        try {
            const resp = await axios.get(streamUrl, {
                maxRedirects: 5,
                timeout: 8000,
                headers: { 'Range': 'bytes=0-0', 'User-Agent': 'Stremio/4.4' },
                responseType: 'stream'
            });

            finalUrl = resp.request.res.responseUrl || resp.config.url || streamUrl;
            const cr = resp.headers['content-range'];
            if (cr) {
                const match = cr.match(/\/(\d+)/);
                if (match) contentLength = parseInt(match[1], 10);
            }
            if (!contentLength && resp.headers['content-length']) {
                contentLength = parseInt(resp.headers['content-length'], 10);
            }
            resp.data.destroy();
        } catch (e) {
            logger.debug(`Could not get stream details via range: ${e.message}`);
        }

        // Try ffprobe for duration if needed
        const duration = await new Promise((resolve) => {
            ffmpeg.ffprobe(finalUrl, (err, meta) => {
                if (!err && meta && meta.format && meta.format.duration) {
                    resolve(parseFloat(meta.format.duration));
                } else {
                    resolve(0);
                }
            });
        });

        return {
            finalUrl,
            contentLength,
            duration: duration || 2400 // Default 40min if unknown
        };
    }

    /**
     * Get byte offset for a specific timestamp (seconds)
     */
    async getByteOffset(streamUrl, timeSeconds, duration, totalLength) {
        if (!totalLength || !duration || duration <= 0) return 0;

        // Try ffprobe keyframe seeking first
        try {
            const offset = await new Promise((resolve) => {
                ffmpeg(streamUrl)
                    .inputOptions([`-ss ${Math.max(0, timeSeconds - 2)}`, '-read_intervals', `%+5`])
                    .outputOptions(['-c copy', '-f null'])
                    .on('start', () => {})
                    .on('error', () => resolve(0))
                    .on('end', () => resolve(0));
            });
            if (offset > 0) return offset;
        } catch {
            // fallback
        }

        // Linear interpolation estimate aligned to 188-byte TS or 4096-byte chunk
        const ratio = Math.min(1, Math.max(0, timeSeconds / duration));
        let approxByte = Math.floor(ratio * totalLength);
        approxByte = approxByte - (approxByte % 4096);
        return approxByte;
    }

    /**
     * Generate an HLS manifest that starts playback right after the intro (Single Segment Slice)
     */
    generateSmartManifest(streamUrl, duration, skipEndByte, totalLength) {
        const remainingLength = Math.max(0, totalLength - skipEndByte);
        const approxDuration = Math.max(1, duration);

        return [
            '#EXTM3U',
            '#EXT-X-VERSION:4',
            `#EXT-X-TARGETDURATION:${Math.ceil(approxDuration)}`,
            '#EXT-X-MEDIA-SEQUENCE:0',
            '#EXT-X-PLAYLIST-TYPE:VOD',
            `#EXTINF:${approxDuration.toFixed(2)},`,
            `#EXT-X-BYTERANGE:${remainingLength}@${skipEndByte}`,
            streamUrl,
            '#EXT-X-ENDLIST'
        ].join('\n');
    }

    /**
     * Generate a multi-segment fragmented HLS manifest that cuts out the intro range
     */
    generateFragmentedManifest(streamUrl, duration, totalLength, skipRange) {
        if (!skipRange || !skipRange.startOffset || !skipRange.endOffset) {
            // Passthrough manifest
            return [
                '#EXTM3U',
                '#EXT-X-VERSION:4',
                `#EXT-X-TARGETDURATION:${Math.ceil(duration)}`,
                '#EXT-X-MEDIA-SEQUENCE:0',
                '#EXT-X-PLAYLIST-TYPE:VOD',
                `#EXTINF:${duration.toFixed(2)},`,
                `#EXT-X-BYTERANGE:${totalLength}@0`,
                streamUrl,
                '#EXT-X-ENDLIST'
            ].join('\n');
        }

        const part1Length = skipRange.startOffset;
        const part2Start = skipRange.endOffset;
        const part2Length = Math.max(0, totalLength - part2Start);

        const part1Dur = Math.max(1, skipRange.startTime || 0);
        const part2Dur = Math.max(1, duration - (skipRange.endTime || part1Dur));
        const maxDur = Math.ceil(Math.max(part1Dur, part2Dur));

        const lines = [
            '#EXTM3U',
            '#EXT-X-VERSION:4',
            `#EXT-X-TARGETDURATION:${maxDur}`,
            '#EXT-X-MEDIA-SEQUENCE:0',
            '#EXT-X-PLAYLIST-TYPE:VOD'
        ];

        // Part 1: Pre-intro
        if (part1Length > 0 && part1Dur > 1) {
            lines.push(
                `#EXTINF:${part1Dur.toFixed(2)},`,
                `#EXT-X-BYTERANGE:${part1Length}@0`,
                streamUrl,
                '#EXT-X-DISCONTINUITY'
            );
        }

        // Part 2: Post-intro to end
        lines.push(
            `#EXTINF:${part2Dur.toFixed(2)},`,
            `#EXT-X-BYTERANGE:${part2Length}@${part2Start}`,
            streamUrl,
            '#EXT-X-ENDLIST'
        );

        return lines.join('\n');
    }
}

module.exports = new HlsProxyService();
