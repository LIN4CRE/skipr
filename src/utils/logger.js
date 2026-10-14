function formatTime() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

const logger = {
    info: (msg, ...args) => console.log(`\x1b[36m[${formatTime()}] [INFO]\x1b[0m ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`\x1b[33m[${formatTime()}] [WARN]\x1b[0m ${msg}`, ...args),
    error: (msg, ...args) => console.error(`\x1b[31m[${formatTime()}] [ERROR]\x1b[0m ${msg}`, ...args),
    success: (msg, ...args) => console.log(`\x1b[32m[${formatTime()}] [SUCCESS]\x1b[0m ${msg}`, ...args),
    debug: (msg, ...args) => {
        if (process.env.DEBUG) {
            console.log(`\x1b[90m[${formatTime()}] [DEBUG]\x1b[0m ${msg}`, ...args);
        }
    }
};

module.exports = logger;
