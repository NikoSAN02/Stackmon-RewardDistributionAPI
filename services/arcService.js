/**
 * ArcService — EVM reward distribution for ARC Blockchain (Circle Arc L1).
 *
 * Testnet defaults (Arc docs https://docs.arc.io):
 *   RPC      : https://rpc.testnet.arc.io
 *   Chain ID : 5042002
 *   USDC ERC-20 interface : 0x3600000000000000000000000000000000000000 (6 decimals)
 *   Explorer : https://testnet.arcscan.app
 *   Faucet   : https://faucet.circle.com
 *
 * NOTE: On Arc, USDC is BOTH the native gas token (18-decimal accounting)
 * AND an ERC-20 interface (6 decimals) sharing the same balance.
 * Per Arc docs, apps should use ONLY the ERC-20 interface for balances/transfers.
 *
 * Mainnet switch: set ARC_NETWORK=mainnet + ARC_RPC_URL + ARC_CHAIN_ID +
 * ARC_USDC_ADDRESS explicitly (no mainnet defaults hardcoded yet).
 */
const { ethers } = require('ethers');
const logger = require('../utils/logger');

const TESTNET_DEFAULTS = {
  rpcUrl: 'https://rpc.testnet.arc.io',
  chainId: 5042002,
  usdcAddress: '0x3600000000000000000000000000000000000000',
  explorer: 'https://testnet.arcscan.app',
};

// Minimal ERC-20 ABI for USDC transfers
const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// Arc testnet enforces a minimum 20 Gwei base fee
const MIN_MAX_FEE_PER_GAS = ethers.parseUnits('20', 'gwei');
const DEFAULT_PRIORITY_FEE = ethers.parseUnits('1', 'gwei');

class ArcService {
  constructor() {
    try {
      this.network = (process.env.ARC_NETWORK || 'testnet').toLowerCase();

      if (this.network === 'mainnet') {
        // No hardcoded mainnet values — must be provided explicitly for future cutover
        this.rpcUrl = process.env.ARC_RPC_URL;
        this.chainId = process.env.ARC_CHAIN_ID ? Number(process.env.ARC_CHAIN_ID) : null;
        this.usdcAddress = process.env.ARC_USDC_ADDRESS;
        if (!this.rpcUrl || !this.chainId || !this.usdcAddress) {
          throw new Error(
            'ARC mainnet selected but ARC_RPC_URL / ARC_CHAIN_ID / ARC_USDC_ADDRESS are not all set'
          );
        }
      } else {
        // testnet (default)
        this.rpcUrl = process.env.ARC_RPC_URL || TESTNET_DEFAULTS.rpcUrl;
        this.chainId = process.env.ARC_CHAIN_ID
          ? Number(process.env.ARC_CHAIN_ID)
          : TESTNET_DEFAULTS.chainId;
        this.usdcAddress = process.env.ARC_USDC_ADDRESS || TESTNET_DEFAULTS.usdcAddress;
      }

      this.decimals = process.env.ARC_USDC_DECIMALS
        ? Number(process.env.ARC_USDC_DECIMALS)
        : 6;

      // Resolve EVM private key. Solana key (JSON array / base58) is NOT valid here.
      const rawKey =
        process.env.ARC_WALLET_PRIVATE_KEY ||
        process.env.EVM_PRIVATE_KEY ||
        '';
      const normalized = rawKey.trim().replace(/^["']|["']$/g, '');
      if (!normalized) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            '⚠️ ARC_WALLET_PRIVATE_KEY not set. ArcService will init lazily and fail on use. ' +
              'Fund via https://faucet.circle.com (Arc Testnet).'
          );
          this.initError = new Error('ARC_WALLET_PRIVATE_KEY is not set');
        } else {
          throw new Error('ARC_WALLET_PRIVATE_KEY is required in environment variables');
        }
      } else {
        const withPrefix = normalized.startsWith('0x') ? normalized : `0x${normalized}`;
        if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) {
          throw new Error(
            'Invalid EVM private key format. Expected 32-byte hex string (0x + 64 hex chars). ' +
              'Your Solana SERVER_WALLET_PRIVATE_KEY cannot be reused here.'
          );
        }
        this.privateKey = withPrefix;
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl, this.chainId);
        this.wallet = new ethers.Wallet(this.privateKey, this.provider);
        this.usdc = new ethers.Contract(this.usdcAddress, USDC_ABI, this.wallet);
        console.log(`✅ ArcService initialized: network=${this.network} chainId=${this.chainId}`);
        console.log(`   RPC: ${this.rpcUrl}`);
        console.log(`   USDC (ERC-20): ${this.usdcAddress} (${this.decimals} decimals)`);
        console.log(`   Server wallet: ${this.wallet.address}`);
      }
    } catch (error) {
      console.error('❌ Failed to initialize ArcService:', error.message);
      this.initError = error;
    }
  }

  checkInit() {
    if (this.initError || !this.wallet) {
      throw new Error(
        `ArcService is not initialized: ${(this.initError && this.initError.message) || 'missing wallet'}. ` +
          'Set ARC_WALLET_PRIVATE_KEY (EVM hex) in .env'
      );
    }
  }

  isValidEvmAddress(address) {
    return typeof address === 'string' && ethers.isAddress(address);
  }

  getServerAddress() {
    this.checkInit();
    return this.wallet.address;
  }

  getConfig() {
    return {
      network: this.network,
      rpcUrl: this.rpcUrl,
      chainId: this.chainId,
      usdcAddress: this.usdcAddress,
      usdcDecimals: this.decimals,
      explorer:
        this.network === 'mainnet'
          ? process.env.ARC_EXPLORER_URL || ''
          : 'https://testnet.arcscan.app',
    };
  }

  /** Native USDC balance (gas balance, 18-decimal accounting) as human string. */
  async getNativeBalance() {
    this.checkInit();
    const bal = await this.provider.getBalance(this.wallet.address);
    return ethers.formatUnits(bal, 18);
  }

  /** ERC-20 USDC balance (recommended for app logic, 6 decimals). Returns number. */
  async getUsdcBalance(address) {
    this.checkInit();
    const target = address || this.wallet.address;
    if (!this.isValidEvmAddress(target)) throw new Error('Invalid EVM address');
    const [raw, dec] = await Promise.all([
      this.usdc.balanceOf(target),
      this.usdc.decimals().catch(() => this.decimals),
    ]);
    const d = Number(dec);
    return Number(ethers.formatUnits(raw, d));
  }

  async getFeeOverrides() {
    let maxFee = MIN_MAX_FEE_PER_GAS;
    let priority = DEFAULT_PRIORITY_FEE;
    try {
      const feeData = await this.provider.getFeeData();
      if (feeData.maxFeePerGas && feeData.maxFeePerGas > maxFee) {
        maxFee = feeData.maxFeePerGas;
      }
      if (feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas > 0n) {
        priority = feeData.maxPriorityFeePerGas;
      }
    } catch (e) {
      logger.warn('Could not fetch Arc fee data, using defaults', { error: e.message });
    }
    return { maxFeePerGas: maxFee, maxPriorityFeePerGas: priority };
  }

  /**
   * Transfer USDC (ERC-20 interface) to a recipient.
   * @param {string} recipientAddress - 0x EVM address
   * @param {number} amountUi - human USDC amount, e.g. 2.5
   * @returns {Promise<string>} tx hash
   */
  async transferUsdc(recipientAddress, amountUi) {
    this.checkInit();
    if (!this.isValidEvmAddress(recipientAddress)) {
      throw new Error('Invalid recipient EVM address');
    }
    if (typeof amountUi !== 'number' || !Number.isFinite(amountUi) || amountUi <= 0) {
      throw new Error('Amount must be a positive number');
    }

    const decimals = await this.usdc.decimals().catch(() => this.decimals);
    const rawAmount = ethers.parseUnits(amountUi.toFixed(Number(decimals)), Number(decimals));
    if (rawAmount <= 0n) throw new Error('Transfer amount must be positive');

    const balance = await this.usdc.balanceOf(this.wallet.address);
    if (balance < rawAmount) {
      throw new Error(
        `Insufficient USDC balance. Available: ${ethers.formatUnits(balance, decimals)}, Required: ${amountUi}`
      );
    }

    const { maxFeePerGas, maxPriorityFeePerGas } = await this.getFeeOverrides();
    logger.info('Sending ARC USDC transfer', {
      to: recipientAddress,
      amount: amountUi,
      usdc: this.usdcAddress,
    });

    const tx = await this.usdc.transfer(recipientAddress, rawAmount, {
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
    const receipt = await tx.wait();
    if (receipt && receipt.status === 0) {
      throw new Error(`Transaction reverted on-chain: ${tx.hash}`);
    }
    logger.logTransaction(tx.hash, recipientAddress, amountUi);
    return tx.hash;
  }

  async transferUsdcBatch(recipients) {
    const results = [];
    for (const r of recipients) {
      try {
        const hash = await this.transferUsdc(r.address, r.amount);
        results.push({ address: r.address, amount: r.amount, success: true, transaction: hash });
      } catch (error) {
        results.push({ address: r.address, amount: r.amount, success: false, error: error.message });
      }
    }
    return results;
  }
}

module.exports = ArcService;
