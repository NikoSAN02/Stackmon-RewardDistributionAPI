const {
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
  PublicKey,
} = require('@solana/web3.js');
const SolanaService = require('../utils/solana');
const logger = require('../utils/logger');

class TokenService {
  constructor() {
    this.solanaService = new SolanaService();
    this.tokenMintAddress = process.env.TOKEN_MINT_ADDRESS || null;
    if (this.tokenMintAddress) {
      console.log(`ℹ️ Reward Service initialized for Token distribution: ${this.tokenMintAddress}`);
    } else {
      console.log(`ℹ️ Reward Service initialized for SOL distribution.`);
    }
  }

  /**
   * Transfer SOL or Token to a recipient
   * @param {string} recipientAddress - Recipient's Solana wallet address
   * @param {number} amount - Amount of SOL or tokens to transfer
   * @returns {Promise<string>} Transaction signature
   */
  async transferSol(recipientAddress, amount) {
    logger.info('Delegating transfer request to Magicblock', { recipient: recipientAddress, amount });
    return this.transferSolMagicblock(recipientAddress, amount);
  }

  /**
   * Transfer SOL or Token to multiple recipients in batch
   * @param {Array<{address: string, amount: number}>} recipients - Array of recipient addresses and amounts
   * @returns {Promise<Array<{address: string, amount: number, success: boolean, transaction?: string, error?: string}>>} Results for each transfer
   */
  async transferSolBatch(recipients) {
    const results = [];

    for (const recipient of recipients) {
      try {
        const transaction = await this.transferSol(recipient.address, recipient.amount);
        results.push({
          address: recipient.address,
          amount: recipient.amount,
          success: true,
          transaction: transaction
        });
      } catch (error) {
        results.push({
          address: recipient.address,
          amount: recipient.amount,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Transfer SOL or Token to a recipient using Magicblock
   * @param {string} recipientAddress - Recipient's Solana wallet address
   * @param {number} amount - Amount to transfer
   * @returns {Promise<string>} Transaction signature
   */
  async transferSolMagicblock(recipientAddress, amount) {
    try {
      const isToken = !!this.tokenMintAddress;
      logger.info(isToken ? 'Starting Token transfer via Magicblock' : 'Starting SOL transfer via Magicblock', { recipient: recipientAddress, amount });

      // Validate inputs
      if (!recipientAddress || !this.solanaService.isValidSolanaAddress(recipientAddress)) {
        const error = new Error('Invalid recipient address');
        logger.error('Invalid recipient address', { recipient: recipientAddress });
        throw error;
      }

      if (typeof amount !== 'number' || amount <= 0) {
        const error = new Error('Amount must be a positive number');
        logger.error('Invalid amount provided', { amount, recipient: recipientAddress });
        throw error;
      }

      // Check server wallet SOL balance for fees
      let serverSolBalance = 0;
      try {
        serverSolBalance = await this.solanaService.getSolBalance();
      } catch (balanceError) {
        logger.warn('Could not retrieve server balance, proceeding with transfer attempt', {
          error: balanceError.message
        });
      }

      // Ensure we have enough SOL for transaction fees
      if (serverSolBalance < 0.01) {
        logger.warn(`Server SOL balance is low (${serverSolBalance} SOL). Transaction might fail due to gas fees.`);
      }

      logger.info(isToken ? 'Preparing Magicblock Token transfer' : 'Preparing Magicblock SOL transfer', {
        amount: amount,
        recipient: recipientAddress,
        mint: this.tokenMintAddress
      });

      // Perform Transfer via Magicblock
      const signature = await this.solanaService.transferMagicblock(recipientAddress, amount, this.tokenMintAddress);

      logger.logTransaction(signature, recipientAddress, amount);

      return signature;
    } catch (error) {
      logger.logTransactionError(recipientAddress, amount, error);
      throw error;
    }
  }
}

module.exports = TokenService;