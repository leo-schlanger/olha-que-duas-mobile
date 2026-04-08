import { Linking } from 'react-native';
import { logger } from './logger';

const ALLOWED_PROTOCOLS = ['https:', 'http:', 'mailto:'];

/**
 * Opens a URL only if it uses an allowed protocol (https, http, mailto).
 * Prevents opening dangerous protocols like javascript:// or file://
 */
export async function safeOpenUrl(url: string): Promise<void> {
  try {
    const parsed = new URL(url);
    if (ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      await Linking.openURL(url);
    } else {
      logger.warn('Blocked URL with disallowed protocol:', url);
    }
  } catch {
    logger.warn('Invalid URL:', url);
  }
}
