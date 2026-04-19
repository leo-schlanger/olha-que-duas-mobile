/**
 * Artwork pre-download cache.
 *
 * The lock-screen / media-notification on Android (expo-audio's
 * AudioControlsService) downloads artwork via `URL.openConnection()` from
 * whatever URL we pass to `setActiveForLockScreen()` /
 * `updateLockScreenMetadata()`. That fetch happens on every metadata
 * change AND has no cache — same URL → fetched again. In background, on
 * cellular, or with battery saver, that fetch can take 200ms-2s or fail
 * silently leaving the user looking at the previous song's cover.
 *
 * This module pre-downloads the artwork to a stable local file the moment
 * the now-playing service learns about it (via SSE). When we then call
 * `updateLockScreenMetadata({ artworkUrl: localUri })`, the native side
 * loads from disk in <10ms — no network round-trip, works in background
 * regardless of throttling.
 *
 * Cache lives in `Paths.cache/olhaqueduas-covers`. Filenames are an FNV-1a
 * hash of the remote URL so the same artwork is reused across replays of
 * the same song. The cache is pruned to the most recent N files to bound
 * disk usage.
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
  // Strip query string before checking extension — AzuraCast sometimes
  // appends `?timestamp` which would break a naive endsWith match.
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.png')) return 'png';
  if (path.endsWith('.webp')) return 'webp';
  if (path.endsWith('.gif')) return 'gif';
  if (path.endsWith('.jpeg') || path.endsWith('.jpg')) return 'jpg';
  return 'jpg'; // sensible default for album art
}

/**
 * Returns a `file://` URI for the artwork at `remoteUrl`, downloading it
 * first if not yet cached. Returns `null` only if the URL is invalid or
 * the download fails — callers should fall back to the remote URL in that
 * case so the lock screen still shows *something*.
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
    // Guard against truncated/corrupted files from partial downloads.
    // A zero-byte file would cause BitmapFactory.decodeStream to return
    // null on the native side, leaving the lock screen with no artwork.
    try {
      if ((file.size ?? 0) > 0) return file.uri;
      file.delete();
    } catch {
      // ignore — treat as cache miss
    }
  }

  const inFlight = pendingDownloads.get(remoteUrl);
  if (inFlight) return inFlight;

  const promise: Promise<string | null> = (async () => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('artwork download timeout')), TIMING.ARTWORK_DOWNLOAD_TIMEOUT);
      });
      const downloaded = await Promise.race([
        File.downloadFileAsync(remoteUrl, file),
        timeoutPromise,
      ]);
      downloadCount++;
      if (downloadCount % PRUNE_EVERY_N_DOWNLOADS === 0) {
        // Don't await — pruning is a background maintenance task.
        pruneCache().catch((err) => logger.warn('artworkCache: prune failed', err));
      }
      return downloaded.uri;
    } catch (err) {
      // Clean up partial download to avoid corrupted cache entries
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
 * Used when we want to update the lock screen *immediately* with whatever
 * we have cached and not block on a download.
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

// Cached logo URI — populated by `prefetchLogo()` at app boot. Used as the
// lock-screen artwork fallback so we NEVER pass a remote URL to expo-audio
// (which would make the native side block on `URL.openConnection()` with no
// timeout — confirmed source of multi-second delays in background).
let cachedLogoUri: string | null = null;

/**
 * Pre-downloads the radio logo to local storage. Call once at app boot.
 * The result is exposed via `getLogoUri()` so consumers can synchronously
 * fall back to a file:// URI for the logo instead of using the remote URL.
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

/**
 * Prunes the artwork cache to the most recent MAX_CACHE_FILES files,
 * deleting the oldest by modification time. Called periodically from
 * `getLocalArtwork()` so we don't grow unbounded.
 */
async function pruneCache(): Promise<void> {
  const dir = ensureDir();
  if (!dir.exists) return;

  const entries = dir.list();
  const files = entries.filter((e): e is File => e instanceof File);
  if (files.length <= MAX_CACHE_FILES) return;

  // Sort oldest-first by modificationTime; mtime is in seconds since epoch.
  const withMtime = files.map((file) => {
    let mtime = 0;
    try {
      mtime = file.info().modificationTime ?? 0;
    } catch {
      // ignore — treat as oldest so it's eligible for deletion
    }
    return { file, mtime };
  });
  withMtime.sort((a, b) => a.mtime - b.mtime);

  const toDelete = withMtime.slice(0, withMtime.length - MAX_CACHE_FILES);
  for (const { file } of toDelete) {
    try {
      file.delete();
    } catch {
      // ignore — best effort
    }
  }
}
