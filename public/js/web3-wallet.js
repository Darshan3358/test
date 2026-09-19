/**
 * FINVORA Web3 Wallet Integration Engine
 * Built for BNB Smart Chain (BSC Mainnet & Testnet)
 * Seamlessly integrates MetaMask, Trust Wallet, Binance Web3 Wallet, and all EIP-1193 EVM providers.
 */

(function () {
  'use strict';

  // 1. Web3 Configuration & Constants (BNB Smart Chain)
  const BSC_CHAINS = {
    MAINNET: {
      chainId: 56,
      chainIdHex: "0x38",
      chainName: "BNB Smart Chain Mainnet",
      nativeCurrency: {
        name: "BNB",
        symbol: "BNB",
        decimals: 18
      },
      rpcUrls: [
        "https://bsc-dataseed.binance.org/",
        "https://bsc-dataseed1.defibit.io/",
        "https://bsc-dataseed1.ninicoin.io/"
      ],
      blockExplorerUrls: ["https://bscscan.com"]
    },
    TESTNET: {
      chainId: 97,
      chainIdHex: "0x61",
      chainName: "BNB Smart Chain Testnet",
      nativeCurrency: {
        name: "tBNB",
        symbol: "tBNB",
        decimals: 18
      },
      rpcUrls: [
        "https://data-seed-prebsc-1-s1.binance.org:8545/",
        "https://data-seed-prebsc-2-s1.binance.org:8545/"
      ],
      blockExplorerUrls: ["https://testnet.bscscan.com"]
    }
  };

  const DEFAULT_CHAIN_ID = 56;

  const CONTRACT_ADDRESSES = {
    USDT_TOKEN: (window.FINVORA_CONFIG && window.FINVORA_CONFIG.usdtContractAddress) || "0x55d398326f99059fF775485246999027B3197955",
    TREASURY: (window.FINVORA_CONFIG && (window.FINVORA_CONFIG.treasuryAddress || window.FINVORA_CONFIG.activeDepositWallet)) || ""
  };

  const ERC20_MINIMAL_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)"
  ];

  // USDT BEP-20 Formatter: 3 decimal places (0.000)
  function formatUSDT(value) {
    if (!value) return "0.000";
    let num = 0;
    if (typeof value === "string" && value.startsWith("0x")) {
      try {
        const wei = BigInt(value);
        num = Number(wei) / 1e18;
      } catch (e) {
        num = 0;
      }
    } else {
      num = parseFloat(value) || 0;
    }
    return (Number.isFinite(num) ? num : 0).toFixed(3);
  }

  // 2. Web3 Core Service Class
  class Web3Service {
    constructor() {
      this.provider = null;
      this.signer = null;
      this.readOnlyProvider = null;
      this.account = null;
      this.chainId = DEFAULT_CHAIN_ID;
      this.connecting = false;
      this.realtimeTimer = null;
      this.balances = {
        usdt: "0.000"
      };
      this.listeners = [];

      this.initReadOnlyProvider();
      this.initWindowFocusListener();
    }

    // Window focus and visibility listener for instant balance refresh
    initWindowFocusListener() {
      if (typeof window === "undefined") return;
      window.addEventListener("focus", () => {
        if (this.account) {
          this.refreshBalances(this.account);
        }
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.account) {
          this.refreshBalances(this.account);
        }
      });
    }

    // Realtime polling engine (every 5 seconds while active)
    startRealtimePolling() {
      this.stopRealtimePolling();
      this.realtimeTimer = setInterval(() => {
        if (this.account && !this.connecting) {
          this.refreshBalances(this.account);
        }
      }, 5000);
    }

    stopRealtimePolling() {
      if (this.realtimeTimer) {
        clearInterval(this.realtimeTimer);
        this.realtimeTimer = null;
      }
    }

    // Public fallback RPC for reading on-chain balances
    initReadOnlyProvider() {
      try {
        if (typeof window !== "undefined" && window.ethers) {
          this.readOnlyProvider = new window.ethers.JsonRpcProvider(
            BSC_CHAINS.MAINNET.rpcUrls[0],
            { chainId: DEFAULT_CHAIN_ID, name: "bnb" }
          );
        }
      } catch (e) {
        console.warn("[Web3Service] Could not initialize fallback RPC provider:", e);
      }
    }

    // Provider detection supporting MetaMask, Trust Wallet, Binance Wallet, etc.
    getEthereum() {
      if (typeof window === "undefined" || !window.ethereum) return null;
      if (window.ethereum.providers && Array.isArray(window.ethereum.providers)) {
        const mm = window.ethereum.providers.find(
          (p) => p.isMetaMask && !p.isPhantom && !p.isBraveWallet && !p.isCoinbaseWallet
        );
        if (mm) return mm;
        return window.ethereum.providers[0];
      }
      return window.ethereum;
    }

    isWalletAvailable() {
      return Boolean(this.getEthereum());
    }

    getDetectedWalletName() {
      const eth = this.getEthereum();
      if (!eth) return null;
      if (eth.isTrust || window.trustwallet) return "Trust Wallet";
      if (eth.isBinance || window.BinanceChain) return "Binance Web3 Wallet";
      if (eth.isCoinbaseWallet) return "Coinbase Wallet";
      if (eth.isBraveWallet) return "Brave Wallet";
      if (eth.isMetaMask) return "MetaMask";
      return "Web3 Wallet";
    }

    async getAccounts() {
      const eth = this.getEthereum();
      if (!eth) return [];
      try {
        return await eth.request({ method: "eth_accounts" });
      } catch (e) {
        console.warn("[Web3Service] eth_accounts error:", e);
        return [];
      }
    }

    async getChainId() {
      const eth = this.getEthereum();
      if (!eth) return DEFAULT_CHAIN_ID;
      try {
        const chainIdHex = await eth.request({ method: "eth_chainId" });
        return parseInt(chainIdHex, 16);
      } catch (e) {
        return DEFAULT_CHAIN_ID;
      }
    }

    // Network switch / add BSC chain
    async switchToBSC(targetChainId = DEFAULT_CHAIN_ID) {
      const eth = this.getEthereum();
      if (!eth) throw new Error("No Web3 wallet found in browser/device.");

      const chainConfig = targetChainId === 97 ? BSC_CHAINS.TESTNET : BSC_CHAINS.MAINNET;

      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainConfig.chainIdHex }]
        });
      } catch (switchError) {
        if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: chainConfig.chainIdHex,
              chainName: chainConfig.chainName,
              nativeCurrency: chainConfig.nativeCurrency,
              rpcUrls: chainConfig.rpcUrls,
              blockExplorerUrls: chainConfig.blockExplorerUrls
            }]
          });
        } else {
          throw switchError;
        }
      }

      if (window.ethers) {
        this.provider = new window.ethers.BrowserProvider(eth, "any");
        this.signer = await this.provider.getSigner();
      }
      this.chainId = targetChainId;
      this.notify();
      return true;
    }

    // Contract instances
    getUSDTContract(runner = null) {
      if (!window.ethers) return null;
      const activeRunner = runner || this.signer || this.provider || this.readOnlyProvider;
      return new window.ethers.Contract(CONTRACT_ADDRESSES.USDT_TOKEN, ERC20_MINIMAL_ABI, activeRunner);
    }

    getTokenContract(tokenAddress, runner = null) {
      if (!window.ethers) return null;
      const activeRunner = runner || this.signer || this.provider || this.readOnlyProvider;
      return new window.ethers.Contract(tokenAddress, ERC20_MINIMAL_ABI, activeRunner);
    }

    // Live Realtime USDT BEP-20 Balance (Injected Provider + Concurrent BSC RPCs + Ethers)
    async getUsdtBalance(address) {
      if (!address) return "0.000";
      const usdtAddress = (window.FINVORA_CONFIG && window.FINVORA_CONFIG.usdtContractAddress) || CONTRACT_ADDRESSES.USDT_TOKEN;
      const cleanAddr = address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
      const data = "0x70a08231" + cleanAddr; // balanceOf(address)
      const eth = this.getEthereum();
      const fetchers = [];

      // 1. Direct injected JSON-RPC eth_call
      if (eth && typeof eth.request === "function") {
        fetchers.push(
          (async () => {
            const hex = await eth.request({
              method: "eth_call",
              params: [{ to: usdtAddress, data: data }, "latest"]
            });
            if (hex && hex !== "0x" && hex !== "0x0") return formatUSDT(hex);
            if (hex === "0x0" || hex === "0x") return "0.000";
            throw new Error("Invalid hex from provider");
          })()
        );
      }

      // 2. Direct concurrent queries to BSC Mainnet RPCs
      const bscRpcs = [
        "https://bsc-dataseed.binance.org/",
        "https://bsc-dataseed1.defibit.io/",
        "https://bsc-dataseed1.ninicoin.io/"
      ];
      for (const rpc of bscRpcs) {
        fetchers.push(
          (async () => {
            const res = await fetch(rpc, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "eth_call",
                params: [{ to: usdtAddress, data: data }, "latest"]
              })
            });
            const d = await res.json();
            if (d && d.result && d.result !== "0x") {
              return formatUSDT(d.result);
            }
            if (d && (d.result === "0x0" || d.result === "0x")) {
              return "0.000";
            }
            throw new Error("RPC returned no result");
          })()
        );
      }

      // 3. Fallback Ethers runner
      if (window.ethers && (this.provider || this.readOnlyProvider)) {
        fetchers.push(
          (async () => {
            const runner = this.provider || this.readOnlyProvider;
            const contract = new window.ethers.Contract(usdtAddress, ERC20_MINIMAL_ABI, runner);
            const bal = await contract.balanceOf(address);
            const formatted = window.ethers.formatUnits(bal, 18);
            return (parseFloat(formatted) || 0).toFixed(3);
          })()
        );
      }

      try {
        const results = await Promise.allSettled(fetchers);
        for (const r of results) {
          if (r.status === "fulfilled" && r.value && r.value !== "0.000") {
            return r.value;
          }
        }
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) {
            return r.value;
          }
        }
      } catch (e) {
        console.warn("[Web3Service] USDT balance fetchers error:", e);
      }

      return "0.000";
    }

    // Real-time USDT/BEP20 Balance Refresh
    async refreshBalances(targetAccount = this.account) {
      if (!targetAccount) {
        this.balances = { usdt: "0.000" };
        this.notify();
        return;
      }
      try {
        const usdt = await this.getUsdtBalance(targetAccount);
        this.balances = { usdt };
        this.notify();
      } catch (e) {
        console.warn("[Web3Service] Error refreshing USDT balance:", e);
      }
    }

    // Main Connect Wallet handler
    async connect() {
      const eth = this.getEthereum();
      if (!eth) {
        showNoWalletModal();
        return null;
      }

      this.connecting = true;
      this.notify();

      try {
        // 1. Request account access
        const accounts = await eth.request({ method: "eth_requestAccounts" });
        if (!accounts || accounts.length === 0) {
          throw new Error("No accounts approved in wallet.");
        }

        const selectedAccount = accounts[0];
        this.account = selectedAccount;

        // 2. Validate chain & auto switch if needed
        const cid = await this.getChainId();
        this.chainId = cid;
        if (cid !== 56 && cid !== 97) {
          try {
            await this.switchToBSC(56);
          } catch (netErr) {
            console.warn("[Web3Service] User declined switching to BSC:", netErr);
          }
        }

        // 3. Initialize ethers provider & signer
        if (window.ethers) {
          this.provider = new window.ethers.BrowserProvider(eth, "any");
          this.signer = await this.provider.getSigner(selectedAccount);
        }

        // 4. Remember in localStorage for silent restore
        localStorage.setItem("finvora_web3_connected", "true");

        // 5. Fetch balances & start realtime polling
        await this.refreshBalances(selectedAccount);
        this.startRealtimePolling();

        // 6. Auto-sync wallet address to FINVORA user profile in background
        this.syncAddressWithProfile(selectedAccount);

        showToast("success", `Wallet Connected: ${truncateAddress(selectedAccount)}`);
        return selectedAccount;
      } catch (err) {
        console.error("[Web3Service] Connection Error:", err);
        showToast("error", err.message || "Failed to connect wallet.");
        throw err;
      } finally {
        this.connecting = false;
        this.notify();
      }
    }

    // Disconnect handler
    disconnect() {
      this.stopRealtimePolling();
      this.account = null;
      this.provider = null;
      this.signer = null;
      this.balances = { bnb: "0.0000", bnbUsd: "$0.00" };
      localStorage.removeItem("finvora_web3_connected");
      this.notify();
      showToast("info", "Wallet disconnected.");
    }

    // Sync address with backend profile
    async syncAddressWithProfile(address) {
      if (!address) return;
      try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
          || document.querySelector('input[name="_csrf"]')?.value;

        const res = await fetch('/api/v1/wallet/sync-address', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'CSRF-Token': csrfToken } : {})
          },
          body: JSON.stringify({ walletAddress: address })
        });
        const data = await res.json();
        if (data.success) {
          console.log("[Web3Service] Wallet address synced with FINVORA profile.");
        }
      } catch (e) {
        console.warn("[Web3Service] Profile sync error:", e);
      }
    }

    // State change subscriptions
    subscribe(callback) {
      this.listeners.push(callback);
      callback(this.getState());
      return () => {
        this.listeners = this.listeners.filter(cb => cb !== callback);
      };
    }

    notify() {
      const state = this.getState();
      this.listeners.forEach(cb => {
        try { cb(state); } catch (e) { console.error(e); }
      });
    }

    getState() {
      return {
        account: this.account,
        chainId: this.chainId,
        connecting: this.connecting,
        isConnected: Boolean(this.account),
        isCorrectChain: this.chainId === 56 || this.chainId === 97,
        balances: this.balances,
        walletName: this.getDetectedWalletName() || "EVM Wallet"
      };
    }

    // Setup hardware/extension event listeners
    initListeners() {
      const eth = this.getEthereum();
      if (!eth || !eth.on) return;

      eth.on("accountsChanged", (accounts) => {
        if (!accounts || accounts.length === 0) {
          this.stopRealtimePolling();
          this.disconnect();
        } else {
          this.account = accounts[0];
          this.refreshBalances(accounts[0]);
          this.startRealtimePolling();
          this.notify();
        }
      });

      eth.on("chainChanged", (chainIdHex) => {
        const newCid = parseInt(chainIdHex, 16);
        this.chainId = newCid;
        if (this.account) {
          this.refreshBalances(this.account);
        }
        this.notify();
      });
    }

    // Auto-reconnect if user had previously connected
    async autoConnectIfAuthorized() {
      if (localStorage.getItem("finvora_web3_connected") !== "true") return;
      const eth = this.getEthereum();
      if (!eth) return;

      try {
        const accounts = await this.getAccounts();
        if (accounts && accounts.length > 0) {
          this.account = accounts[0];
          this.chainId = await this.getChainId();

          if (window.ethers) {
            this.provider = new window.ethers.BrowserProvider(eth, "any");
            this.signer = await this.provider.getSigner(accounts[0]);
          }

          await this.refreshBalances(accounts[0]);
          this.startRealtimePolling();
          this.notify();
        }
      } catch (e) {
        console.warn("[Web3Service] Auto-connect error:", e);
      }
    }
  }

  // Helper: Format wallet address (starting 4digit xxx last 4 digit in small caps: e.g. 0x1234xxx5678)
  function truncateAddress(addr) {
    if (!addr) return "";
    const lower = addr.toLowerCase().trim();
    return `${lower.slice(0, 6)}xxx${lower.slice(-4)}`;
  }

  // Toast notification UI
  function showToast(type, message) {
    let container = document.getElementById("finvora-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "finvora-toast-container";
      container.className = "finvora-toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `finvora-toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="18" height="18" fill="none" stroke="#57C19D" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="18" height="18" fill="none" stroke="#EF4444" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>';
    } else {
      iconSvg = '<svg width="18" height="18" fill="none" stroke="#37A5A1" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-msg">${message}</div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("show");
    }, 10);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Modal: Guide user when no wallet extension is installed
  function showNoWalletModal() {
    const modal = document.getElementById("web3-install-modal");
    if (modal) {
      modal.classList.add("active");
    } else {
      alert("No Web3 wallet detected! Please install MetaMask or Trust Wallet extension to connect.");
    }
  }

  // 3. UI Synchronization Logic
  function initWeb3UI(service) {
    // Topbar elements
    const connectBtn = document.getElementById("web3-connect-btn");
    const connectedPill = document.getElementById("web3-connected-pill");
    const pillAddress = document.getElementById("web3-pill-address");
    const pillNetwork = document.getElementById("web3-pill-network");
    const pillDot = document.getElementById("web3-pill-dot");
    const pillUsdt = document.getElementById("web3-pill-usdt");
    const btnLabel = document.getElementById("web3-btn-label");

    // Modal elements
    const modal = document.getElementById("web3-wallet-modal");
    const modalCloseBtn = document.getElementById("web3-modal-close");
    const modalAddress = document.getElementById("web3-modal-address");
    const modalCopyBtn = document.getElementById("web3-modal-copy");
    const modalExplorerLink = document.getElementById("web3-modal-explorer");
    const modalNetwork = document.getElementById("web3-modal-network");
    const modalNetworkWarning = document.getElementById("web3-modal-network-warning");
    const modalSwitchBtn = document.getElementById("web3-modal-switch-bsc");
    const modalUsdt = document.getElementById("web3-modal-usdt");
    const modalRefreshBtn = document.getElementById("web3-modal-refresh");
    const modalDisconnectBtn = document.getElementById("web3-modal-disconnect");
    const modalSyncProfileBtn = document.getElementById("web3-modal-sync-profile");

    // Install Modal elements
    const installModal = document.getElementById("web3-install-modal");
    const installModalClose = document.getElementById("web3-install-modal-close");

    // Overview Page Banner elements (if on overview page)
    const overviewBanner = document.getElementById("web3-overview-banner");

    // Topbar Connect Button Click
    if (connectBtn) {
      connectBtn.addEventListener("click", () => {
        service.connect();
      });
    }

    // Connected Pill Click -> Opens Modal
    if (connectedPill) {
      connectedPill.addEventListener("click", () => {
        if (modal) modal.classList.add("active");
      });
    }

    // Modal Close Button
    if (modalCloseBtn && modal) {
      modalCloseBtn.addEventListener("click", () => {
        modal.classList.remove("active");
      });
    }

    // Install Modal Close
    if (installModalClose && installModal) {
      installModalClose.addEventListener("click", () => {
        installModal.classList.remove("active");
      });
    }

    // Backdrop click close
    [modal, installModal].forEach(m => {
      if (!m) return;
      m.addEventListener("click", (e) => {
        if (e.target === m) m.classList.remove("active");
      });
    });

    // Copy Address Helper
    if (modalCopyBtn) {
      modalCopyBtn.addEventListener("click", () => {
        if (!service.account) return;
        navigator.clipboard.writeText(service.account).then(() => {
          showToast("success", "Wallet address copied to clipboard!");
          const origText = modalCopyBtn.innerHTML;
          modalCopyBtn.innerHTML = '<span>✓ Copied</span>';
          setTimeout(() => modalCopyBtn.innerHTML = origText, 2000);
        });
      });
    }

    // Switch to BSC Action
    if (modalSwitchBtn) {
      modalSwitchBtn.addEventListener("click", async () => {
        try {
          await service.switchToBSC(56);
          showToast("success", "Switched network to BNB Smart Chain!");
        } catch (e) {
          showToast("error", "Failed to switch chain: " + (e.message || e));
        }
      });
    }

    // Refresh Balances Action
    if (modalRefreshBtn) {
      modalRefreshBtn.addEventListener("click", async () => {
        modalRefreshBtn.classList.add("rotating");
        await service.refreshBalances();
        modalRefreshBtn.classList.remove("rotating");
        showToast("success", "On-chain balances refreshed.");
      });
    }

    // Disconnect Action with Confirmation Popup
    if (modalDisconnectBtn) {
      modalDisconnectBtn.addEventListener("click", async () => {
        const addressTruncated = service.account ? truncateAddress(service.account) : 'your Web3 wallet';
        const confirmed = typeof window.showConfirmModal === 'function'
          ? await window.showConfirmModal({
              title: 'Disconnect Web3 Wallet',
              subtitle: 'FINVORA Cryptographic Protocol',
              message: `Are you sure you want to disconnect <strong>${addressTruncated}</strong>? You will need to re-approve connection to view live on-chain balances or sign transactions.`,
              type: 'disconnect',
              confirmText: 'Disconnect Wallet',
              cancelText: 'Stay Connected',
              confirmBtnClass: 'btn-danger'
            })
          : confirm("Are you sure you want to disconnect your Web3 wallet?");

        if (confirmed) {
          service.disconnect();
          if (modal) modal.classList.remove("active");
        }
      });
    }

    // Sync with Profile Action
    if (modalSyncProfileBtn) {
      modalSyncProfileBtn.addEventListener("click", async () => {
        if (!service.account) return;
        modalSyncProfileBtn.disabled = true;
        modalSyncProfileBtn.textContent = "Syncing...";
        await service.syncAddressWithProfile(service.account);
        showToast("success", "Address linked to your FINVORA account!");
        modalSyncProfileBtn.disabled = false;
        modalSyncProfileBtn.textContent = "✓ Linked to Account";
        setTimeout(() => {
          modalSyncProfileBtn.textContent = "Sync to Account Profile";
        }, 3000);
      });
    }

    // Subscribe to state updates & keep DOM in perfect sync
    service.subscribe((state) => {
      // 1. Topbar Connect Button / Pill
      if (connectBtn && connectedPill) {
        if (state.isConnected) {
          connectBtn.style.display = "none";
          connectedPill.style.display = "inline-flex";

          if (pillAddress) {
            pillAddress.textContent = truncateAddress(state.account);
          }
          if (pillNetwork) pillNetwork.style.display = "none";
          if (pillDot) pillDot.style.display = "none";
          if (pillUsdt) {
            pillUsdt.style.display = "inline-flex";
            const usdtValEl = pillUsdt.querySelector(".usdt-val");
            if (usdtValEl) {
              usdtValEl.textContent = state.balances.usdt || "0.000";
            } else {
              pillUsdt.textContent = `${state.balances.usdt || "0.000"} USDT/BEP20`;
            }
          }
        } else {
          connectBtn.style.display = "inline-flex";
          connectedPill.style.display = "none";

          if (pillUsdt) {
            pillUsdt.style.display = "none";
          }
          if (btnLabel) {
            btnLabel.textContent = state.connecting ? "Connecting..." : "Connect Wallet";
          }
          if (connectBtn) {
            connectBtn.disabled = state.connecting;
          }
        }
      }

      // 2. Web3 Modal Details
      if (modalAddress) modalAddress.textContent = state.account || "Not Connected";
      if (modalExplorerLink) {
        if (state.account) {
          modalExplorerLink.href = `${state.chainId === 97 ? 'https://testnet.bscscan.com' : 'https://bscscan.com'}/address/${state.account}`;
          modalExplorerLink.style.display = "inline-flex";
        } else {
          modalExplorerLink.style.display = "none";
        }
      }

      if (modalNetwork) {
        if (state.chainId === 56) {
          modalNetwork.textContent = "BNB Smart Chain (Mainnet)";
          modalNetwork.className = "badge badge-success";
        } else if (state.chainId === 97) {
          modalNetwork.textContent = "BNB Smart Chain (Testnet)";
          modalNetwork.className = "badge badge-info";
        } else {
          modalNetwork.textContent = `Unsupported Chain (ID: ${state.chainId})`;
          modalNetwork.className = "badge badge-error";
        }
      }

      if (modalNetworkWarning) {
        modalNetworkWarning.style.display = (state.isConnected && !state.isCorrectChain) ? "flex" : "none";
      }

      if (modalUsdt) modalUsdt.textContent = state.balances.usdt || "0.000";

      // 3. Overview Page Banner (if rendered)
      if (overviewBanner) {
        if (state.isConnected) {
          overviewBanner.innerHTML = `
            <div class="web3-banner-card connected">
              <div class="web3-banner-header">
                <div class="web3-banner-title-group">
                  <div class="web3-glow-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5zm0 0h-4a2 2 0 100 4h4v-4z"/></svg>
                  </div>
                  <div>
                    <h4 class="web3-banner-heading">Active Web3 Protocol Node</h4>
                    <div class="web3-banner-sub">
                      <span class="pulse-dot online"></span>
                      <span class="mono text-mint">${truncateAddress(state.account)}</span>
                      <span class="badge ${state.isCorrectChain ? 'badge-success' : 'badge-error'}" style="font-size: 0.72rem; margin-left: 0.5rem;">
                        ${state.chainId === 56 ? 'BSC MAINNET' : (state.chainId === 97 ? 'BSC TESTNET' : 'SWITCH REQUIRED')}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="web3-banner-actions">
                  <button type="button" class="btn btn-outline btn-sm" id="ovw-copy-address" title="Copy Address">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    <span>Copy</span>
                  </button>
                  <button type="button" class="btn btn-primary btn-sm" id="ovw-manage-wallet">
                    <span>Manage</span>
                  </button>
                </div>
              </div>

              <div class="web3-live-balances-grid" style="grid-template-columns: 1fr;">
                <div class="web3-balance-box bnb-highlight" style="display: flex; align-items: center; justify-content: space-between; padding: 1.1rem 1.4rem; background: rgba(240, 185, 11, 0.06); border: 1px solid rgba(240, 185, 11, 0.25); border-radius: 12px;">
                  <div>
                    <div class="balance-box-label" style="color: #F0B90B; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.04em; text-transform: uppercase;">Real-Time BNB Balance</div>
                    <div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 3px;">BNB Smart Chain (BSC Mainnet Native Asset)</div>
                  </div>
                  <div class="balance-box-value" style="font-size: 1.45rem; font-weight: 800; color: #F0B90B; text-align: right;">
                    <div><span class="mono">${state.balances.bnb}</span> <span class="unit" style="font-size: 0.85rem; font-weight: 700;">BNB</span></div>
                    <div style="font-size: 0.76rem; color: var(--text-secondary); font-weight: 500; margin-top: 2px;">${state.balances.bnbUsd || '$0.00'} USDT</div>
                  </div>
                </div>
              </div>
            </div>
          `;

          // Bind buttons in dynamically created banner
          const copyBtn = document.getElementById("ovw-copy-address");
          if (copyBtn) {
            copyBtn.addEventListener("click", () => {
              navigator.clipboard.writeText(state.account).then(() => {
                showToast("success", "Wallet address copied!");
              });
            });
          }
          const manageBtn = document.getElementById("ovw-manage-wallet");
          if (manageBtn && modal) {
            manageBtn.addEventListener("click", () => {
              modal.classList.add("active");
            });
          }
        } else {
          overviewBanner.innerHTML = `
            <div class="web3-banner-card disconnected">
              <div class="web3-banner-content">
                <div class="web3-glow-icon pulse">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5zm0 0h-4a2 2 0 100 4h4v-4z"/></svg>
                </div>
                <div>
                  <h4 class="web3-banner-heading">Connect Web3 Wallet (BNB Smart Chain)</h4>
                  <p class="web3-banner-desc">Connect MetaMask, Trust Wallet, or Binance Web3 Wallet to view live on-chain balances, link your settlement payout address, and execute instant transactions.</p>
                </div>
              </div>
              <button type="button" class="btn btn-web3-connect btn-lg" id="ovw-connect-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                <span>Connect Available Wallet</span>
              </button>
            </div>
          `;

          const ovwConnectBtn = document.getElementById("ovw-connect-btn");
          if (ovwConnectBtn) {
            ovwConnectBtn.addEventListener("click", () => {
              service.connect();
            });
          }
        }
      }

      // 4. Update Web3 Wallet-Based Referral Links (Don't use unique code, use {Wallet-address})
      const appUrl = window.location.origin;

      const ovwRefDis = document.getElementById("overview-ref-disconnected");
      const ovwRefConn = document.getElementById("overview-ref-connected");
      const ovwRefWallet = document.getElementById("overview-ref-wallet");
      const ovwRefInput = document.getElementById("ref-link-input");

      const refPageDis = document.getElementById("referrals-wallet-disconnected");
      const refPageConn = document.getElementById("referrals-wallet-connected");
      const refPageCode = document.getElementById("referrals-page-wallet-code");

      if (state.isConnected && state.account) {
        const walletRefUrl = `${appUrl}/register?ref=${state.account}`;

        if (ovwRefDis && ovwRefConn) {
          ovwRefDis.style.display = "none";
          ovwRefConn.style.display = "inline-flex";
        }
        if (ovwRefWallet) {
          ovwRefWallet.textContent = truncateAddress(state.account);
          ovwRefWallet.title = state.account;
        }
        if (ovwRefInput) {
          ovwRefInput.value = walletRefUrl;
        }

        if (refPageDis && refPageConn) {
          refPageDis.style.display = "none";
          refPageConn.style.display = "flex";
        }
        if (refPageCode) {
          refPageCode.textContent = `${state.account.slice(0, 8)}...${state.account.slice(-6)}`;
          refPageCode.title = state.account;
        }

        document.querySelectorAll('#ref-link-input').forEach(input => {
          input.value = walletRefUrl;
        });
      } else {
        if (ovwRefDis && ovwRefConn) {
          const hasSavedWallet = ovwRefInput && ovwRefInput.value && ovwRefInput.value.includes('?ref=0x');
          if (!hasSavedWallet) {
            ovwRefDis.style.display = "inline-flex";
            ovwRefConn.style.display = "none";
          }
        }

        if (refPageDis && refPageConn) {
          const anyRefInput = document.querySelector('#ref-link-input');
          const hasSavedWallet = anyRefInput && anyRefInput.value && anyRefInput.value.includes('?ref=0x');
          if (!hasSavedWallet) {
            refPageDis.style.display = "flex";
            refPageConn.style.display = "none";
          }
        }
      }
    });
  }

  // 4. Real-time User Main Balance Engine
  function initRealtimeMainBalanceSync() {
    let lastMainBalance = null;
    const topbarValEl = document.getElementById("topbar-main-balance-val");
    const topbarContainer = document.getElementById("topbar-main-balance-container");

    async function fetchLatestMainBalance() {
      try {
        const res = await fetch("/api/wallet", {
          headers: { "Accept": "application/json" },
          cache: "no-store"
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!json || !json.success || !json.data) return;

        const walletData = json.data;
        const newMainBal = Number(walletData.main_balance || 0).toFixed(2);

        if (topbarValEl) {
          if (lastMainBalance !== null && lastMainBalance !== newMainBal) {
            topbarValEl.textContent = newMainBal;
            if (topbarContainer) {
              topbarContainer.style.borderColor = "var(--c-mint)";
              topbarContainer.style.background = "rgba(38, 161, 123, 0.25)";
              topbarContainer.style.transform = "scale(1.05)";
              setTimeout(() => {
                topbarContainer.style.borderColor = "rgba(87, 193, 157, 0.25)";
                topbarContainer.style.background = "rgba(87, 193, 157, 0.1)";
                topbarContainer.style.transform = "scale(1)";
              }, 1200);
            }
          } else {
            topbarValEl.textContent = newMainBal;
          }
          lastMainBalance = newMainBal;
        }

        // Also update any page-specific elements (e.g. withdraw page available profit, max display)
        const currentMaxDisplay = document.getElementById("currentMaxDisplay");
        if (currentMaxDisplay && walletData.withdrawable_profit !== undefined) {
          currentMaxDisplay.textContent = Number(walletData.withdrawable_profit).toFixed(2);
        }
        const liveAvailProfit = document.getElementById("liveAvailableProfit");
        if (liveAvailProfit && walletData.withdrawable_profit !== undefined) {
          liveAvailProfit.textContent = `$${Number(walletData.withdrawable_profit).toFixed(2)}`;
        }

        // Notify page
        window.dispatchEvent(new CustomEvent("finvora:wallet-updated", { detail: walletData }));
      } catch (err) {
        // Silently ignore network errors during periodic poll
      }
    }

    // Initial fetch immediately
    fetchLatestMainBalance();

    // Poll every 3.5 seconds
    setInterval(fetchLatestMainBalance, 3500);

    // Refresh immediately on window focus or visibility change
    window.addEventListener("focus", fetchLatestMainBalance);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") fetchLatestMainBalance();
    });

    window.refreshMainBalance = fetchLatestMainBalance;
  }

  // 5. Initialize Singleton on DOM Ready
  document.addEventListener("DOMContentLoaded", () => {
    const web3Service = new Web3Service();
    window.FinvoraWeb3 = web3Service;

    web3Service.initListeners();
    initWeb3UI(web3Service);
    web3Service.autoConnectIfAuthorized();
    initRealtimeMainBalanceSync();
  });

})();
