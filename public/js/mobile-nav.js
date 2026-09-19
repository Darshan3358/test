/**
 * FINVORA Global Responsive Navigation System
 * Handles:
 * 1. Public site mobile menu drawer and backdrop overlay.
 * 2. User Dashboard sidebar sliding drawer and backdrop.
 * 3. Admin Dashboard sidebar sliding drawer and backdrop.
 * 4. Keyboard accessibility (ESC to close) and auto-close on desktop resize.
 */

(function() {
  'use strict';

  function initMobileNav() {
    // -------------------------------------------------------------
    // 1. PUBLIC SITE MOBILE MENU
    // -------------------------------------------------------------
    const publicMenuBtn = document.getElementById('public-menu-btn');
    const publicDrawer = document.getElementById('public-mobile-drawer');
    const publicBackdrop = document.getElementById('public-nav-backdrop');
    const publicCloseBtn = document.getElementById('public-drawer-close');

    function openPublicMenu() {
      if (publicDrawer) publicDrawer.classList.add('open');
      if (publicBackdrop) publicBackdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closePublicMenu() {
      if (publicDrawer) publicDrawer.classList.remove('open');
      if (publicBackdrop) publicBackdrop.classList.remove('active');
      document.body.style.overflow = '';
    }

    if (publicMenuBtn) {
      publicMenuBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openPublicMenu();
      });
    }

    if (publicCloseBtn) {
      publicCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closePublicMenu();
      });
    }

    if (publicBackdrop) {
      publicBackdrop.addEventListener('click', closePublicMenu);
    }

    // -------------------------------------------------------------
    // 2. DASHBOARD SIDEBAR (USER & ADMIN)
    // -------------------------------------------------------------
    const sidebarToggleBtns = document.querySelectorAll('.sidebar-toggle-btn, #sidebar-toggle');
    const sidebar = document.querySelector('.dashboard-sidebar');
    let sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const sidebarCloseBtn = document.querySelector('.sidebar-close-btn');

    // If sidebar backdrop doesn't exist in DOM, create it dynamically
    if (sidebar && !sidebarBackdrop) {
      sidebarBackdrop = document.createElement('div');
      sidebarBackdrop.id = 'sidebar-backdrop';
      sidebarBackdrop.className = 'sidebar-backdrop';
      document.body.appendChild(sidebarBackdrop);
    }

    function openSidebar() {
      if (sidebar) sidebar.classList.add('open');
      if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
      if (sidebar) sidebar.classList.remove('open');
      if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
      document.body.style.overflow = '';
    }

    sidebarToggleBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (sidebar && sidebar.classList.contains('open')) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });
    });

    if (sidebarCloseBtn) {
      sidebarCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeSidebar();
      });
    }

    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener('click', closeSidebar);
    }

    // Close on navigation link click inside sidebar on mobile
    if (sidebar) {
      const navLinks = sidebar.querySelectorAll('.sidebar-link');
      navLinks.forEach(link => {
        link.addEventListener('click', () => {
          if (window.innerWidth <= 1024) {
            closeSidebar();
          }
        });
      });
    }

    // -------------------------------------------------------------
    // 3. GLOBAL KEYBOARD & RESIZE LISTENERS
    // -------------------------------------------------------------
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePublicMenu();
        closeSidebar();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 1024) {
        closePublicMenu();
        closeSidebar();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }
})();
