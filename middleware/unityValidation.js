const UNITY_VALIDATION_HEADER = process.env.UNITY_VALIDATION_HEADER || 'X-Unity-Validation';
const UNITY_VALIDATION_TOKEN = process.env.UNITY_VALIDATION_TOKEN;
const ALLOWED_IPS = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : [];

/**
 * Get the client IP address from the request
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
const getClientIp = (req) => {
  // Check various headers for proxy scenarios
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         '127.0.0.1';
};

/**
 * Middleware to validate that requests come from our Unity game
 */
const unityValidationMiddleware = (req, res, next) => {
  // If no validation token is set in environment, skip validation (for development)
  if (!UNITY_VALIDATION_TOKEN) {
    console.warn('UNITY_VALIDATION_TOKEN not set. Skipping Unity validation for development.');
    return next();
  }

  // Check for IP address if configured
  if (ALLOWED_IPS.length > 0) {
    const clientIp = getClientIp(req);
    const isAllowedIp = ALLOWED_IPS.some(allowedIp => 
      clientIp === allowedIp.trim() || 
      clientIp.replace(/^.*:/, '') === allowedIp.trim().replace(/^.*:/, '') // Handle IPv4-mapped IPv6 addresses
    );
    
    if (!isAllowedIp) {
      return res.status(401).json({
        error: 'Unauthorized: Request from untrusted IP address',
        message: `IP address ${clientIp} is not in the allowed list`,
        allowedIps: ALLOWED_IPS
      });
    }
  }

  // Check for the validation header
  const validationHeader = req.headers[UNITY_VALIDATION_HEADER.toLowerCase()];
  
  if (!validationHeader) {
    return res.status(401).json({
      error: 'Unauthorized: Missing Unity validation header',
      message: `Expected header: ${UNITY_VALIDATION_HEADER}`
    });
  }

  // Validate the token
  if (validationHeader !== UNITY_VALIDATION_TOKEN) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid Unity validation token',
      message: 'The validation token provided does not match the expected value'
    });
  }

  // Validation passed, continue to next middleware/route handler
  next();
};

module.exports = { unityValidationMiddleware };