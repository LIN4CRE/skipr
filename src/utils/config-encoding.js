function encodeConfig(configObj) {
    try {
        const jsonStr = JSON.stringify(configObj);
        return Buffer.from(jsonStr, 'utf8')
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    } catch {
        return '';
    }
}

function decodeConfig(encodedStr) {
    if (!encodedStr) return {};
    try {
        // Pad back base64 string
        let base64 = encodedStr.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
            base64 += '=';
        }
        const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
        return JSON.parse(jsonStr);
    } catch {
        return {};
    }
}

module.exports = {
    encodeConfig,
    decodeConfig
};
