const TokenService = require('../services/tokenService');
const Joi = require('joi');
const logger = require('../utils/logger');

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
      const transactionSignature = await this.tokenService.transferTokens(address, finalRewardToDistribute);

      res.status(200).json({
        success: true,
        message: 'Reward distributed successfully',
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

      // Perform the SOL transfer via Magicblock
      const transactionSignature = await this.tokenService.transferTokensMagicblock(address, finalRewardToDistribute);

      res.status(200).json({
        success: true,
        message: 'Magicblock reward distributed successfully',
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
      const results = await this.tokenService.transferTokensBatch(recipients);

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

      const balance = await this.tokenService.solanaService.getSolBalance();

      res.status(200).json({
        success: true,
        data: {
          balance: balance,
          tokenMint: process.env.TOKEN_MINT_ADDRESS,
          serverWallet: this.tokenService.solanaService.getServerWallet().publicKey.toBase58()
        }
      });

      logger.info('Balance check completed', { balance });
    } catch (error) {
      logger.error('Error getting balance', { error: error.message, ip: req.ip });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  }
}

module.exports = RewardController;