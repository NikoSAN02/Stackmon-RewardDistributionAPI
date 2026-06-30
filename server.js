require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const RewardController = require('./controllers/rewardController');
const UserStatsController = require('./controllers/userStatsController');
const { unityValidationMiddleware } = require('./middleware/unityValidation');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;
const rewardController = new RewardController();
const userStatsController = new UserStatsController();

// Rate limiting: Max 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Rate Limit Exceeded',
    message: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all requests
app.use(limiter);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "validator.swagger.io"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https:", "data:", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https:", "wss:"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true
  }
}));
app.use(cors({
  origin: [
    'https://stackmon.fun', 
    'https://www.stackmon.fun', 
    'https://killers-area-sol-reward-distributio.vercel.app', 
    'http://localhost:3000',
    'https://crashdash.xyz',
    'https://www.crashdash.xyz',
    'https://crashy-chasy.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Handle explicit OPTIONS requests
app.options('*', cors());

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Serve static demo files (absolute path)
app.use(express.static(path.join(__dirname, 'public')));

// Log incoming requests
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve browser demo page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Get server wallet balance
app.get('/balance', unityValidationMiddleware, (req, res) => {
  rewardController.getBalance(req, res);
});

// Single reward distribution endpoint (Standard)
app.post('/distribute-normal', unityValidationMiddleware, (req, res) => {
  rewardController.distributeReward(req, res);
});

// Single Magicblock reward distribution endpoint
app.post('/distribute', unityValidationMiddleware, (req, res) => {
  rewardController.distributeMagicblockReward(req, res);
});

// Single Magicblock reward distribution setup (multi-signature flow)
app.post('/distribute-private-setup', unityValidationMiddleware, (req, res) => {
  rewardController.distributePrivateSetup(req, res);
});

// Batch reward distribution endpoint
app.post('/distribute-batch', unityValidationMiddleware, (req, res) => {
  rewardController.distributeBatchRewards(req, res);
});

// Record user data endpoint
app.post('/recordUserData', unityValidationMiddleware, (req, res) => {
  userStatsController.recordUserData(req, res);
});

// Update user data endpoint
app.put('/recordUserData', unityValidationMiddleware, (req, res) => {
  userStatsController.updateUserData(req, res);
});

// Update game stats endpoint (Extended Key)
app.post('/UpdateGameStats', unityValidationMiddleware, (req, res) => {
  userStatsController.updateGameStats(req, res);
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    ip: req.ip
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn('Route not found', { method: req.method, url: req.url, ip: req.ip });

  res.status(404).json({
    error: 'Route Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise: promise,
    reason: reason
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Start server
app.listen(PORT, () => {
  console.log(`Reward Distribution API server is running on port ${PORT}`);
  console.log(`Network: ${process.env.SOLANA_NETWORK || 'devnet'}`);
  console.log(`RPC URL: ${process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'}`);
  logger.info('Server started', { port: PORT, network: process.env.SOLANA_NETWORK || 'devnet' });
});

module.exports = app;