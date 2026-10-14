function detectClient(userAgent = '', origin = '') {
    const ua = (userAgent || '').toLowerCase();
    const orig = (origin || '').toLowerCase();

    const isWebStremio = ua.includes('stremio/web') || orig.includes('strem.io') || orig.includes('stremio.com');
    const isFireTv = ua.includes('aftm') || ua.includes('aftb') || ua.includes('aftt') || ua.includes('fire tv') || ua.includes('silk/');
    const isTizen = ua.includes('tizen');
    const isWebOs = ua.includes('webos') || ua.includes('web0s');
    const isAndroid = ua.includes('android') || ua.includes('exoplayer') || ua.includes('shield') || ua.includes('google tv') || ua.includes('bravia');
    const isAndroidTv = isAndroid && (ua.includes('android tv') || ua.includes('aft') || ua.includes('google tv') || ua.includes('bravia') || ua.includes('shield'));
    const isIos = ua.includes('iphone') || ua.includes('ipad') || (ua.includes('ios') && !ua.includes('stremio'));

    let client = 'desktop';
    if (isWebStremio) client = 'web';
    else if (isFireTv) client = 'fire-tv';
    else if (isTizen) client = 'tizen';
    else if (isWebOs) client = 'webos';
    else if (isAndroidTv) client = 'android-tv';
    else if (isAndroid) client = 'android';
    else if (isIos) client = 'ios';

    const isTv = isFireTv || isTizen || isWebOs || isAndroidTv;
    const needsConstrainedPlayer = isWebStremio || isAndroid || isTv;

    return {
        client,
        isTv,
        isAndroidTv,
        isWebStremio,
        needsConstrainedPlayer
    };
}

module.exports = {
    detectClient
};
