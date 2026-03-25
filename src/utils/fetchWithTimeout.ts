/**
 * Fetch com timeout e AbortController
 * Previne requests que ficam pendurados indefinidamente
 */

import { TIMING } from '../config/constants';

export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number;
}

export class FetchTimeoutError extends Error {
  constructor(message = 'Request timeout') {
    super(message);
    this.name = 'FetchTimeoutError';
  }
}

/**
 * Fetch com suporte a timeout
 * @param url URL para fazer o request
 * @param options Opções do fetch + timeout opcional
 * @returns Promise com a Response
 * @throws FetchTimeoutError se o timeout for atingido
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = TIMING.FETCH_TIMEOUT, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FetchTimeoutError(`Request to ${url} timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Cria um AbortController com timeout automático
 * Útil para gerenciar múltiplos requests ou cancelamento manual
 */
export function createAbortControllerWithTimeout(timeout = TIMING.FETCH_TIMEOUT): {
  controller: AbortController;
  clear: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return {
    controller,
    clear: () => clearTimeout(timeoutId),
  };
}
