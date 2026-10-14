const axios = require('axios');
const logger = require('../utils/logger');

class DebridResolver {
    /**
     * Unrestrict a stream link via Real-Debrid
     */
    async unrestrictRealDebrid(apiKey, link) {
        try {
            const formData = new URLSearchParams();
            formData.append('link', link);

            const resp = await axios.post('https://api.real-debrid.com/rest/1.0/unrestrict/link', formData, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 8000
            });

            return resp.data && resp.data.download ? resp.data.download : null;
        } catch (e) {
            logger.warn(`RD Unrestrict failed: ${e.response?.data?.error || e.message}`);
            return null;
        }
    }

    /**
     * Unrestrict a link via TorBox
     */
    async unrestrictTorbox(apiKey, link) {
        try {
            const resp = await axios.post('https://api.torbox.app/v1/api/torrents/requestdl', {
                link
            }, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                timeout: 8000
            });

            return resp.data?.data || null;
        } catch (e) {
            logger.warn(`TorBox request failed: ${e.message}`);
            return null;
        }
    }

    /**
     * General unrestrict wrapper
     */
    async unrestrict(provider, apiKey, link) {
        if (!apiKey || !link) return link;

        switch (provider?.toLowerCase()) {
            case 'torbox':
                return (await this.unrestrictTorbox(apiKey, link)) || link;
            case 'realdebrid':
            default:
                return (await this.unrestrictRealDebrid(apiKey, link)) || link;
        }
    }
}

module.exports = new DebridResolver();
