# FINVORA — Institutional Decentralized Yield & Multi-Tier MLM Operating System

<div align="center">

![FINVORA Header](https://img.shields.io/badge/FINVORA-Institutional_Yield_Protocol-0D6C9F?style=for-the-badge&logo=shield&logoColor=white)
![Version](https://img.shields.io/badge/Version-2.5.0_Enterprise-37A5A1?style=for-the-badge)
![Ledger](https://img.shields.io/badge/Architecture-Double--Entry_Atomic_Ledger-57C19D?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-SHA256_Audited-80D895?style=for-the-badge)
![Node](https://img.shields.io/badge/Node.js-v18+-green?style=for-the-badge&logo=node.js)

<p align="center">
  <strong>Next-Generation High-Frequency Yield Management, Dynamic 4-Tier Network Engine & Double-Entry Financial Clearing Protocol</strong>
</p>

</div>

---

## Table of Contents
1. [Platform Architecture & Core Philosophy](#1-platform-architecture--core-philosophy)
2. [Function 1: Frictionless Registration & User Code Generation](#2-function-1-frictionless-registration--user-code-generation)
3. [Function 2: Dynamic 4-Tier Account Classification Engine](#3-function-2-dynamic-4-tier-account-classification-engine)
4. [Function 3: 5-Level One-Time Referral Commission Engine](#4-function-3-5-level-one-time-referral-commission-engine)
5. [Function 4: Real-Time Downline Status Visibility (Active vs. Inactive)](#5-function-4-real-time-downline-status-visibility-active-vs-inactive)
6. [Function 5: Mining Packages Store & Daily 2.0% Yield Protocol](#6-function-5-mining-packages-store--daily-20-yield-protocol)
7. [Function 6: 20-Level ROI Residual Income Program](#7-function-6-20-level-roi-residual-income-program)
8. [Function 7: Dynamic Weekly Leadership Salary System](#8-function-7-dynamic-weekly-leadership-salary-system)
9. [Function 8: Central Income Cap Engine (2X vs. 3X Multipliers)](#9-function-8-central-income-cap-engine-2x-vs-3x-multipliers)
10. [Function 9: Multi-Wallet Provisioning & Double-Entry Ledger](#10-function-9-multi-wallet-provisioning--double-entry-ledger)
11. [Function 10: Administrative Command Suite & Governance](#11-function-10-administrative-command-suite--governance)
12. [GitHub Actions Automation: Daily ROI & Weekly Salary](#12-github-actions-automation-daily-roi--weekly-salary)
13. [Quickstart Deployment Guide](#13-quickstart-deployment-guide)

---

## 1. Platform Architecture & Core Philosophy

FINVORA is an enterprise-grade financial technology and Multi-Level Marketing (MLM) platform engineered with a strict **Double-Entry Financial Ledger**, high-frequency calculations, deterministic income capping, and complete mathematical solvency guarantees.

```
       ┌─────────────────────────────────────────────────────────────┐
       │                FINVORA CENTRAL PROTOCOL CORE                │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         ▼                            ▼                            ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│   DAILY YIELD    │        │  REFERRAL MATRIX │        │  RESIDUAL LEVELS │
│ 2.0% Daily ROI   │        │ 5-Level One-Time │        │ 20-Level ROI     │
│ (730% APY Base)  │        │ (5%,2%,1%,1%,1%) │        │ Direct-Unlocked  │
└──────────────────┘        └──────────────────┘        └──────────────────┘
         │                            │                            │
         └────────────────────────────┼────────────────────────────┘
                                      ▼
                    ┌──────────────────────────────────┐
                    │     CENTRAL INCOME CAP ENGINE    │
                    │   2X (Investor) / 3X (Working)   │
                    └─────────────────┬────────────────┘
                                      ▼
                    ┌──────────────────────────────────┐
                    │    ATOMIC DOUBLE-ENTRY LEDGER    │
                    │ MAIN │ ROI │ REF │ LVL │ SALARY  │
                    └──────────────────────────────────┘
```

The system is constructed upon five immutable pillars:
1. **Double-Entry Atomic Ledger**: Zero balance inflation. Every credit is mirrored by a debit transaction or genesis inflow.
2. **Deterministic Liquidity Protection**: Central income caps prevent infinite referral liability and guarantee perpetual reserve solvency.
3. **Idempotent Batch Crons**: Daily yield and weekly salary payout jobs can run multiple times without duplicating payouts.
4. **Dynamic Network Evaluation**: Node capabilities and multipliers automatically scale in real-time as users sponsor new investors.
5. **Mobile-First Responsive Interface**: Full telemetry, glassmorphism dashboards, and touch-optimized navigation drawers.

---

## 2. Function 1: Frictionless Registration & User Code Generation

The registration system provides instantaneous onboarding without requiring users to choose account classifications upfront.

```
Incoming User ──► Register Page ──► Direct Entry ──► Assigned 'ACTIVE' ──► Code FIN1000x
```

### Step-by-Step Execution:
1. **Zero-Friction Registration**:
   - The user completes registration with standard credentials (Full Name, Username, Email, Phone, Password).
   - **No account classification selection is required** on the registration form. Every member joins smoothly as a standard active member.
2. **Sequential User Code Generation**:
   - The system automatically allocates a sequential, formatted institutional user code:
     $$\text{Pattern: } \mathbf{FIN10001}, \mathbf{FIN10002}, \mathbf{FIN10003}, \dots$$
   - The user code serves as both the member's unique account identifier and their personalized referral affiliate key (`/register?ref=FIN10001`).
3. **Sponsor Linkage & Node Insertion**:
   - If a valid sponsor referral code is supplied, the member is seamlessly nested under that sponsor in the genealogical network tree.
   - If no referral link is used, the member is automatically linked to the Root Genesis Node (`FINADMIN`).
4. **Default Initial State**:
   - Initial `user_type` is automatically set to **`ACTIVE`**.
   - Initial `status` is set to **`ACTIVE`**.
5. **Isolated Financial Wallet Provisioning**:
   - Simultaneously provisions dedicated wallets (`MAIN`, `ROI`, `REFERRAL`, `LEVEL`, `SALARY`) with atomic balance tracking.

---

## 3. Function 2: Dynamic 4-Tier Account Classification Engine

Account classifications in FINVORA are evaluated **dynamically** in real-time based on actual participation and network contribution.

| Category | Qualification Criteria | Income Multiplier | Cap Ceiling | Capabilities |
| :--- | :--- | :---: | :---: | :--- |
| **`ACTIVE`** | Registered user with no active investments and no paying direct referrals. | 2.0X (Base) | $0.00 | Network navigation, affiliate link sharing, receiving wallet transfers. |
| **`INVESTOR`** | User has personally purchased any package ($50–$10,000) but has no active paying direct downlines. | **2.0X (200%)** | $2 \times \text{Capital}$ | Daily 2.0% mining yield, one-time referral bonuses, deposit/withdraw access. |
| **`WORKING`** | User has directly sponsored $\ge 1$ downline partner who purchased an investment package. | **3.0X (300%)** | $3 \times \text{Capital}$ | Maximum 300% income ceiling, automatic contract cap upgrades, weekly salary eligibility. |
| **`SUSPENDED`** | Account administratively suspended by the compliance engine or master admin. | 0X (Frozen) | Frozen | All transactions, payouts, transfers, and logins blocked until review. |

### Dynamic Lifecycle Transitions:

```
                  ┌──────────────────────┐
                  │    REGISTER USER     │
                  └──────────┬───────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    ACTIVE ID    │
                    │ (0 Inv / 0 Ref) │
                    └────┬───────┬────┘
                         │       │
       Purchases Package │       │ Direct Downline Purchases Package
                         ▼       ▼ (With or Without Personal Investment)
                 ┌──────────────┐ ┌──────────────┐
                 │ INVESTOR ID  │ │  WORKING ID  │
                 │   (2X Cap)   │ │   (3X Cap)   │
                 └───────┬──────┘ └──────────────┘
                         │               ▲
                         │ Downline Buys │
                         └───────────────┘
```

### Step-by-Step Logic:
1. **Idle / New User (`ACTIVE`)**:
   - A newly registered user who merely logs in and explores remains in the **`ACTIVE`** category.
2. **Personal Investment (`INVESTOR`)**:
   - When an `ACTIVE` user purchases an investment package with no active paying referrals, they immediately advance to **`INVESTOR`**.
   - Maximum cumulative earnings ceiling is locked at **2X (200%)** of invested capital.
3. **Downline Investment (`WORKING`)**:
   - Whenever any directly sponsored partner purchases an investment package:
     - The sponsor **immediately advances to `WORKING`** category (regardless of whether the sponsor themselves invested yet or not).
     - If the sponsor already holds active investment contracts, the engine automatically upgrades their multiplier from **2.0X to 3.0X** and expands their maximum income cap accordingly (e.g., a $1,000 package ceiling expands from $2,000 to $3,000).
4. **Administrative Suspension & Dynamic Restoration (`SUSPENDED`)**:
   - If an administrator suspends an account, the user's status and classification transition to **`SUSPENDED`**.
   - When the administrator unsuspends the account, the engine **dynamically re-evaluates** the user's real-time state:
     - If they have active paying direct referrals $\rightarrow$ Restored to **`WORKING`**.
     - Else if they have active personal investments $\rightarrow$ Restored to **`INVESTOR`**.
     - Else $\rightarrow$ Restored to **`ACTIVE`**.

---

## 4. Function 3: 5-Level One-Time Referral Commission Engine

Whenever a new or existing member activates an institutional mining contract, the system distributes immediate, one-time referral bonuses across up to 5 upline sponsor generations.

```
Package Buyer ──► Level 1 Sponsor: 5% 
              ──► Level 2 Sponsor: 2%
              ──► Level 3 Sponsor: 1%
              ──► Level 4 Sponsor: 1%
              ──► Level 5 Sponsor: 1%
```

### Step-by-Step Execution:
1. **Trigger on Contract Purchase**:
   - The instant an investment package is activated, the `ReferralCommissionService` initiates upline traversal.
2. **5-Level Multi-Tier Rate Schedule**:
   $$\begin{aligned}
   \mathbf{Level\ 1} &\longrightarrow \mathbf{5.0\%} \quad (\text{Direct Sponsor}) \\
   \mathbf{Level\ 2} &\longrightarrow \mathbf{2.0\%} \quad (\text{2nd Generation Upline}) \\
   \mathbf{Level\ 3} &\longrightarrow \mathbf{1.0\%} \quad (\text{3rd Generation Upline}) \\
   \mathbf{Level\ 4} &\longrightarrow \mathbf{1.0\%} \quad (\text{4th Generation Upline}) \\
   \mathbf{Level\ 5} &\longrightarrow \mathbf{1.0\%} \quad (\text{5th Generation Upline})
   \end{aligned}$$
   - **Maximum Referral Depth**: Strictly capped at 5 generations. No commissions are disbursed beyond Level 5.
3. **Income Cap Ceiling Verification**:
   - Each qualifying upline's prospective commission is passed through the **Central Income Cap Engine**.
   - If the upline has reached their 2X or 3X maximum earnings limit, excess bonuses are capped, protecting platform reserves.
4. **Atomic Wallet Credit**:
   - Eligible commissions are credited directly to each upline's **Referral Wallet** (`REFERRAL_COMMISSION`).
   - Recorded in `referral_commissions` and `wallet_transactions` tables with full audit logs.

---

## 5. Function 4: Real-Time Downline Status Visibility (Active vs. Inactive)

To provide sponsors with clean, actionable network intelligence without exposing internal backend complexity, the platform displays each referred member's status strictly as **`Active`** or **`Inactive`**.

### Definition of Referral Status:
- **`Active`**: The referred partner holds an active funded mining package ($> \$0.00$ active capital) and account status is in good standing.
- **`Inactive`**: The referred partner has registered but hasn't funded an investment package ($0.00 active capital), or the account is suspended.

### Step-by-Step Execution:
1. **Affiliate Dashboard Integration**:
   - On `/my-referrals`, the user's direct downline is compiled via `GenealogyService`.
2. **Instant Status Badges**:
   - **Active Badge**: Displayed with an institutional green indicator and glowing pulse dot (`Active`).
   - **Inactive Badge**: Displayed with an amber/gray indicator (`Inactive`).
3. **Interactive Filter Toolbar**:
   - Sponsors can instantly toggle between:
     - `All Partners (Total Count)`
     - `Active (Funded Investors)`
     - `Inactive (Unfunded / New Registrations)`
4. **Key Referral Metrics**:
   - Tracks Total Direct Partners, Active Direct Count, Inactive Direct Count, and Total Direct Business Volume counting toward leadership salaries.

---

## 6. Function 5: Mining Packages Store & Daily 2.0% Yield Protocol

FINVORA offers institutional-grade mining yield tiers providing an automated 2.0% daily return (60% monthly / 730% annualized).

### Institutional Packages Catalog:
- **Starter Tier**: TH/S1 ($50), TH/S2 ($100), TH/S3 ($250)
- **Professional Tier**: TH/S4 ($500), TH/S5 ($1,000)
- **Institutional Tier**: TH/S6 ($2,500), TH/S7 ($5,000), TH/S8 ($10,000)

### Daily Yield Execution Cycle:
1. **Automated Daily Trigger**:
   - Executed via cron job (`RoiService.processDailyRoi()`) every 24 hours.
2. **Active Contract Iteration**:
   - Queries all contracts where `status = 'ACTIVE'`.
3. **Idempotency Check**:
   - Verifies if ROI has already been disbursed for the current calendar date (`roi_date`). Duplicate runs skip processed investments without double-crediting.
4. **Cap Enforcement**:
   - Validates that adding today's 2% return will not breach the contract's maximum income ceiling.
   - If the return reaches the ceiling, the contract is automatically marked as **`COMPLETED`**.
5. **Double-Entry Distribution**:
   - Credits the user's **ROI Wallet** and creates an immutable ledger audit trail.
   - Automatically triggers **Function 6 (Residual Level Income)** for eligible uplines.

---

## 7. Function 6: 20-Level ROI Residual Income Program

Whenever an active investor receives their daily 2.0% ROI, a residual percentage of that yield (ROI-on-ROI) is distributed up through 20 upline generations.

### Direct-to-Level Dynamic Unlock Rule:
To prevent non-performing nodes from skimming unearned passive residuals, levels are unlocked dynamically:
$$\mathbf{1\ Active\ Direct\ Referral} = \mathbf{1\ Level\ Unlocked}$$
- Sponsoring 1 active investor unlocks Level 1 residuals.
- Sponsoring 5 active investors unlocks Levels 1 through 5.
- Sponsoring 20 active investors unlocks all 20 downline levels.

### 20-Level Residual Yield Schedule:
- **Level 1**: 10.0% of daily ROI
- **Level 2**: 5.0% of daily ROI
- **Level 3**: 3.0% of daily ROI
- **Level 4**: 2.0% of daily ROI
- **Level 5**: 1.0% of daily ROI
- **Levels 6–10**: 0.5% of daily ROI each
- **Levels 11–20**: 0.25% of daily ROI each

---

## 8. Function 7: Dynamic Weekly Leadership Salary System

The leadership salary program rewards top network builders with guaranteed weekly royalty stipends for 25 consecutive weeks based on cumulative direct business volume.

```
Direct Business Milestones ──► Dynamic Rank Qualification ──► Weekly Salary for 25 Weeks
```

### 13 Progressive Leadership Tiers:
| Tier | Title | Direct Volume Required | Weekly Stipend | Duration | Total Maximum Payout |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **1** | Silver Leader | $2,500 | **$20.00 / wk** | 25 Weeks | $500.00 |
| **2** | Gold Executive | $5,000 | **$50.00 / wk** | 25 Weeks | $1,250.00 |
| **3** | Ruby Ambassador | $10,000 | **$100.00 / wk** | 25 Weeks | $2,500.00 |
| **4** | Emerald Director | $25,000 | **$250.00 / wk** | 25 Weeks | $6,250.00 |
| **5** | Diamond President | $50,000 | **$500.00 / wk** | 25 Weeks | $12,500.00 |
| **6** | Blue Diamond | $100,000 | **$1,000.00 / wk** | 25 Weeks | $25,000.00 |
| **7** | Black Diamond | $200,000 | **$2,000.00 / wk** | 25 Weeks | $50,000.00 |
| **8** | Crown Diamond | $350,000 | **$3,500.00 / wk** | 25 Weeks | $87,500.00 |
| **9** | Royal Crown | $500,000 | **$5,000.00 / wk** | 25 Weeks | $125,000.00 |
| **10** | Vice Chancellor | $750,000 | **$7,500.00 / wk** | 25 Weeks | $187,500.00 |
| **11** | Grand Chancellor | $1,000,000 | **$10,000.00 / wk** | 25 Weeks | $250,000.00 |
| **12** | Global Partner | $1,500,000 | **$15,000.00 / wk** | 25 Weeks | $375,000.00 |
| **13** | Founder Circle | $2,000,000 | **$20,000.00 / wk** | 25 Weeks | $500,000.00 |

### Single Active Salary Contract Rule:
- A user can only maintain **one active salary contract** at any given moment.
- When a leader reaches a higher volume milestone, the engine automatically **stops the previous salary contract** (`UPGRADED`) and activates the higher salary tier for a fresh 25-week cycle.

---

## 9. Function 8: Central Income Cap Engine (2X vs. 3X Multipliers)

The Central Income Cap Engine is the foundational solvency mechanism of the platform.

$$\text{Max Cumulative Earning Limit} = \sum (\text{Active Package Amount} \times \text{Multiplier})$$

- **Working ID (3X Multiplier)**: Cumulative earnings across all streams (ROI + Referral + Level + Salary) are capped at 300% of invested capital.
- **Investor ID (2X Multiplier)**: Cumulative earnings are capped at 200% of invested capital.
- **Dynamic Cap Expansion**: When an Investor ID upgrades to Working ID, their active package caps automatically expand from 2X to 3X in real-time.
- **Automated Retirement**: Once a contract reaches its cap ceiling, it transitions to `COMPLETED`. The user must re-commit capital (re-topup) to continue earning.

---

## 10. Function 9: Multi-Wallet Provisioning & Double-Entry Ledger

FINVORA operates with segregated wallet balances per account to maintain clear accounting separation:

1. **Main Wallet (`main_balance`)**: Deposited and transfer capital used for package activations. Real-time balance updates on deposits, package investments, and withdrawals.
2. **ROI Wallet (`roi_balance`)**: Automated daily 2.0% mining yield.
3. **Referral Wallet (`referral_balance`)**: 5-level one-time referral commissions.
4. **Level Wallet (`level_balance`)**: 20-level daily ROI residuals.
5. **Salary Wallet (`salary_balance`)**: Weekly leadership royalty payments.

---

## 11. Function 10: Administrative Command Suite & Governance

Administrators maintain complete platform oversight through the enterprise admin command center:

- **User Governance**: View complete user directory with 4-tier classification filters (`Active ID`, `Investor ID`, `Working ID`, `Suspended ID`).
- **Dynamic Suspension**: Instantly suspend fraudulent nodes or restore compliant nodes with dynamic state evaluation.
- **Deposit & Withdrawal Processing**: Review blockchain transaction hashes (TxHash) and approve or reject withdrawal requests.
- **Protocol Configuration**: Configure multipliers, ROI percentages, withdrawal fees, and maintenance mode dynamically.
- **Immutable Audit Trail**: Every administrative action, balance adjustment, and login attempt is cryptographically logged in `audit_logs`.

---

## 12. Universal Automation: Daily ROI & Weekly Salary

FINVORA features a **Universal Multi-Platform Automation Architecture** engineered to execute daily 2.0% mining yield and weekly 25-week leadership salary payouts across both serverless (Vercel) and persistent container/server environments (Antideploy, Docker, Render, Railway, VPS, Localhost) without depending on GitHub Actions workflows.

### Automation Methods by Platform:

| Platform / Host | Execution Method | Configuration | Trigger Timing |
| :--- | :--- | :--- | :--- |
| **Vercel** | **Vercel Serverless Cron** | Native [`vercel.json`](file:///d:/XAMPP/htdocs/ZaarWeb/vercel.json) | Daily @ 00:00 UTC (`/api/cron/roi`) & Mondays @ 00:00 UTC (`/api/cron/salary`) |
| **Antideploy / Docker / VPS / Node** | **In-Process Universal Scheduler** | Built-in [`SchedulerService`](file:///d:/XAMPP/htdocs/ZaarWeb/src/services/SchedulerService.js) in [`server.js`](file:///d:/XAMPP/htdocs/ZaarWeb/server.js) | Continuous 24/7 background evaluation @ 00:00 UTC automatically |
| **External Webhook / Any Platform** | **Secure HTTP REST Endpoint** | `GET` / `POST` with `CRON_SECRET` | Supports cron-job.org, Cloudflare Workers, or custom curl scripts |
| **Admin Command Center** | **Instant Manual Dispatch** | Admin Dashboard (`/SLXadmin/dashboard`) | Immediate on-demand execution with audit log feedback |

### 1. Method A: Vercel Native Deployment & Vercel Cron
Vercel serverless apps freeze when idle, so automated crons are triggered natively by Vercel's Edge scheduler configured in [`vercel.json`](file:///d:/XAMPP/htdocs/ZaarWeb/vercel.json):
```json
{
  "version": 2,
  "functions": {
    "api/index.js": {
      "includeFiles": "views/**"
    }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": "/api/index.js" }
  ],
  "crons": [
    { "path": "/api/cron/roi", "schedule": "0 0 * * *" },
    { "path": "/api/cron/salary", "schedule": "0 0 * * 1" }
  ]
}
```
Vercel Cron automatically invokes `GET /api/cron/roi` and `GET /api/cron/salary` with header `Authorization: Bearer <CRON_SECRET>`.

### 2. Method B: Antideploy / Persistent Node Host (In-Process Scheduler)
When running in persistent Node.js environments (Docker, Antideploy, Render, Railway, VPS), the internal [`SchedulerService`](file:///d:/XAMPP/htdocs/ZaarWeb/src/services/SchedulerService.js) runs automatically inside [`server.js`](file:///d:/XAMPP/htdocs/ZaarWeb/server.js):
- Checks UTC time every 60 seconds.
- Automatically disburses Daily ROI at 00:00 UTC.
- Automatically disburses Weekly Leadership Salary on Mondays at 00:00 UTC.
- Full idempotency guaranteed: payouts cannot duplicate on the same date or calendar cycle.

### 3. Method C: Secure Webhook / curl Triggers
You can trigger execution from any external HTTP client or cron runner:
```bash
# Trigger Daily ROI (Accepts GET or POST, with Bearer token or ?key=)
curl -X GET "https://your-domain.com/api/cron/roi" \
  -H "Authorization: Bearer finvora_cron_secret_key_2026"

# Or via URL query key:
curl -X GET "https://your-domain.com/api/cron/roi?key=finvora_cron_secret_key_2026"

# Trigger Weekly Salary:
curl -X GET "https://your-domain.com/api/cron/salary" \
  -H "Authorization: Bearer finvora_cron_secret_key_2026"

# Check Cron Status & Execution History:
curl "https://your-domain.com/api/cron/status"
```

---

## 13. Quickstart Deployment Guide

### Prerequisites
- **Node.js**: v20.0.0 or higher
- **MongoDB Atlas**: MongoDB connection string (`MONGODB_URI`)
- **NPM**: v9.0.0 or higher

### Deploying to Vercel
1. Import repository into [Vercel](https://vercel.com).
2. Set Environment Variables in Vercel Project Settings:
   - `MONGODB_URI`: `mongodb+srv://...`
   - `MONGODB_DB_NAME`: `finvora`
   - `CRON_SECRET`: `finvora_cron_secret_key_2026`
   - `SESSION_SECRET`: `your_secure_session_secret`
   - `ADMIN_DEPOSIT_WALLET`: `0xab77016151b3359B7f439a39bD57fD8061A4ac49`
   - `ADMIN_WITHDRAWAL_WALLET`: `0x9341d76910A7825Db5b751f94031f79D63602d22`
3. Deploy! Vercel will automatically serve static files from `/public`, route requests through [`api/index.js`](file:///d:/XAMPP/htdocs/ZaarWeb/api/index.js), and schedule crons via [`vercel.json`](file:///d:/XAMPP/htdocs/ZaarWeb/vercel.json).

### Deploying to Antideploy / Render / Railway / Docker / VPS
1. Set up your environment variables in `.env` or the platform environment settings.
2. Run standard commands:
```bash
npm install
npm start
```
The platform will launch [`server.js`](file:///d:/XAMPP/htdocs/ZaarWeb/server.js), connect to MongoDB Atlas, and start the Universal In-Process Scheduler automatically.

### Access Points:
- **Public Portal**: `http://localhost:3000`
- **User Dashboard**: `http://localhost:3000/dashboard`
- **Admin Command Center**: `http://localhost:3000/SLXadmin/dashboard`
- **Default Master Admin**: `admin` / `admin123`
- **Default Seed User**: `usera` / `password123`

---

<div align="center">
  <sub>FINVORA Financial Technologies &bull; Institutional Mining & Multi-Level Yield Infrastructure &bull; All Rights Reserved</sub>
</div>
# test
