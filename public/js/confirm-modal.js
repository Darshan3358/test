/**
 * FINVORA Global Confirmation Modal Engine
 * Provides an interactive, ultra-premium glassmorphic confirmation popup container
 * for critical user & administrative actions:
 * - Package Activation
 * - Admin Deposit Approval & Rejection
 * - Admin Withdrawal Disbursal & Rejection
 * - User Withdrawal Submission
 * - Admin & User Logout
 * - Web3 Wallet Disconnection
 */

(function () {
  'use strict';

  // Template HTML for the confirmation container
  const MODAL_ID = 'finvora-confirm-modal';

  function ensureModalElement() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'confirm-modal-backdrop';
    modal.innerHTML = `
      <div class="confirm-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div class="confirm-modal-header">
          <div class="confirm-icon-wrap" id="confirm-modal-icon">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </div>
          <div>
            <h3 class="confirm-modal-title" id="confirm-modal-title">Confirm Action</h3>
            <div class="confirm-modal-sub" id="confirm-modal-sub">Security Confirmation Protocol</div>
          </div>
          <button type="button" class="confirm-modal-close" id="confirm-modal-close" aria-label="Close dialog">&times;</button>
        </div>

        <div class="confirm-modal-body">
          <p class="confirm-modal-message" id="confirm-modal-message">Are you sure you want to proceed?</p>
          <div class="confirm-details-card" id="confirm-modal-details" style="display: none;"></div>
        </div>

        <div class="confirm-modal-footer">
          <button type="button" class="btn btn-outline" id="confirm-modal-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="confirm-modal-action">Confirm</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  // Icons based on action type
  function getIconSvg(type) {
    switch (type) {
      case 'danger':
      case 'logout':
      case 'disconnect':
        return `<svg width="26" height="26" fill="none" stroke="#EF4444" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
      case 'package':
        return `<svg width="26" height="26" fill="none" stroke="#57C19D" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`;
      case 'withdraw':
      case 'withdrawal_approve':
        return `<svg width="26" height="26" fill="none" stroke="#F0B90B" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
      case 'success':
      case 'deposit_approve':
        return `<svg width="26" height="26" fill="none" stroke="#57C19D" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
      default:
        return `<svg width="26" height="26" fill="none" stroke="#37A5A1" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    }
  }

  /**
   * Main confirmation modal function
   * Returns a Promise resolving to true (user confirmed) or false (cancelled)
   */
  function showConfirmModal(options = {}) {
    return new Promise((resolve) => {
      const modal = ensureModalElement();

      const {
        title = 'Please Confirm',
        subtitle = 'Security Verification',
        message = 'Are you sure you wish to proceed with this action?',
        detailsHtml = null,
        type = 'info', // 'info', 'danger', 'package', 'withdraw', 'success'
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        confirmBtnClass = 'btn-primary'
      } = options;

      const titleEl = modal.querySelector('#confirm-modal-title');
      const subEl = modal.querySelector('#confirm-modal-sub');
      const msgEl = modal.querySelector('#confirm-modal-message');
      const detailsEl = modal.querySelector('#confirm-modal-details');
      const iconWrap = modal.querySelector('#confirm-modal-icon');
      const actionBtn = modal.querySelector('#confirm-modal-action');
      const cancelBtn = modal.querySelector('#confirm-modal-cancel');
      const closeBtn = modal.querySelector('#confirm-modal-close');

      titleEl.textContent = title;
      subEl.textContent = subtitle;
      msgEl.innerHTML = message;
      iconWrap.innerHTML = getIconSvg(type);
      iconWrap.className = `confirm-icon-wrap type-${type}`;

      if (detailsHtml) {
        detailsEl.innerHTML = detailsHtml;
        detailsEl.style.display = 'block';
      } else {
        detailsEl.innerHTML = '';
        detailsEl.style.display = 'none';
      }

      actionBtn.textContent = confirmText;
      actionBtn.className = `btn ${confirmBtnClass}`;
      cancelBtn.textContent = cancelText;

      // Show modal with animation
      modal.classList.add('active');

      function cleanup(result) {
        modal.classList.remove('active');
        actionBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKeyDown);
        resolve(result);
      }

      function onConfirm() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onBackdrop(e) { if (e.target === modal) cleanup(false); }
      function onKeyDown(e) { if (e.key === 'Escape') cleanup(false); }

      actionBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKeyDown);
    });
  }

  window.showConfirmModal = showConfirmModal;
  window.FinvoraConfirm = { show: showConfirmModal };

  // =========================================================================
  // Automatic Interception of Forms and Links
  // =========================================================================

  document.addEventListener('DOMContentLoaded', () => {
    ensureModalElement();

    // 1. User Package Purchase Confirmation
    const packageForms = document.querySelectorAll('form[action="/packages/purchase"]');
    packageForms.forEach((form) => {
      // Remove any inline onsubmit confirm
      form.removeAttribute('onsubmit');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Extract package data from card context
        const formPkgName = form.getAttribute('data-package-name');
        const formPkgPrice = form.getAttribute('data-package-price');
        const card = form.closest('.package-card');
        const pkgName = formPkgName || (card ? (card.querySelector('.package-name')?.textContent || 'Investment Package') : 'Investment Package');
        const pkgPrice = formPkgPrice || (card ? (card.querySelector('.package-price')?.textContent?.trim() || '$0') : '');
        const dailyYield = card ? (card.querySelector('.package-yield-val')?.textContent || '2.0% Daily ROI') : '2.0% Daily ROI';
        const multiplier = card ? (card.querySelector('.return-item-val')?.textContent || '2X / 3X') : '2X / 3X';

        const detailsHtml = `
          <div class="confirm-details-row">
            <span class="detail-label">Selected Tier:</span>
            <strong class="detail-val text-mint">${pkgName}</strong>
          </div>
          <div class="confirm-details-row">
            <span class="detail-label">Activation Cost:</span>
            <strong class="detail-val text-lime">${pkgPrice}</strong>
          </div>
          <div class="confirm-details-row">
            <span class="detail-label">Daily Earnings:</span>
            <span class="detail-val">${dailyYield}</span>
          </div>
          <div class="confirm-details-row">
            <span class="detail-label">Multiplier Return:</span>
            <span class="detail-val">${multiplier}</span>
          </div>
          <div class="confirm-details-notice">
            Funds will be instantly debited from your <strong>Main Wallet</strong> balance upon activation.
          </div>
        `;

        const confirmed = await showConfirmModal({
          title: `Activate ${pkgName}`,
          subtitle: 'FINVORA Investment Engine',
          message: `Are you ready to activate this package node and start generating 2.0% automated daily yield?`,
          detailsHtml,
          type: 'package',
          confirmText: 'Confirm & Activate Node',
          cancelText: 'Cancel',
          confirmBtnClass: 'btn-primary'
        });

        if (confirmed) {
          form.submit();
        }
      });
    });

    // 2. User Withdrawal Form Confirmation
    const withdrawForm = document.querySelector('form[action="/withdraw"]');
    if (withdrawForm) {
      withdrawForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const amountInput = withdrawForm.querySelector('input[name="amount"]');
        const addrInput = withdrawForm.querySelector('input[name="accountDetails"]');
        const sourceSelect = withdrawForm.querySelector('select[name="profitSource"]');
        const amount = parseFloat(amountInput?.value || 0);
        const addr = (addrInput?.value || '').trim();
        const sourceName = sourceSelect ? (sourceSelect.options[sourceSelect.selectedIndex]?.text?.split('(')[0]?.trim() || 'Withdrawable Profit') : 'Withdrawable Profit';

        if (amount <= 0) {
          withdrawForm.submit();
          return;
        }

        const fee = (amount * 0.10).toFixed(2);
        const net = (amount - fee).toFixed(2);

        const detailsHtml = `
          <div class="confirm-details-row">
            <span class="detail-label">Profit Source:</span>
            <span class="detail-val text-mint" style="font-weight: 700;">${sourceName}</span>
          </div>
          <div class="confirm-details-row">
            <span class="detail-label">Requested Gross:</span>
            <strong class="detail-val">$${amount.toFixed(2)} USDT</strong>
          </div>
          <div class="confirm-details-row">
            <span class="detail-label">Platform Fee (10%):</span>
            <span class="detail-val text-error">-$${fee} USDT</span>
          </div>
          <div class="confirm-details-row highlight">
            <span class="detail-label">Net Disbursed:</span>
            <strong class="detail-val text-mint">$${net} USDT</strong>
          </div>
          <div class="confirm-details-row">
            <span class="detail-label">Asset & Network:</span>
            <span class="detail-val"><span class="badge badge-success">USDT (BEP-20)</span></span>
          </div>
          <div class="confirm-details-row">
            <span class="detail-label">Destination Address:</span>
            <span class="detail-val mono text-mint" style="font-size: 0.78rem;">${addr}</span>
          </div>
          <div class="confirm-details-notice text-warning">
            Deducted strictly from your Withdrawable Profit. Capital deposits are never deducted. Please ensure destination is a valid BEP-20 address on BNB Smart Chain.
          </div>
        `;

        const confirmed = await showConfirmModal({
          title: 'Confirm USDT (BEP-20) Withdrawal',
          subtitle: 'Cryptographic Ledger Disbursal',
          message: 'Please review your withdrawal breakdown before submitting to the queue:',
          detailsHtml,
          type: 'withdraw',
          confirmText: 'Confirm & Submit Request',
          cancelText: 'Edit Details',
          confirmBtnClass: 'btn-primary'
        });

        if (confirmed) {
          withdrawForm.submit();
        }
      });
    }

    // 3. Admin Deposit Approval Confirmation
    const adminDepositApproveForms = document.querySelectorAll('form[action*="/deposits/"][action*="/approve"]');
    adminDepositApproveForms.forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const row = form.closest('tr');
        let code = 'Deposit Inflow';
        let user = 'User';
        let amount = '$0.00';

        if (row) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 7) {
            code = cells[0]?.textContent?.trim() || 'Deposit';
            user = cells[1]?.textContent?.trim() || 'User';
            amount = cells[2]?.textContent?.trim() || '$0.00';
          } else if (cells.length >= 3) {
            user = cells[0]?.querySelector('strong')?.textContent?.trim() || cells[0]?.textContent?.trim() || 'User';
            code = cells[0]?.querySelector('.mono')?.textContent?.trim() || 'Deposit Inflow';
            amount = cells[1]?.textContent?.trim() || '$0.00';
          }
        }

        const detailsHtml = `
          <div class="confirm-details-row">
            <span class="detail-label">Deposit Reference:</span>
            <span class="detail-val mono text-mint">${code}</span>
          </div>
          <div class="confirm-details-row">
            <span class="detail-label">Target User:</span>
            <strong class="detail-val">${user}</strong>
          </div>
          <div class="confirm-details-row">
            <span class="detail-label">Deposit Amount:</span>
            <strong class="detail-val text-mint">${amount}</strong>
          </div>
          <div class="confirm-details-notice">
            Approving will immediately credit the user's <strong>Main Wallet</strong> ledger and log this in the immutable financial audit.
          </div>
        `;

        const confirmed = await showConfirmModal({
          title: 'Approve Deposit & Credit Ledger',
          subtitle: 'Administrative Override Action',
          message: `Are you sure you want to approve deposit for <strong>${user}</strong>?`,
          detailsHtml,
          type: 'success',
          confirmText: 'Approve & Credit',
          cancelText: 'Cancel',
          confirmBtnClass: 'btn-primary'
        });

        if (confirmed) form.submit();
      });
    });

    // 4. Admin Deposit Rejection Confirmation
    const adminDepositRejectForms = document.querySelectorAll('form[action*="/deposits/"][action*="/reject"]');
    adminDepositRejectForms.forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const row = form.closest('tr');
        let code = 'Deposit';
        let user = 'User';

        if (row) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 7) {
            code = cells[0]?.textContent?.trim() || 'Deposit';
            user = cells[1]?.textContent?.trim() || 'User';
          } else if (cells.length >= 3) {
            user = cells[0]?.querySelector('strong')?.textContent?.trim() || cells[0]?.textContent?.trim() || 'User';
            code = cells[0]?.querySelector('.mono')?.textContent?.trim() || 'Deposit';
          }
        }

        const confirmed = await showConfirmModal({
          title: 'Reject Deposit Request',
          subtitle: 'Administrative Action',
          message: `Are you sure you want to mark deposit <strong>${code}</strong> for user <strong>${user}</strong> as REJECTED? This action cannot be reversed.`,
          type: 'danger',
          confirmText: 'Reject Request',
          cancelText: 'Cancel',
          confirmBtnClass: 'btn-danger'
        });

        if (confirmed) form.submit();
      });
    });

    // 5. Admin Withdrawal Disbursal Confirmation
    const adminWithdrawApproveForms = document.querySelectorAll('form[action*="/withdrawals/"][action*="/approve"]');
    adminWithdrawApproveForms.forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const row = form.closest('tr');
        let code = 'Withdrawal';
        let user = 'Beneficiary';
        let net = '$0.00';
        let dest = '';

        if (row) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 7) {
            code = cells[0]?.textContent?.trim() || 'Withdrawal';
            user = cells[1]?.textContent?.trim() || 'User';
            net = cells[4]?.textContent?.trim() || '';
            dest = cells[5]?.textContent?.trim() || cells[6]?.textContent?.trim() || '';
          } else if (cells.length >= 3) {
            user = cells[0]?.querySelector('strong')?.textContent?.trim() || cells[0]?.textContent?.trim() || 'User';
            code = cells[0]?.querySelector('.mono')?.textContent?.trim() || 'Payout';
            net = cells[1]?.textContent?.trim() || '';
          }
        }

        const detailsHtml = `
          <div class="confirm-details-row">
            <span class="detail-label">Withdrawal Ref:</span>
            <span class="detail-val mono text-mint">${code}</span>
          </div>
          <div class="confirm-details-row">
            <span class="detail-label">Beneficiary:</span>
            <strong class="detail-val">${user}</strong>
          </div>
          <div class="confirm-details-row">
            <span class="detail-label">Net Disbursal:</span>
            <strong class="detail-val text-mint">${net} USDT</strong>
          </div>
          ${dest ? `
          <div class="confirm-details-row">
            <span class="detail-label">BEP-20 Address:</span>
            <span class="detail-val mono" style="font-size: 0.78rem;">${dest}</span>
          </div>` : ''}
          <div class="confirm-details-notice text-warning">
            Please ensure the USDT transfer has been broadcasted on BNB Smart Chain before confirming disbursal.
          </div>
        `;

        const confirmed = await showConfirmModal({
          title: 'Confirm Withdrawal Disbursal',
          subtitle: 'Treasury Disbursal Protocol',
          message: `Confirm payout for request <strong>${code}</strong>?`,
          detailsHtml,
          type: 'withdrawal_approve',
          confirmText: 'Disburse & Finalize',
          cancelText: 'Cancel',
          confirmBtnClass: 'btn-primary'
        });

        if (confirmed) form.submit();
      });
    });

    // 6. Admin Withdrawal Rejection Confirmation
    const adminWithdrawRejectForms = document.querySelectorAll('form[action*="/withdrawals/"][action*="/reject"]');
    adminWithdrawRejectForms.forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const row = form.closest('tr');
        let code = 'Withdrawal';
        let user = 'User';
        let amount = '';

        if (row) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 7) {
            code = cells[0]?.textContent?.trim() || 'Withdrawal';
            user = cells[1]?.textContent?.trim() || 'User';
            amount = cells[2]?.textContent?.trim() || '';
          } else if (cells.length >= 3) {
            user = cells[0]?.querySelector('strong')?.textContent?.trim() || cells[0]?.textContent?.trim() || 'User';
            code = cells[0]?.querySelector('.mono')?.textContent?.trim() || 'Withdrawal';
            amount = cells[1]?.textContent?.trim() || '';
          }
        }

        const confirmed = await showConfirmModal({
          title: 'Reject Withdrawal & Refund Ledger',
          subtitle: 'Administrative Cancellation',
          message: `Are you sure you want to reject withdrawal <strong>${code}</strong>? The requested amount of <strong>${amount}</strong> will be refunded to user <strong>${user}</strong>'s Main Wallet.`,
          type: 'danger',
          confirmText: 'Reject & Refund',
          cancelText: 'Cancel',
          confirmBtnClass: 'btn-danger'
        });

        if (confirmed) form.submit();
      });
    });

    // 7. Delegated Sign Out / Logout Confirmation (Catch all logout links on page)
    document.addEventListener('click', async (e) => {
      const logoutLink = e.target.closest('a[href="/logout"]');
      if (!logoutLink) return;

      e.preventDefault();
      const confirmed = await showConfirmModal({
        title: 'Sign Out Confirmation',
        subtitle: 'FINVORA Security Gateway',
        message: 'Are you sure you want to end your active session and sign out of your account?',
        type: 'logout',
        confirmText: 'Sign Out',
        cancelText: 'Stay Logged In',
        confirmBtnClass: 'btn-danger'
      });

      if (confirmed) {
        window.location.href = '/logout';
      }
    });

    // 8. Custom data-confirm attributes on any form
    document.querySelectorAll('form[data-confirm]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const promptMsg = form.getAttribute('data-confirm');
        const title = form.getAttribute('data-confirm-title') || 'Confirm Action';
        const type = form.getAttribute('data-confirm-type') || 'warning';

        const confirmed = await showConfirmModal({
          title,
          message: promptMsg,
          type,
          confirmText: form.getAttribute('data-confirm-btn') || 'Confirm',
          cancelText: 'Cancel'
        });

        if (confirmed) form.submit();
      });
    });
  });

})();
