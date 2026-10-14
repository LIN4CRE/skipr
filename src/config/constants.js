const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 7005;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');

const MANIFEST = {
    id: 'org.skipr.addon',
    version: '1.0.0',
    name: 'Skipr',
    description: '⚡ Skipr: Auto-skips TV intros & recaps seamlessly on TV and desktop.',
    logo: `${PUBLIC_URL}/assets/icon.svg`,
    background: `${PUBLIC_URL}/assets/banner.jpg`,
    resources: ['stream', 'subtitles'],
    types: ['movie', 'series', 'anime'],
    idPrefixes: ['tt', 'kitsu'],
    catalogs: [],
    behaviorHints: {
        configurable: true,
        configurationRequired: false
    }
};

module.exports = {
    PORT,
    PUBLIC_URL,
    MANIFEST,
    SUPPORTED_DEBRIDS: ['realdebrid', 'torbox', 'alldebrid', 'premiumize'],
    DEFAULT_SCRAPERS: {
        torrentio: 'https://torrentio.strem.fun',
        comet: 'https://comet.elfhosted.com',
        aiostreams: 'https://aiostreams.elfhosted.com'
    }
};
