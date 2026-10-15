const http = require('http');
const assert = require('assert');
const app = require('../server');

function makeRequest(path, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.get({
            hostname: '127.0.0.1',
            port: 7006,
            path: path,
            headers: headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    parsed = data;
                }
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: parsed
                });
            });
        });
        req.on('error', reject);
    });
}

async function runIntegrationTests() {
    console.log('🚀 Running Skipr Full HTTP Integration Tests on port 7006...\n');

    const server = app.listen(7006, '127.0.0.1');
    await new Promise(r => setTimeout(r, 500));

    try {
        // Test 1: Health check
        console.log('1. Testing /health...');
        const health = await makeRequest('/health');
        assert.strictEqual(health.statusCode, 200);
        assert.strictEqual(health.body.status, 'ok');
        assert.strictEqual(health.body.name, 'Skipr');
        console.log('   ✅ /health returned 200 OK with correct status payload\n');

        // Test 2: Unconfigured Manifest
        console.log('2. Testing /manifest.json...');
        const manifest = await makeRequest('/manifest.json');
        assert.strictEqual(manifest.statusCode, 200);
        assert.strictEqual(manifest.body.id, 'org.skipr.addon');
        assert.strictEqual(manifest.body.name, 'Skipr');
        assert.ok(manifest.body.resources.includes('stream'));
        assert.ok(manifest.body.types.includes('series'));
        assert.ok(manifest.body.types.includes('movie'));
        console.log('   ✅ /manifest.json conforms to Stremio Addon Protocol v3\n');

        // Test 3: Configured Manifest with Debrid
        console.log('3. Testing /:config/manifest.json...');
        const testConfig = 'eyJkZWJyaWRQcm92aWRlciI6InJlYWxkZWJyaWQiLCJkZWJyaWRLZXkiOiJteV90b2tlbiJ9';
        const customManifest = await makeRequest(`/${testConfig}/manifest.json`);
        assert.strictEqual(customManifest.statusCode, 200);
        assert.ok(customManifest.body.description.includes('REALDEBRID'));
        console.log('   ✅ /:config/manifest.json successfully unpacks and applies user config\n');

        // Test 4: Web Configurator
        console.log('4. Testing / and /configure HTML pages...');
        const homePage = await makeRequest('/');
        assert.strictEqual(homePage.statusCode, 200);
        assert.ok(typeof homePage.body === 'string');
        assert.ok(homePage.body.includes('<title>Skipr — Auto Intro Skip for Stremio</title>'));
        assert.ok(homePage.body.includes('Install to Stremio'));

        const configPage = await makeRequest('/configure');
        assert.strictEqual(configPage.statusCode, 200);
        console.log('   ✅ Web configurator serves responsive HTML UI properly\n');

        // Test 5: Static Brand Assets
        console.log('5. Testing /assets/icon.svg and /assets/banner.jpg...');
        const icon = await makeRequest('/assets/icon.svg');
        assert.strictEqual(icon.statusCode, 200);
        assert.ok(icon.headers['content-type'].includes('image/svg'));

        const banner = await makeRequest('/assets/banner.jpg');
        assert.strictEqual(banner.statusCode, 200);
        assert.ok(banner.headers['content-type'].includes('image/jpeg'));
        console.log('   ✅ SVG icon and Banner JPEG serve properly with correct MIME types\n');

        // Test 6: Subtitles route
        console.log('6. Testing /subtitles/series/tt0944947:1:1.json...');
        const subs = await makeRequest('/subtitles/series/tt0944947:1:1.json');
        assert.strictEqual(subs.statusCode, 200);
        assert.ok(Array.isArray(subs.body.subtitles));
        console.log('   ✅ Subtitles endpoint conforms to Stremio protocol\n');

        // Test 7: HLS Manifest Generation Endpoint
        console.log('7. Testing /hls/manifest.m3u8...');
        const testStreamUrl = encodeURIComponent('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
        const hls = await makeRequest(`/hls/manifest.m3u8?stream=${testStreamUrl}&start=5&end=25&id=sample&client=android-tv`);
        assert.strictEqual(hls.statusCode, 200);
        assert.ok(hls.headers['content-type'].includes('application/vnd.apple.mpegurl'));
        assert.ok(typeof hls.body === 'string');
        assert.ok(hls.body.includes('#EXT-X-BYTERANGE:') || hls.body.includes('#EXT-X-START:TIME-OFFSET='));
        console.log('   ✅ HLS auto-skip manifest generates valid .m3u8 playlist with skip markers\n');

        // Test 8: 404 Route handling
        console.log('8. Testing 404 handler for invalid routes...');
        const notFound = await makeRequest('/non-existent-route');
        assert.strictEqual(notFound.statusCode, 404);
        assert.strictEqual(notFound.body.error, 'Route not found');
        console.log('   ✅ Non-existent routes return structured 404 response\n');

        // Test 9: Skip Tester API endpoint
        console.log('9. Testing /api/test-skip?id=tt0944947:1:1...');
        const skipTest = await makeRequest('/api/test-skip?id=tt0944947:1:1');
        assert.strictEqual(skipTest.statusCode, 200);
        assert.strictEqual(skipTest.body.id, 'tt0944947:1:1');
        assert.ok(Array.isArray(skipTest.body.segments));
        assert.ok(skipTest.body.segments.length > 0);
        console.log('   ✅ /api/test-skip returned valid skip segments for Game of Thrones S01E01\n');

        console.log('🎉 ALL 9 INTEGRATION TESTS PASSED WITH ZERO ERRORS!\n');
    } finally {
        server.close();
    }
}

runIntegrationTests().catch(err => {
    console.error('❌ Integration test failed:', err);
    process.exit(1);
});
