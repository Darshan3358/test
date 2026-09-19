/**
 * FINVORA — Responsive Password Visibility Toggle (Show / Hide Password)
 * Handles state toggling and visual icon swap between Eye and Eye-Off.
 */
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;

  // Debounce guard to prevent double-execution from multiple event triggers
  const now = Date.now();
  if (btn && btn._lastToggleTime && (now - btn._lastToggleTime < 250)) {
    return;
  }
  if (btn) btn._lastToggleTime = now;

  const willBeVisible = input.type === 'password';
  input.type = willBeVisible ? 'text' : 'password';

  if (btn) {
    btn.setAttribute('aria-label', willBeVisible ? 'Hide password' : 'Show password');
    btn.setAttribute('title', willBeVisible ? 'Hide password' : 'Show password');

    const eye = btn.querySelector('.eye-icon');
    const eyeOff = btn.querySelector('.eye-off-icon');

    if (eye && eyeOff) {
      if (willBeVisible) {
        eye.style.setProperty('display', 'none', 'important');
        eyeOff.style.setProperty('display', 'block', 'important');
        btn.classList.add('active');
      } else {
        eye.style.setProperty('display', 'block', 'important');
        eyeOff.style.setProperty('display', 'none', 'important');
        btn.classList.remove('active');
      }
    }
  }

  try {
    input.focus({ preventScroll: true });
  } catch (_) {}
}

// Attach window global
window.togglePasswordVisibility = togglePasswordVisibility;

// Single delegated click listener
document.addEventListener('click', function (e) {
  const btn = e.target && e.target.closest ? e.target.closest('.password-toggle-btn') : null;
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const targetId = btn.getAttribute('data-target');
  if (targetId) {
    togglePasswordVisibility(targetId, btn);
  }
});
