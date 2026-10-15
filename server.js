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
            const { spawn, execSync } = require('child_process');
            const axios = require('axios');

            async function publishToStremio(manifestUrl) {
                try {
                    const resp = await axios.post('https://api.strem.io/api/addonPublish', {
                        transportUrl: manifestUrl,
                        transportName: 'http'
                    }, { timeout: 8000 });
                    logger.success(`📡 Stremio Central Registry updated: ${JSON.stringify(resp.data)}`);
                } catch (err) {
                    logger.warn(`Stremio Central notification: ${err.response?.data?.error?.message || err.message}`);
                }
            }

            function startCloudflaredTunnel() {
                logger.info('Starting Cloudflare Tunnel for high-speed HTTPS access...');
                let tunnelProc = null;
                try {
                    tunnelProc = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${PORT}`]);
                } catch (e) {
                    return null;
                }

                tunnelProc.stderr.on('data', (data) => {
                    const str = data.toString();
                    const match = str.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/i);
                    if (match && currentPublicUrl !== match[0]) {
                        currentPublicUrl = match[0];
                        logger.success(`🌐 Public Cloudflare HTTPS URL: ${currentPublicUrl}`);
                        logger.info(`📺 Stremio Manifest: ${currentPublicUrl}/manifest.json`);
                        logger.info(`⚙️  Web Configurator: ${currentPublicUrl}/configure`);
                        setTimeout(() => publishToStremio(`${currentPublicUrl}/manifest.json`), 5000);
                    }
                });

                tunnelProc.on('close', () => {
                    logger.warn('Cloudflare tunnel closed. Reconnecting in 5 seconds...');
                    setTimeout(startCloudflaredTunnel, 5000);
                });

                tunnelProc.on('error', () => {
                    logger.warn('Could not launch cloudflared. Falling back to localtunnel...');
                    startLocaltunnel();
                });

                return tunnelProc;
            }

            function startLocaltunnel() {
                const lt = require('localtunnel');
                logger.info('Opening fallback HTTPS tunnel...');
                lt({ port: PORT })
                    .then(tunnel => {
                        currentPublicUrl = tunnel.url;
                        logger.success(`🌐 Public HTTPS URL: ${currentPublicUrl}`);
                        publishToStremio(`${currentPublicUrl}/manifest.json`);

                        tunnel.on('close', () => {
                            logger.warn('Tunnel closed. Reconnecting in 5s...');
                            setTimeout(startLocaltunnel, 5000);
                        });
                        tunnel.on('error', () => setTimeout(startLocaltunnel, 5000));
                    })
                    .catch(() => setTimeout(startLocaltunnel, 10000));
            }

            // Test if cloudflared is available
            try {
                execSync('cloudflared --version', { stdio: 'ignore' });
                startCloudflaredTunnel();
            } catch {
                startLocaltunnel();
            }
        } else if (currentPublicUrl) {
            logger.info(`🌐 Public URL configured: ${currentPublicUrl}`);
        }
    });
}

module.exports = app;
