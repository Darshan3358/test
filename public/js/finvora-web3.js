/**
 * FINVORA — Web3 EVM Client
 * 
 * Provides seamless non-custodial wallet connection, network switching to BSC,
 * cryptographic signature verification (personal_sign), live on-chain USDT balance queries,
 * and direct BEP-20 USDT deposit transfers to the FINVORA single active admin wallet.
 */

(function(window) {
  'use strict';

  const BSC_CHAIN_ID_DEC = 56;
  const BSC_CHAIN_ID_HEX = '0x38';
  const OFFICIAL_USDT_BEP20 = '0x55d398326f99059fF775485246999027B3197955';
  const BSC_PARAMS = {
    chainId: BSC_CHAIN_ID_HEX,
    chainName: 'BNB Smart Chain Mainnet',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org/', 'https://bsc-dataseed1.defibit.io/'],
    blockExplorerUrls: ['https://bscscan.com']
  };

  class FinvoraWeb3 {
    constructor() {
      this.provider = null;
      this.account = null;
      this.chainId = null;
      this.usdtContract = OFFICIAL_USDT_BEP20;
      this.isConnecting = false;
      this._listenersBound = false;
    }

    /**
     * Detect injected Ethereum provider (MetaMask, Trust Wallet, etc.)
     */
    hasProvider() {
      return typeof window.ethereum !== 'undefined';
    }

    getProvider() {
      if (window.ethereum) {
        // If multiple providers exist (e.g. MetaMask + Coinbase + Trust), prefer MetaMask or default
        if (window.ethereum.providers?.length) {
          const mm = window.ethereum.providers.find(p => p.isMetaMask);
          return mm || window.ethereum.providers[0];
        }
        return window.ethereum;
      }
      return null;
    }

    /**
     * Initialize event listeners
     */
    _bindListeners() {
      if (this._listenersBound || !this.hasProvider()) return;
      const provider = this.getProvider();

      provider.on('accountsChanged', (accounts) => {
        if (!accounts || accounts.length === 0) {
          this.account = null;
          this.trigger('disconnect');
        } else if (this.account && this.account.toLowerCase() !== accounts[0].toLowerCase()) {
          this.account = accounts[0];
          this.trigger('accountChanged', accounts[0]);
        }
      });

      provider.on('chainChanged', (chainIdHex) => {
        this.chainId = parseInt(chainIdHex, 16);
        this.trigger('chainChanged', this.chainId);
      });

      this._listenersBound = true;
    }

    /**
     * Ensure the user's wallet is switched to BNB Smart Chain (Chain 56)
     */
    async ensureBscNetwork() {
      const provider = this.getProvider();
      if (!provider) throw new Error('No Web3 wallet detected. Please install MetaMask or Trust Wallet.');

      const currentChainHex = await provider.request({ method: 'eth_chainId' });
      this.chainId = parseInt(currentChainHex, 16);

      if (this.chainId === BSC_CHAIN_ID_DEC) {
        return true;
      }

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BSC_CHAIN_ID_HEX }]
        });
        this.chainId = BSC_CHAIN_ID_DEC;
        return true;
      } catch (switchError) {
        // Error code 4902 indicates chain has not been added to wallet
        if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
          try {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [BSC_PARAMS]
            });
            this.chainId = BSC_CHAIN_ID_DEC;
            return true;
          } catch (addError) {
            throw new Error('Failed to add BNB Smart Chain network to your wallet.');
          }
        }
        throw new Error('Please switch your wallet to BNB Smart Chain (BSC Mainnet).');
      }
    }

    /**
     * Connect wallet and cryptographically verify signature via server nonce
     * @param {Object} options
     * @param {string} options.role - 'user' or 'admin'
     */
    async connectAndVerify({ role = 'user' } = {}) {
      if (!this.hasProvider()) {
        throw new Error('No EVM wallet detected. Please open FINVORA in MetaMask, Trust Wallet, or install the MetaMask browser extension.');
      }

      const provider = this.getProvider();
      this._bindListeners();

      // 1. Ensure BSC Network
      await this.ensureBscNetwork();

      // 2. Request Accounts
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts selected in wallet.');
      }
      this.account = accounts[0];

      // 3. Request Nonce from FINVORA Server
      const nonceUrl = role === 'admin' ? '/api/v1/admin/wallet/nonce' : '/api/v1/wallet/nonce';
      const nonceRes = await fetch(nonceUrl, {
        headers: { 'Accept': 'application/json' }
      });
      const nonceJson = await nonceRes.json();
      if (!nonceJson.success || !nonceJson.data?.nonce) {
        throw new Error(nonceJson.error || 'Failed to request authentication nonce from server.');
      }

      const { message } = nonceJson.data;

      // 4. Request personal_sign from User's Wallet
      let signature;
      try {
        signature = await provider.request({
          method: 'personal_sign',
          params: [message, this.account]
        });
      } catch (signErr) {
        if (signErr.code === 4001) {
          throw new Error('Signature request was rejected by the user.');
        }
        throw new Error(`Signature failed: ${signErr.message}`);
      }

      // 5. Submit Signature to Server for Verification
      const verifyUrl = role === 'admin' ? '/api/v1/admin/wallet/verify-connect' : '/api/v1/wallet/verify-connect';
      const verifyRes = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          walletAddress: this.account,
          signature,
          chainId: BSC_CHAIN_ID_DEC
        })
      });

      const verifyJson = await verifyRes.json();
      if (!verifyJson.success) {
        throw new Error(verifyJson.error || 'Cryptographic signature verification failed.');
      }

      this.trigger('connected', {
        account: this.account,
        chainId: BSC_CHAIN_ID_DEC,
        verified: true
      });

      return {
        success: true,
        account: this.account,
        data: verifyJson.data
      };
    }

    /**
     * Disconnect wallet session on server
     */
    async disconnect({ role = 'user' } = {}) {
      const url = role === 'admin' ? '/api/v1/admin/wallet/disconnect' : '/api/v1/wallet/disconnect';
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
        });
      } catch (e) {}

      this.account = null;
      this.trigger('disconnect');
      return { success: true };
    }

    /**
     * Fetch on-chain balances (USDT & BNB) for connected or specified address
     */
    async getBalances(targetAddress = null) {
      const address = targetAddress || this.account;
      if (!address) return { bnb: 0, usdt: 0 };

      const provider = this.getProvider();
      if (!provider) return { bnb: 0, usdt: 0 };

      try {
        // 1. Fetch BNB balance
        const bnbHex = await provider.request({
          method: 'eth_getBalance',
          params: [address, 'latest']
        });
        const bnbWei = BigInt(bnbHex);
        const bnb = Number(bnbWei) / 1e18;

        // 2. Fetch BEP-20 USDT balance using eth_call balanceOf(address)
        // balanceOf function selector: 0x70a08231
        const cleanAddr = address.toLowerCase().replace('0x', '').padStart(64, '0');
        const callData = '0x70a08231' + cleanAddr;

        const usdtHex = await provider.request({
          method: 'eth_call',
          params: [{
            to: this.usdtContract,
            data: callData
          }, 'latest']
        });

        let usdt = 0;
        if (usdtHex && usdtHex !== '0x') {
          const usdtUnits = BigInt(usdtHex);
          // USDT on BSC has 18 decimals
          usdt = Number(usdtUnits) / 1e18;
        }

        return {
          address,
          bnb: Number(bnb.toFixed(6)),
          usdt: Number(usdt.toFixed(4))
        };
      } catch (err) {
        console.warn('[FinvoraWeb3] Balance fetch error:', err.message);
        return { bnb: 0, usdt: 0, error: err.message };
      }
    }

    /**
     * Execute a direct BEP-20 transfer of USDT to the active FINVORA admin wallet
     * 
     * @param {Object} params
     * @param {string} params.adminWallet - Single active admin receiving wallet
     * @param {number} params.amountUsdt - USDT amount to deposit
     * @param {Function} params.onProgress - Status callback ('CONFIRM_WALLET', 'BROADCASTING', 'VERIFYING', 'SUCCESS')
     */
    async executeDepositTransfer({ adminWallet, amountUsdt, onProgress = () => {} }) {
      if (!this.hasProvider()) {
        throw new Error('Please install or unlock your Web3 wallet (MetaMask or Trust Wallet).');
      }

      await this.ensureBscNetwork();

      const provider = this.getProvider();
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) throw new Error('No active wallet account selected.');
      this.account = accounts[0];

      if (!adminWallet || !/^0x[a-fA-F0-9]{40}$/.test(adminWallet)) {
        throw new Error('Invalid FINVORA deposit address.');
      }

      const parsedAmount = parseFloat(amountUsdt);
      if (!parsedAmount || parsedAmount <= 0) {
        throw new Error('Deposit amount must be greater than zero.');
      }

      // Check user on-chain balance
      const balances = await this.getBalances(this.account);
      if (balances.usdt < parsedAmount) {
        throw new Error(
          `Insufficient USDT balance in your connected wallet. Required: ${parsedAmount.toFixed(2)} USDT, Available: ${balances.usdt.toFixed(2)} USDT.`
        );
      }
      if (balances.bnb < 0.0003) {
        throw new Error(
          `Insufficient BNB for BSC gas fees. Available: ${balances.bnb.toFixed(5)} BNB. You need at least ~0.0005 BNB to cover blockchain network gas.`
        );
      }

      // Encode standard BEP-20 transfer(address to, uint256 value)
      // Function selector: 0xa9059cbb
      const cleanTo = adminWallet.toLowerCase().replace('0x', '').padStart(64, '0');
      
      // Calculate amount in wei with 18 decimals
      // Convert to BigInt safely
      const parts = parsedAmount.toFixed(4).split('.');
      const whole = BigInt(parts[0]) * 10n**18n;
      const fraction = parts[1] ? BigInt(parts[1].padEnd(18, '0').slice(0, 18)) : 0n;
      const amountWei = whole + fraction;
      const amountHex = amountWei.toString(16).padStart(64, '0');

      const data = '0xa9059cbb' + cleanTo + amountHex;

      onProgress('CONFIRM_WALLET', { message: 'Please confirm the USDT transfer in your Web3 wallet...' });

      // Trigger transaction in user's wallet
      let txHash;
      try {
        txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: this.account,
            to: this.usdtContract,
            data: data
          }]
        });
      } catch (txErr) {
        if (txErr.code === 4001) {
          throw new Error('Transaction was cancelled in your wallet.');
        }
        throw new Error(`Wallet transaction rejected: ${txErr.message}`);
      }

      onProgress('BROADCASTING', {
        message: 'Transaction broadcasted to BNB Smart Chain. Submitting to FINVORA...',
        txHash
      });

      // 1. Submit transaction hash to backend
      const submitRes = await fetch('/api/v1/deposit/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          txHash,
          amount: parsedAmount
        })
      });
      const submitJson = await submitRes.json();
      if (!submitJson.success) {
        throw new Error(submitJson.error || 'Failed to register deposit transaction with server.');
      }

      onProgress('VERIFYING', {
        message: 'Awaiting BNB Smart Chain block confirmation and ledger credit...',
        txHash
      });

      // 2. Poll / verify with backend until confirmed
      let verified = false;
      let attempts = 0;
      const maxAttempts = 15;

      while (!verified && attempts < maxAttempts) {
        attempts++;
        await new Promise(r => setTimeout(r, 3000));

        try {
          const verifyRes = await fetch('/api/v1/deposit/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              txHash,
              depositId: submitJson.data?.depositId
            })
          });
          const verifyJson = await verifyRes.json();
          if (verifyJson.success) {
            verified = true;
            onProgress('SUCCESS', {
              message: verifyJson.message || `Successfully credited $${parsedAmount.toFixed(2)} USDT to your FINVORA balance!`,
              txHash,
              creditedAmount: verifyJson.data?.creditedAmount || parsedAmount
            });
            return {
              success: true,
              txHash,
              creditedAmount: verifyJson.data?.creditedAmount || parsedAmount
            };
          }
        } catch (pollErr) {
          // Keep polling until max attempts
        }
      }

      // If poll timed out, it was submitted successfully and will confirm via background monitor
      return {
        success: true,
        txHash,
        pendingConfirmation: true,
        message: 'Deposit submitted! Your transaction is confirming on BSC and will be credited automatically.'
      };
    }

    // Event handling
    _events = {};
    on(event, callback) {
      if (!this._events[event]) this._events[event] = [];
      this._events[event].push(callback);
    }
    trigger(event, data) {
      if (this._events[event]) {
        this._events[event].forEach(cb => {
          try { cb(data); } catch(e) { console.error(e); }
        });
      }
    }
  }

  // Expose global instance
  window.finvoraWeb3 = new FinvoraWeb3();
})(window);
