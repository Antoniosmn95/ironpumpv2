// logout.js
// Wires any sign-out triggers on the page to AuthGuard.signOut()

// Utility: small delay
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function doSignOut(e) {
  e?.preventDefault?.();

  // Close dropdown if present
  const menu = document.getElementById('userMenu');
  if (menu) menu.classList.add('hidden');

  // Try AuthGuard (preferred)
  if (window.AuthGuard?.signOut) {
    try {
      await window.AuthGuard.signOut(); // this will redirect to login.html
      return;
    } catch (err) {
      console.error('[logout] AuthGuard.signOut failed:', err);
    }
  }

  // Fallback: modular direct sign-out (in case page didn’t load auth-guard.js)
  try {
    const { app } = await import('./firebase-init.js');
    const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js');
    const auth = getAuth(app);
    await signOut(auth);
    // Hard redirect as a safety
    location.replace('login.html');
  } catch (err) {
    console.error('[logout] fallback signOut failed:', err);
    alert('Sign out failed. Please refresh and try again.');
  }
}

function wire(selector) {
  document.querySelectorAll(selector).forEach(el => {
    // Avoid double-binding
    if (el.__wiredSignOut) return;
    el.__wiredSignOut = true;
    el.addEventListener('click', doSignOut);
  });
}

async function init() {
  // Wait a tick for DOM + any menus
  if (document.readyState === 'loading') {
    await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
  } else {
    await sleep(0);
  }

  // Support several selectors out of the box:
  wire('#menuSignOut');                  // your dropdown button
  wire('[data-action="signout"]');       // generic data attribute
  wire('.js-signout');                   // generic class hook
  wire('#signOut');                      // common id
}

init();
