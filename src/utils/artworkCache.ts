/**
 * Artwork pre-download cache.
 *
 * Pre-downloads album artwork to local storage so the lock-screen notification
 * always gets a file:// URI (loaded in <10ms by the native side).
 *
 * Two directories:
 * - `olhaqueduas-covers/` — stable cache keyed by FNV-1a hash of remote URL
 * - `olhaqueduas-lockscreen/` — rotating pool of unique-name copies for the
 *   lock screen, bypassing expo-audio's java.net.URL.equals() bug
 */

import { Directory, File, Paths } from 'expo-file-system';
import { logger } from './logger';
import { TIMING } from '../config/constants';

const COVERS_DIR_NAME = 'olhaqueduas-covers';
const MAX_CACHE_FILES = 25;
const PRUNE_EVERY_N_DOWNLOADS = 10;

let coversDir: Directory | null = null;
let downloadCount = 0;
const pendingDownloads = new Map<string, Promise<string | null>>();

/** FNV-1a 32-bit hash. Deterministic, dependency-free. */
function hashUrl(url: string): string {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function ensureDir(): Directory {
  if (coversDir) return coversDir;
  const dir = new Directory(Paths.cache, COVERS_DIR_NAME);
  if (!dir.exists) {
    try {
      dir.create({ idempotent: true, intermediates: true });
    } catch (err) {
      logger.error('artworkCache: failed to create dir', err);
    }
  }
  coversDir = dir;
  return dir;
}

function inferExtension(url: string): string {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.png')) return 'png';
  if (path.endsWith('.webp')) return 'webp';
  if (path.endsWith('.gif')) return 'gif';
  if (path.endsWith('.jpeg') || path.endsWith('.jpg')) return 'jpg';
  return 'jpg';
}

/**
 * Returns a `file://` URI for the artwork at `remoteUrl`, downloading it
 * first if not yet cached. Returns `null` only if the URL is invalid or
 * the download fails.
 *
 * Concurrent calls for the same URL are coalesced into a single download.
 */
export async function getLocalArtwork(remoteUrl: string): Promise<string | null> {
  if (!remoteUrl || (!remoteUrl.startsWith('http://') && !remoteUrl.startsWith('https://'))) {
    return null;
  }

  const dir = ensureDir();
  const filename = `${hashUrl(remoteUrl)}.${inferExtension(remoteUrl)}`;
  const file = new File(dir, filename);

  if (file.exists) {
    try {
      if ((file.size ?? 0) > 0) return file.uri;
      file.delete();
    } catch {
      // treat as cache miss
    }
  }

  const inFlight = pendingDownloads.get(remoteUrl);
  if (inFlight) return inFlight;

  const promise: Promise<string | null> = (async () => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('artwork download timeout')),
          TIMING.ARTWORK_DOWNLOAD_TIMEOUT
        );
      });
      const downloaded = await Promise.race([
        File.downloadFileAsync(remoteUrl, file),
        timeoutPromise,
      ]);
      downloadCount++;
      if (downloadCount % PRUNE_EVERY_N_DOWNLOADS === 0) {
        pruneCache().catch((err) => logger.warn('artworkCache: prune failed', err));
      }
      return downloaded.uri;
    } catch (err) {
      try {
        if (file.exists) file.delete();
      } catch {
        // ignore
      }
      logger.warn('artworkCache: download failed for', remoteUrl, err);
      return null;
    } finally {
      pendingDownloads.delete(remoteUrl);
    }
  })();

  pendingDownloads.set(remoteUrl, promise);
  return promise;
}

/**
 * Synchronous lookup: returns the cached file URI if present, else null.
 */
export function getCachedArtwork(remoteUrl: string): string | null {
  if (!remoteUrl || (!remoteUrl.startsWith('http://') && !remoteUrl.startsWith('https://'))) {
    return null;
  }
  try {
    const filename = `${hashUrl(remoteUrl)}.${inferExtension(remoteUrl)}`;
    const file = new File(ensureDir(), filename);
    return file.exists && (file.size ?? 0) > 0 ? file.uri : null;
  } catch {
    return null;
  }
}

// Cached logo URI — populated by `prefetchLogo()` at app boot.
let cachedLogoUri: string | null = null;

/**
 * Pre-downloads the radio logo to local storage. Call once at app boot.
 */
export async function prefetchLogo(remoteLogoUrl: string): Promise<void> {
  const local = await getLocalArtwork(remoteLogoUrl);
  if (local) {
    cachedLogoUri = local;
  }
}

/**
 * Returns the cached file:// URI for the radio logo if `prefetchLogo`
 * has run, else returns the remote URL as fallback. Synchronous.
 */
export function getLogoUri(remoteLogoUrl: string): string {
  return cachedLogoUri ?? remoteLogoUrl;
}

// --- Lock screen artwork with unique file paths (FILE POOL) ---
//
// expo-audio ships a pre-compiled AAR where loadArtworkFromUrl compares
// URLs with java.net.URL.equals() (ignores fragments). We CANNOT patch
// the compiled code. Instead, we copy the artwork to a file with a unique
// name each time, so the native side always sees a genuinely new URL.
//
// FILE POOL FIX: We keep the last POOL_SIZE files instead of deleting
// the previous one immediately. This prevents the race condition where
// the native thread (low priority in background) is still reading the
// file when the next update deletes it.

const LOCKSCREEN_DIR_NAME = 'olhaqueduas-lockscreen';
const LOCK_POOL_SIZE = 3;
let lockScreenDir: Directory | null = null;
let lockScreenPool: File[] = [];

function ensureLockScreenDir(): Directory {
  if (lockScreenDir) return lockScreenDir;
  const dir = new Directory(Paths.cache, LOCKSCREEN_DIR_NAME);
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  lockScreenDir = dir;
  return dir;
}

/**
 * Copies the given artwork file to a unique path for the lock screen.
 * Each call produces a different file:// URI, forcing the native
 * loadArtworkFromUrl to always download the bitmap (URL.equals()
 * compares file paths and they're always different).
 *
 * Maintains a pool of LOCK_POOL_SIZE files — older files are only deleted
 * when the pool is full, giving the native thread time to finish reading
 * the previous file even in background (where it runs at low priority).
 */
export function getLockScreenArtUri(sourceUri: string): string {
  try {
    const dir = ensureLockScreenDir();

    // Prune oldest files when pool is full
    while (lockScreenPool.length >= LOCK_POOL_SIZE) {
      const oldest = lockScreenPool.shift();
      if (oldest) {
        try {
          if (oldest.exists) oldest.delete();
        } catch {
          // best effort
        }
      }
    }

    // Determine source file path from URI
    const sourcePath = sourceUri.replace(/^file:\/\//, '');
    const ext = sourcePath.split('.').pop() || 'jpg';
    const destName = `art-${Date.now()}.${ext}`;
    const destFile = new File(dir, destName);

    // Copy source to unique destination
    const srcFile = new File(sourcePath);
    if (srcFile.exists && (srcFile.size ?? 0) > 0) {
      srcFile.copy(destFile);
      lockScreenPool.push(destFile);
      return destFile.uri;
    }
  } catch {
    // Fall through to return original URI
  }
  return sourceUri;
}

/**
 * Prunes the artwork cache to the most recent MAX_CACHE_FILES files.
 */
async function pruneCache(): Promise<void> {
  const dir = ensureDir();
  if (!dir.exists) return;

  const entries = dir.list();
  const files = entries.filter((e): e is File => e instanceof File);
  if (files.length <= MAX_CACHE_FILES) return;

  const withMtime = files.map((file) => {
    let mtime = 0;
    try {
      mtime = file.info().modificationTime ?? 0;
    } catch {
      // treat as oldest
    }
    return { file, mtime };
  });
  withMtime.sort((a, b) => a.mtime - b.mtime);

  const toDelete = withMtime.slice(0, withMtime.length - MAX_CACHE_FILES);
  for (const { file } of toDelete) {
    try {
      file.delete();
    } catch {
      // best effort
    }
  }
}
