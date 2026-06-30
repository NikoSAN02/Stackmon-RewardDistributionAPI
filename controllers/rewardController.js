const TokenService = require('../services/tokenService');
const Joi = require('joi');
const logger = require('../utils/logger');
const { PublicKey } = require('@solana/web3.js');

// Validation schema for single reward request
const singleRewardSchema = Joi.object({
  address: Joi.string().required().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).messages({
    'string.pattern.base': 'Invalid Solana address format'
  }),
  score: Joi.number().required(),
  mode: Joi.string().valid('practice', 'bot', 'ranked').required(),
  bonus_sol: Joi.number().min(0).required(),
  bet_amount: Joi.number().min(0).required()
});

// Validation schema for batch reward request
const batchRewardSchema = Joi.array().items(
  Joi.object({
    address: Joi.string().required().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).messages({
      'string.pattern.base': 'Invalid Solana address format'
    }),
    amount: Joi.number().positive().required()
  })
).min(1).max(100); // Max 100 transfers per batch request

class RewardController {
  constructor() {
    this.tokenService = new TokenService();
  }

  /**
   * Distribute rewards to a single user
   */
  async distributeReward(req, res) {
    try {
      logger.info('Processing single reward distribution', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body
      });

      // Validate request body
      const { error, value } = singleRewardSchema.validate(req.body);
      if (error) {
        logger.warn('Validation failed for single reward distribution', {
          error: error.details[0].message,
          body: req.body
        });

        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message
        });
      }

      const { address, score, mode, bonus_sol, bet_amount } = value;

      let calculatedReward = 0;

      // Calculate the Base Reward based on the Game Mode
      if (mode === "practice") {
          // Practice Mode: 1000 points = 1 SOL (0.001 per point)
          calculatedReward = score * 0.001;
      } 
      else if (mode === "bot") {
          // Bot Mode: 1000 points = 0.5 SOL (0.0005 per point)
          calculatedReward = score * 0.0005;
      } 
      else if (mode === "ranked") {
          // Online Ranked Mode: Winner takes 1.8x of their original bet
          calculatedReward = bet_amount * 1.8;
      }

      // Add the Combo Multiplier Bonus (The extra SOL earned by placing perfect blocks)
      const finalRewardToDistribute = calculatedReward + bonus_sol;

      if (finalRewardToDistribute <= 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Calculated reward must be greater than 0'
        });
      }

      // Perform the SOL transfer
      const transactionSignature = await this.tokenService.transferSol(address, finalRewardToDistribute);

      res.status(200).json({
        success: true,
        message: 'SOL reward distributed successfully',
        data: {
          recipient: address,
          amount: finalRewardToDistribute,
          transaction: transactionSignature,
          breakdown: {
            baseReward: calculatedReward,
            bonus: bonus_sol
          }
        }
      });

      logger.info('Single reward distribution completed', {
        transaction: transactionSignature,
        recipient: address,
        amount: finalRewardToDistribute
      });
    } catch (error) {
      logger.error('Error distributing single reward', {
        error: error.message,
        body: req.body,
        ip: req.ip
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Distribute rewards to a single user using Magicblock
   */
  async distributeMagicblockReward(req, res) {
    try {
      logger.info('Processing single Magicblock reward distribution', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body
      });

      // Validate request body
      const { error, value } = singleRewardSchema.validate(req.body);
      if (error) {
        logger.warn('Validation failed for single Magicblock reward distribution', {
          error: error.details[0].message,
          body: req.body
        });

        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message
        });
      }

      const { address, score, mode, bonus_sol, bet_amount } = value;

      let calculatedReward = 0;

      // Calculate the Base Reward based on the Game Mode
      if (mode === "practice") {
          // Practice Mode: 1000 points = 1 SOL (0.001 per point)
          calculatedReward = score * 0.001;
      } 
      else if (mode === "bot") {
          // Bot Mode: 1000 points = 0.5 SOL (0.0005 per point)
          calculatedReward = score * 0.0005;
      } 
      else if (mode === "ranked") {
          // Online Ranked Mode: Winner takes 1.8x of their original bet
          calculatedReward = bet_amount * 1.8;
      }

      // Add the Combo Multiplier Bonus (The extra SOL earned by placing perfect blocks)
      const finalRewardToDistribute = calculatedReward + bonus_sol;

      if (finalRewardToDistribute <= 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Calculated reward must be greater than 0'
        });
      }

      // Perform the SOL transfer via Magicblock private payments
      const transactionSignature = await this.tokenService.transferSolMagicblock(address, finalRewardToDistribute);

      res.status(200).json({
        success: true,
        message: 'Magicblock SOL reward distributed successfully (private ephemeral transfer)',
        data: {
          recipient: address,
          amount: finalRewardToDistribute,
          transaction: transactionSignature,
          breakdown: {
            baseReward: calculatedReward,
            bonus: bonus_sol
          }
        }
      });

      logger.info('Single Magicblock reward distribution completed', {
        transaction: transactionSignature,
        recipient: address,
        amount: finalRewardToDistribute
      });
    } catch (error) {
      logger.error('Error distributing single Magicblock reward', {
        error: error.message,
        body: req.body,
        ip: req.ip
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Distribute rewards to multiple users in batch
   */
  async distributeBatchRewards(req, res) {
    try {
      logger.info('Processing batch reward distribution', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        recipientCount: Array.isArray(req.body) ? req.body.length : 0
      });

      // Validate request body
      const { error, value } = batchRewardSchema.validate(req.body);
      if (error) {
        logger.warn('Validation failed for batch reward distribution', {
          error: error.details[0].message,
          body: req.body
        });

        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message
        });
      }

      const recipients = value;

      // Perform batch SOL transfers
      const results = await this.tokenService.transferSolBatch(recipients);

      // Calculate summary
      const successfulTransfers = results.filter(r => r.success).length;
      const failedTransfers = results.filter(r => !r.success).length;

      res.status(200).json({
        success: true,
        message: `Batch reward distribution completed. ${successfulTransfers} successful, ${failedTransfers} failed`,
        data: {
          totalRequested: recipients.length,
          successful: successfulTransfers,
          failed: failedTransfers,
          results: results
        }
      });

      logger.info('Batch reward distribution completed', {
        totalRequested: recipients.length,
        successful: successfulTransfers,
        failed: failedTransfers
      });
    } catch (error) {
      logger.error('Error distributing batch rewards', {
        error: error.message,
        body: req.body,
        ip: req.ip
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Get server wallet balance
   */
  async getBalance(req, res) {
    try {
      logger.info('Balance check requested', { ip: req.ip });

      const solanaService = this.tokenService.solanaService;
      const serverWalletPubkey = solanaService.getServerWallet().publicKey;

      const solBalance = await solanaService.getSolBalance();

      const WSOL_MINT_ADDRESS = new PublicKey('So11111111111111111111111111111111111111112');
      let baseWsolBalance = 0;
      try {
        baseWsolBalance = await solanaService.getServerTokenBalance(WSOL_MINT_ADDRESS);
      } catch (err) {
        logger.warn('Error fetching server base WSOL balance', { error: err.message });
      }

      let ephemeralWsolBalance = 0;
      try {
        const rawPrivateBalance = await solanaService.getMagicblockPrivateBalance(WSOL_MINT_ADDRESS.toBase58());
        ephemeralWsolBalance = rawPrivateBalance / 1_000_000_000; // Convert lamports to SOL
      } catch (err) {
        logger.warn('Error fetching server ephemeral WSOL balance', { error: err.message });
      }

      res.status(200).json({
        success: true,
        data: {
          serverWallet: serverWalletPubkey.toBase58(),
          solBalance,
          baseWsolBalance,
          ephemeralWsolBalance
        }
      });

      logger.info('Balance check completed', { solBalance, baseWsolBalance, ephemeralWsolBalance });
    } catch (error) {
      logger.error('Error getting balance', { error: error.message, ip: req.ip });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }

  /**
   * Sets up a private transfer for a user (calculates rewards, fetches unsigned transaction from Magicblock, and partially signs it as the server)
   */
  async distributePrivateSetup(req, res) {
    try {
      logger.info('Processing single private reward setup request', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body
      });

      // Validate request body
      const { error, value } = singleRewardSchema.validate(req.body);
      if (error) {
        logger.warn('Validation failed for single private reward setup', {
          error: error.details[0].message,
          body: req.body
        });

        return res.status(400).json({
          error: 'Validation Error',
          message: error.details[0].message
        });
      }

      const { address, score, mode, bonus_sol, bet_amount } = value;

      let calculatedReward = 0;

      // Calculate the Base Reward based on the Game Mode (identical to standard endpoint)
      if (mode === "practice") {
          calculatedReward = score * 0.01;
      } 
      else if (mode === "bot") {
          calculatedReward = score * 0.005;
      } 
      else if (mode === "ranked") {
          calculatedReward = bet_amount * 1.8;
      }

      // Add the Combo Multiplier Bonus
      const finalRewardToDistribute = calculatedReward + bonus_sol;

      if (finalRewardToDistribute <= 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Calculated reward must be greater than 0'
        });
      }

      // Set up the transfer and sign partially
      const result = await this.tokenService.setupPrivateTransfer(address, finalRewardToDistribute);

      res.status(200).json({
        success: true,
        message: 'Private transfer transaction successfully set up and partially signed',
        data: {
          ...result,
          breakdown: {
            baseReward: calculatedReward,
            bonus: bonus_sol
          }
        }
      });

      logger.info('Single private reward setup completed', {
        recipient: address,
        amount: finalRewardToDistribute
      });
    } catch (error) {
      logger.error('Error setting up single private reward transfer', {
        error: error.message,
        body: req.body,
        ip: req.ip
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
}

module.exports = RewardController;