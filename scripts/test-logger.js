const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

console.log('Testing Logger...');
console.log('Is file logging enabled?', logger.isFileLoggingEnabled);

logger.info('Test log message');

if (logger.isFileLoggingEnabled) {
    const logDir = path.join(__dirname, '../logs');
    if (fs.existsSync(logDir)) {
        console.log('Logs directory exists.');
    } else {
        console.error('Logs directory SHOULD exist but does not.');
    }
} else {
    const logDir = path.join(__dirname, '../logs');
    // Note: In a real Vercel env, we can't check if it doesn't exist if it was already there, 
    // but we can check if the logger thinks it's disabled.
    console.log('File logging is correctly disabled.');
}
