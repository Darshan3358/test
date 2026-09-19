/**
 * FINVORA — Centralized Blockchain Configuration
 * Strictly enforces USDT on BNB Smart Chain (BEP-20).
 * No other network, token standard, or currency is permitted.
 */

const { getAddress, isAddress, parseUnits, formatUnits } = require('ethers');
require('dotenv').config();

// Official USDT on BNB Smart Chain (Mainnet)
// https://bscscan.com/token/0x55d398326f99059ff775485246999027b3197955
const OFFICIAL_USDT_BEP20_MAINNET = '0x55d398326f99059fF775485246999027B3197955';

// Normalized contract address from environment with hard fallback to official mainnet
const RAW_CONTRACT = (process.env.USDT_BEP20_CONTRACT || OFFICIAL_USDT_BEP20_MAINNET).trim();
const USDT_BEP20_CONTRACT = isAddress(RAW_CONTRACT) 
  ? getAddress(RAW_CONTRACT) 
  : OFFICIAL_USDT_BEP20_MAINNET;

const CHAIN_ID = parseInt(process.env.BSC_CHAIN_ID || '56', 10);
const IS_TESTNET = CHAIN_ID === 97;

const RPC_URLS = [
  process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
  ...(process.env.BSC_FALLBACK_RPCS ? process.env.BSC_FALLBACK_RPCS.split(',').map(s => s.trim()) : [
    'https://bsc-dataseed1.defibit.io/',
    'https://bsc-dataseed1.ninicoin.io/',
    'https://binance.llamarpc.com',
    'https://rpc.ankr.com/bsc'
  ])
].filter(Boolean);

const EXPLORER_BASE = process.env.BSC_EXPLORER_URL || (IS_TESTNET ? 'https://testnet.bscscan.com' : 'https://bscscan.com');

const BEP20_ABI = [
  // Read
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  // Write
  'function transfer(address to, uint256 amount) returns (bool)',
  // Events
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];

const BLOCKCHAIN_CONFIG = Object.freeze({
  NETWORK_NAME: IS_TESTNET ? 'BNB Smart Chain Testnet' : 'BNB Smart Chain Mainnet',
  NETWORK_CODE: 'BSC',
  CHAIN_ID,
  CHAIN_ID_HEX: '0x' + CHAIN_ID.toString(16),
  TOKEN_SYMBOL: 'USDT',
  TOKEN_NAME: 'Tether USD',
  TOKEN_STANDARD: 'BEP-20',
  DECIMALS: 18, // USDT on BSC has 18 decimals
  CONTRACT_ADDRESS: USDT_BEP20_CONTRACT,
  RPC_URLS,
  PRIMARY_RPC: RPC_URLS[0],
  EXPLORER_BASE,
  MIN_CONFIRMATIONS: parseInt(process.env.MIN_CONFIRMATIONS || '1', 10),
  WITHDRAWAL_FEE_PERCENT: 10.0,
  BEP20_ABI,
  // Helper to format explorer link
  getTxExplorerUrl: (txHash) => `${EXPLORER_BASE}/tx/${txHash}`,
  getAddressExplorerUrl: (address) => `${EXPLORER_BASE}/address/${address}`,
  getBlockExplorerUrl: (blockNumber) => `${EXPLORER_BASE}/block/${blockNumber}`,
  // Strict address validation
  isValidAddress: (address) => {
    if (!address || typeof address !== 'string') return false;
    return isAddress(address.trim());
  },
  normalizeAddress: (address) => {
    if (!address || typeof address !== 'string') return null;
    try {
      return getAddress(address.trim());
    } catch {
      return null;
    }
  },
  // High precision decimal formatting
  toWei: (amount) => {
    const str = typeof amount === 'number' ? amount.toFixed(6) : amount.toString();
    return parseUnits(str, 18);
  },
  fromWei: (bigintVal) => {
    return formatUnits(bigintVal, 18);
  }
});

module.exports = BLOCKCHAIN_CONFIG;
