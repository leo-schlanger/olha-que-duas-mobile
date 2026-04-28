/**
 * Logger utility - Only logs in development mode
 * Prevents console output in production builds
 */

export const logger = {
  log: (...args: unknown[]) => {
    if (__DEV__) console.log(...args); // eslint-disable-line no-console
  },
  warn: (...args: unknown[]) => {
    if (__DEV__) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (__DEV__) console.error(...args);
  },
};
