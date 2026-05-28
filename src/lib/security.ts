/**
 * Security utilities for production environment
 */

const isProduction = process.env.NODE_ENV === 'production';

export const initSecurity = () => {
  if (typeof window === 'undefined' || !isProduction) {
    return;
  }

  // Clear console on load
  console.clear();

  // Disable right-click context menu (makes it slightly harder to inspect)
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });

  // Detect and warn about DevTools (doesn't prevent, just makes it harder)
  const detectDevTools = () => {
    const threshold = 160;
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;
    
    if (widthThreshold || heightThreshold) {
      // DevTools likely open - clear console
      console.clear();
    }
  };

  // Check periodically
  setInterval(detectDevTools, 1000);

  // Disable common keyboard shortcuts for DevTools
  document.addEventListener('keydown', (e) => {
    // F12
    if (e.key === 'F12') {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+I (Inspect)
    if (e.ctrlKey && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+J (Console)
    if (e.ctrlKey && e.shiftKey && e.key === 'J') {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+C (Inspect Element)
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      return false;
    }
    // Ctrl+U (View Source)
    if (e.ctrlKey && e.key === 'u') {
      e.preventDefault();
      return false;
    }
    // Cmd+Option+I (Mac)
    if (e.metaKey && e.altKey && e.key === 'i') {
      e.preventDefault();
      return false;
    }
    // Cmd+Option+J (Mac)
    if (e.metaKey && e.altKey && e.key === 'j') {
      e.preventDefault();
      return false;
    }
    // Cmd+Option+C (Mac)
    if (e.metaKey && e.altKey && e.key === 'c') {
      e.preventDefault();
      return false;
    }
  });
};


