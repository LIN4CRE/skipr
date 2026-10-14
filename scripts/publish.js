const axios = require('axios');
const logger = require('../src/utils/logger');

async function publishToStremioDirectory(manifestUrl) {
    if (!manifestUrl) {
        manifestUrl = process.argv[2] || process.env.PUBLIC_URL;
    }

    if (!manifestUrl) {
        logger.error('Missing manifest URL. Usage: node scripts/publish.js https://your-domain.com/manifest.json');
        process.exit(1);
    }

    if (!manifestUrl.endsWith('/manifest.json')) {
        manifestUrl = manifestUrl.replace(/\/$/, '') + '/manifest.json';
    }

    if (manifestUrl.includes('localhost') || manifestUrl.includes('127.0.0.1')) {
        logger.error('Stremio Central API requires a public URL (e.g. https://your-skipr.onrender.com/manifest.json), not localhost!');
        logger.info('Tip: Deploy for free with Render or expose your local port with ngrok / localtunnel: npx localtunnel --port 7005');
        process.exit(1);
    }

    logger.info(`Publishing to Stremio Central Directory: ${manifestUrl}...`);

    try {
        const resp = await axios.post('https://api.strem.io/api/addonPublish', {
            transportUrl: manifestUrl,
            transportName: 'http'
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        if (resp.data && resp.data.result && resp.data.result.success) {
            logger.success('🎉 Successfully submitted to Stremio Community Addons Catalog!');
            logger.info('Your addon is now registered with Stremio and will appear in search results across apps.');
        } else {
            logger.info(`Stremio Response: ${JSON.stringify(resp.data)}`);
            logger.success('Submitted request to Stremio Central.');
        }
    } catch (e) {
        logger.error(`Publish failed: ${e.response?.data?.error || e.message}`);
    }
}

const targetUrl = process.argv[2] || (process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/manifest.json` : null);
publishToStremioDirectory(targetUrl);
