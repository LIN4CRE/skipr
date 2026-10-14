require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const { PORT } = require('./src/config/constants');
const logger = require('./src/utils/logger');

let currentPublicUrl = process.env.PUBLIC_URL || null;

// Setup static ffmpeg / ffprobe binaries if available
try {
    const ffmpegPath = require('ffmpeg-static');
    const ffprobePath = require('ffprobe-static').path;
    if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
    if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);
} catch {
    logger.info('Using system ffmpeg / ffprobe binaries');
}

const addonRoutes = require('./src/routes/addon');
const hlsRoutes = require('./src/routes/hls');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static assets from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Web Configurator UI
app.get(['/', '/configure', '/configure.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server and Tunnel Info
app.get('/api/info', (req, res) => {
    res.json({
        localUrl: `http://localhost:${PORT}`,
        publicUrl: currentPublicUrl || `http://localhost:${PORT}`
    });
});

// Health Checks
app.get(['/health', '/ping'], (req, res) => {
    res.json({
        status: 'ok',
        name: 'Skipr',
        version: '1.0.0',
        uptime: process.uptime()
    });
});

// Stremio Addon & HLS Routes
app.use('/', addonRoutes);
app.use('/', hlsRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found', path: req.path });
});

// Global Error Handler
app.use((err, req, res, next) => {
    logger.error(`Unhandled error: ${err.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
});

if (require.main === module) {
    app.listen(PORT, '0.0.0.0', async () => {
        logger.success(`🚀 Skipr is running at: http://localhost:${PORT}`);
        logger.info(`⚙️  Configurator:     http://localhost:${PORT}/configure`);

        // Automatically start public HTTPS tunnel for Stremio TV & Web with auto-reconnect
        if (!process.env.PUBLIC_URL && process.env.DISABLE_TUNNEL !== 'true') {
            async function establishTunnel() {
                try {
                    const lt = require('localtunnel');
                    logger.info('Opening secure HTTPS tunnel for Stremio TV & Web...');
                    const tunnel = await lt({ port: PORT });
                    currentPublicUrl = tunnel.url;
                    logger.success(`🌐 Public HTTPS URL: ${currentPublicUrl}`);
                    logger.info(`📺 Stremio Manifest: ${currentPublicUrl}/manifest.json`);
                    logger.info(`⚙️  Web Configurator: ${currentPublicUrl}/configure`);

                    tunnel.on('close', () => {
                        logger.warn('HTTPS Tunnel disconnected. Reconnecting in 5 seconds...');
                        setTimeout(establishTunnel, 5000);
                    });
                    tunnel.on('error', (err) => {
                        logger.warn(`Tunnel error: ${err.message}. Retrying in 5 seconds...`);
                        setTimeout(establishTunnel, 5000);
                    });
                } catch (e) {
                    logger.warn(`Could not start HTTPS tunnel: ${e.message}. Retrying in 10s...`);
                    setTimeout(establishTunnel, 10000);
                }
            }
            establishTunnel();
        } else if (currentPublicUrl) {
            logger.info(`🌐 Public URL configured: ${currentPublicUrl}`);
        }
    });
}

module.exports = app;
