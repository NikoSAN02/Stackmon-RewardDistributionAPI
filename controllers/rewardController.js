/* ============================================================================
 * ACTIVE CHAIN: ARC Blockchain testnet (EVM, USDC rewards via arcService.js)
 * ----------------------------------------------------------------------------
 * Solana / MagicBlock private-payment methods are DISABLED but PRESERVED
 * as a comment block at the bottom of this file for future re-enablement.
 * See also: services/tokenService.js + utils/solana.js (kept, not imported).
 * Future mainnet cutover: set ARC_NETWORK=mainnet + ARC_RPC_URL/CHAIN_ID/USDC.
 * ============================================================================
 */
const ArcService = require('../services/arcService');
// FUTURE (Solana): const TokenService = require('../services/tokenService');
const Joi = require('joi');
const logger = require('../utils/logger');

// EVM address validation (ARC is EVM-compatible). Solana base58 no longer accepted.
const evmAddress = Joi.string().required().pattern(/^0x[a-fA-F0-9]{40}$/).messages({
  'string.pattern.base': 'Invalid EVM address format (expected 0x + 40 hex chars)'
});

// Validation schema for single reward request (ARC)
const singleRewardSchema = Joi.object({
  address: evmAddress,
  score: Joi.number().required(),
  mode: Joi.string().valid('practice', 'bot', 'ranked').required(),
  bonus_sol: Joi.number().min(0).required(),
  bet_amount: Joi.number().min(0).required()
});

// Validation schema for batch reward request (ARC)
const batchRewardSchema = Joi.array().items(
  Joi.object({
    address: evmAddress,
    amount: Joi.number().positive().required()
  })
).min(1).max(100); // Max 100 transfers per batch request

/** Shared reward math (unchanged from Solana version — chain-agnostic). */
function calculateReward({ score, mode, bonus_sol, bet_amount }) {
  let base = 0;
  if (mode === 'practice') {
    base = score * 0.01; // 100 pts = 1 USDC
  } else if (mode === 'bot') {
    base = score * 0.005; // 100 pts = 0.5 USDC
  } else if (mode === 'ranked') {
    base = bet_amount * 1.8; // winner takes 1.8x bet
  }
  return { base, total: base + bonus_sol };
}

class RewardController {
  constructor() {
    this.arcService = new ArcService();
    // FUTURE (Solana): this.tokenService = new TokenService();
  }

  /**
   * Distribute rewards to a single user (ARC testnet USDC).
   * Route: POST /distribute-normal
   */
  async distributeReward(req, res) {
    try {
      logger.info('Processing single ARC reward distribution', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body
      });

      const { error, value } = singleRewardSchema.validate(req.body);
      if (error) {
        logger.warn('Validation failed for single ARC reward distribution', {
          error: error.details[0].message,
          body: req.body
        });
        return res.status(400).json({ error: 'Validation Error', message: error.details[0].message });
      }

      const { address, score, mode, bonus_sol, bet_amount } = value;
      const { base, total } = calculateReward({ score, mode, bonus_sol, bet_amount });

      if (total <= 0) {
        return res.status(400).json({ error: 'Bad Request', message: 'Calculated reward must be greater than 0' });
      }

      const txHash = await this.arcService.transferUsdc(address, total);

      res.status(200).json({
        success: true,
        message: 'Reward distributed successfully (ARC testnet USDC)',
        data: {
          recipient: address,
          amount: total,
          transaction: txHash,
          chain: 'arc-testnet',
          chainId: this.arcService.getConfig().chainId,
          breakdown: { baseReward: base, bonus: bonus_sol }
        }
      });

      logger.info('Single ARC reward distribution completed', {
        transaction: txHash, recipient: address, amount: total
      });
    } catch (error) {
      logger.error('Error distributing single ARC reward', {
        error: error.message, body: req.body, ip: req.ip
      });
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
  }

  /**
   * Distribute rewards to a single user (ARC testnet USDC).
   * Route: POST /distribute
   * NOTE: Previously MagicBlock private transfer; now ARC USDC alias for
   * Unity client compatibility. MagicBlock impl preserved at file bottom.
   */
  async distributeMagicblockReward(req, res) {
    try {
      logger.info('Processing single ARC reward distribution (/distribute)', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body
      });

      const { error, value } = singleRewardSchema.validate(req.body);
      if (error) {
        logger.warn('Validation failed for ARC /distribute', {
          error: error.details[0].message,
          body: req.body
        });
        return res.status(400).json({ error: 'Validation Error', message: error.details[0].message });
      }

      const { address, score, mode, bonus_sol, bet_amount } = value;
      const { base, total } = calculateReward({ score, mode, bonus_sol, bet_amount });

      if (total <= 0) {
        return res.status(400).json({ error: 'Bad Request', message: 'Calculated reward must be greater than 0' });
      }

      const txHash = await this.arcService.transferUsdc(address, total);

      res.status(200).json({
        success: true,
        message: 'ARC USDC reward distributed successfully',
        data: {
          recipient: address,
          amount: total,
          transaction: txHash,
          chain: 'arc-testnet',
          chainId: this.arcService.getConfig().chainId,
          breakdown: { baseReward: base, bonus: bonus_sol }
        }
      });

      logger.info('Single ARC /distribute completed', {
        transaction: txHash, recipient: address, amount: total
      });
    } catch (error) {
      logger.error('Error distributing ARC reward (/distribute)', {
        error: error.message, body: req.body, ip: req.ip
      });
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
  }

  /**
   * Distribute rewards to multiple users in batch (ARC testnet USDC).
   * Route: POST /distribute-batch
   */
  async distributeBatchRewards(req, res) {
    try {
      logger.info('Processing batch ARC reward distribution', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        recipientCount: Array.isArray(req.body) ? req.body.length : 0
      });

      const { error, value } = batchRewardSchema.validate(req.body);
      if (error) {
        logger.warn('Validation failed for batch ARC reward distribution', {
          error: error.details[0].message,
          body: req.body
        });
        return res.status(400).json({ error: 'Validation Error', message: error.details[0].message });
      }

      const results = await this.arcService.transferUsdcBatch(value);
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      res.status(200).json({
        success: true,
        message: `Batch reward distribution completed. ${successful} successful, ${failed} failed`,
        data: { totalRequested: value.length, successful, failed, results }
      });

      logger.info('Batch ARC reward distribution completed', {
        totalRequested: value.length, successful, failed
      });
    } catch (error) {
      logger.error('Error distributing batch ARC rewards', {
        error: error.message, body: req.body, ip: req.ip
      });
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
  }

  /**
   * Get server wallet balances (ARC).
   * Route: GET /balance
   */
  async getBalance(req, res) {
    try {
      logger.info('ARC balance check requested', { ip: req.ip });
      const [usdc, native] = await Promise.all([
        this.arcService.getUsdcBalance(),
        this.arcService.getNativeBalance().catch(() => null),
      ]);
      res.status(200).json({
        success: true,
        data: {
          usdc,
          native,
          serverWallet: this.arcService.getServerAddress(),
          chain: 'arc-testnet',
          chainId: this.arcService.getConfig().chainId,
          usdcContract: this.arcService.getConfig().usdcAddress,
        }
      });
      logger.info('ARC balance check completed', { usdc });
    } catch (error) {
      logger.error('Error getting ARC balance', { error: error.message, ip: req.ip });
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
  }

  /**
   * Private-transfer setup (MagicBlock) — DISABLED for ARC migration.
   * Route: POST /distribute-private-setup → 410 Gone (impl preserved below).
   */
  async distributePrivateSetup(req, res) {
    logger.warn('distribute-private-setup called while disabled (ARC mode)', { ip: req.ip });
    return res.status(410).json({
      error: 'Gone',
      message: 'Private MagicBlock transfers are temporarily disabled during ARC testnet migration. They will return in a future release.'
    });
  }
}

module.exports = RewardController;

/* ============================================================================
 * FUTURE REUSE — SOLANA / MAGICBLOCK IMPLEMENTATIONS (DISABLED, DO NOT DELETE)
 * ----------------------------------------------------------------------------
 * Original Solana/MagicBlock controller methods preserved verbatim below.
 * To re-enable: restore TokenService usage above + routes in server.js.
 *
 * --- distributeReward (Solana) ---
 * const transactionSignature = await this.tokenService.transferSol(address, finalRewardToDistribute);
 *
 * --- distributeMagicblockReward (Solana/MagicBlock PER) ---
 * const transactionSignature = await this.tokenService.transferSolMagicblock(address, finalRewardToDistribute);
 * // tokenService.transferSolMagicblock() checks PER balance, deposits shortfall
 * // (MIN_DEPOSIT 5 USDC), sends ephemeral→base private transfer, falls back to
 * // standard SPL transfer if recipient is not delegated.
 *
 * --- distributePrivateSetup (MagicBlock multi-sig) ---
 * const result = await this.tokenService.setupPrivateTransfer(address, finalRewardToDistribute);
 * // Returns { transaction (partially-signed base64), version, sendRpcEndpoint,
 * //   requiredSigners, amount, recipient } for client co-signing.
 *
 * --- getBalance (Solana) ---
 * const balance = await this.tokenService.solanaService.getSolBalance();
 * // serverWallet: this.tokenService.solanaService.getServerWallet().publicKey.toBase58()
 *
 * Validation previously used Solana base58:
 *   Joi.string().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
 * ARC now uses EVM: /^0x[a-fA-F0-9]{40}$/
 * ============================================================================
 */
