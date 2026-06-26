const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    // Check if running in Vercel or if file logging is explicitly disabled
    this.isFileLoggingEnabled = !process.env.VERCEL && !process.env.DISABLE_FILE_LOGGING;

    if (this.isFileLoggingEnabled) {
      this.logDirectory = path.join(__dirname, '../logs');

      // Create logs directory if it doesn't exist
      if (!fs.existsSync(this.logDirectory)) {
        fs.mkdirSync(this.logDirectory, { recursive: true });
      }
    }
  }

  /**
   * Log a message to file and console
   * @param {string} level - Log level (info, warn, error)
   * @param {string} message - Message to log
   * @param {Object} metadata - Additional metadata to log
   */
  log(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...metadata
    };

    // Write to log file only if enabled
    if (this.isFileLoggingEnabled) {
      const logFileName = `reward-distribution-${new Date().toISOString().split('T')[0]}.log`;
      const logFilePath = path.join(this.logDirectory, logFileName);

      try {
        fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n');
      } catch (err) {
        console.error('Failed to write to log file:', err);
      }
    }

    // Also log to console
    const consoleMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    if (Object.keys(metadata).length > 0) {
      console.log(consoleMessage, metadata);
    } else {
      console.log(consoleMessage);
    }
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {Object} metadata - Additional metadata
   */
  info(message, metadata = {}) {
    this.log('INFO', message, metadata);
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {Object} metadata - Additional metadata
   */
  warn(message, metadata = {}) {
    this.log('WARN', message, metadata);
  }

  /**
   * Log error message
   * @param {string} message - Error message
   * @param {Object} metadata - Additional metadata
   */
  error(message, metadata = {}) {
    this.log('ERROR', message, metadata);
  }

  /**
   * Log a successful transaction
   * @param {string} transactionSignature - Transaction signature
   * @param {string} recipient - Recipient address
   * @param {number} amount - Amount transferred
   */
  logTransaction(transactionSignature, recipient, amount) {
    this.info('Token transfer completed', {
      transaction: transactionSignature,
      recipient,
      amount,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log a failed transaction
   * @param {string} recipient - Recipient address
   * @param {number} amount - Amount that failed to transfer
   * @param {string} error - Error message
   */
  logTransactionError(recipient, amount, error) {
    this.error('Token transfer failed', {
      recipient,
      amount,
      error: error.message || error,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = new Logger();