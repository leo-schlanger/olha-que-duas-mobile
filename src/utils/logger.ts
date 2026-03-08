/**
 * Logger utility - Only logs in development mode
 * Prevents console output in production builds
 */

type LogLevel = 'log' | 'warn' | 'error';

function createLogger(level: LogLevel) {
  return (...args: unknown[]) => {
    if (__DEV__) {
      console[level](...args);
    }
  };
}

export const logger = {
  log: createLogger('log'),
  warn: createLogger('warn'),
  error: createLogger('error'),
};
