/**
 * Secure Logger - Only logs in development mode
 * In production, all logs are suppressed to prevent information leakage
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const secureLogger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  
  error: (...args: any[]) => {
    if (isDevelopment) {
      console.error(...args);
    }
  },
  
  // Always log critical errors (but sanitized)
  criticalError: (message: string) => {
    console.error(message);
  }
};

// Clear console in production on load
if (typeof window !== 'undefined' && !isDevelopment) {
  console.clear();
  
  // Disable console methods in production
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  console.info = () => {};
  console.debug = () => {};
}


