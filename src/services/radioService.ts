import { setAudioModeAsync, AudioPlayer, createAudioPlayer } from 'expo-audio';
import { AppState, AppStateStatus } from 'react-native';
import { siteConfig } from '../config/site';
import { radioSettingsService, RadioSettings } from './radioSettingsService';
import { nowPlayingService } from './nowPlayingService';
import { getLogoUri } from '../utils/artworkCache';
import { logger } from '../utils/logger';
import { TIMING, LIMITS } from '../config/constants';

/**
 * Radio streaming service using expo-audio (2026)
 * Supports background playback and lock screen controls
 */
class RadioService {
  private player: AudioPlayer | null = null;
  private playerSubscription: { remove: () => void } | null = null;
  private isInitialized: boolean = false;
  private isPlaying: boolean = false;
  private volume: number = 1.0;
  private onStatusChange: ((_status: RadioStatus) => void) | null = null;
  private isIntentionallyStopped: boolean = true;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private settings: RadioSettings | null = null;
  private settingsUnsubscribe: (() => void) | null = null;
  private nowPlayingUnsubscribe: (() => void) | null = null;
  private isBuffering: boolean = false;
  private isPlayInProgress: boolean = false;
  private statusPollingInterval: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private lastAppState: AppStateStatus = 'active';
  private lockScreenTimeout: ReturnType<typeof setTimeout> | null = null;
  // Timestamp em ms quando começou a estar em buffering. Usado para detectar
  // streams "stalled" — quando o player fica preso a fazer buffer mas o áudio
  // não avança. Reset a 0 quando volta a tocar normalmente.
  private bufferingStartedAt: number = 0;
  // Cache do último metadata enviado para o lock screen. Evita chamadas
  // redundantes ao caminho nativo.
  private lastLockScreenMetaKey: string = '';
  // Timestamp da última transição para background. Usado para criar uma
  // "grace window" durante a qual ignoramos detecção de pause externo —
  // o player nativo pode reportar playing=false brevemente durante a
  // transição do Activity lifecycle, e sem esta protecção o código
  // interpreta como pause intencional e pára tudo.
  private backgroundTransitionAt: number = 0;

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private clearLockScreenTimeout() {
    if (this.lockScreenTimeout) {
      clearTimeout(this.lockScreenTimeout);
      this.lockScreenTimeout = null;
    }
  }

  private removePlayerListener() {
    if (this.playerSubscription) {
      this.playerSubscription.remove();
      this.playerSubscription = null;
    }
  }

  /**
   * Actualiza o lock screen apenas se o metadata mudou desde a última vez.
   *
   * Usa SEMPRE `setActiveForLockScreen(true, meta)` que no lado nativo
   * chama `setPlayerOptions()`. Quando o player já é o currentPlayer,
   * este método faz update leve (sem recriar MediaSession) E chama
   * `postOrStartForegroundNotification()` incondicionalmente — o que
   * garante que título, artista E artwork actualizam sempre.
   *
   * O antigo caminho `updateLockScreenMetadata()` usava
   * `updateMetadataInternal()` que delegava o rebuild da notificação ao
   * callback de `loadArtworkFromUrl()`. Esse callback não disparava quando
   * `java.net.URL.equals()` considerava as URLs iguais (ignora fragments),
   * deixando a notificação congelada.
   */
  private updateLockScreen(meta: { title: string; artist: string; artworkUrl: string }) {
    if (!this.player || this.isIntentionallyStopped) return;
    const artKeyBase = meta.artworkUrl.split('#')[0];
    const key = `${meta.title}\x00${meta.artist}\x00${artKeyBase}`;
    if (key === this.lastLockScreenMetaKey) return;
    try {
      this.player.setActiveForLockScreen(true, meta);
      this.lastLockScreenMetaKey = key;
    } catch (error) {
      logger.error('Error updating lock screen:', error);
    }
  }

  private resetLockScreenCache() {
    this.lastLockScreenMetaKey = '';
  }

  private stopStatusPolling() {
    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval);
      this.statusPollingInterval = null;
    }
  }

  private startStatusPolling() {
    this.stopStatusPolling();
    this.statusPollingInterval = setInterval(() => {
      this.pollPlayerStatus();
    }, TIMING.RADIO_STATUS_POLL_INTERVAL);
  }

  private pollPlayerStatus() {
    if (!this.player) return;

    try {
      const playerPlaying = this.player.playing ?? false;
      const playerBuffering = this.player.isBuffering ?? false;
      const wasPlaying = this.isPlaying;
      const wasBuffering = this.isBuffering;

      // Detect external resume (e.g., user pressed play on lock screen)
      // Player is playing but we think it's intentionally stopped
      if (this.isIntentionallyStopped && playerPlaying) {
        logger.log('Polling: External resume detected (lock screen play)');
        this.isIntentionallyStopped = false;
        this.isPlaying = true;
        this.isBuffering = playerBuffering;
        this.bufferingStartedAt = 0;
        this.subscribeToNowPlaying();
        this.emitStatus(false);
        return;
      }

      // Don't process further if intentionally stopped
      if (this.isIntentionallyStopped) return;

      // Detect external pause (e.g., from lock screen controls).
      // Suppress in background — reconcile on foreground return.
      if (wasPlaying && !playerPlaying && !playerBuffering) {
        const appInBackground = AppState.currentState !== 'active';
        const inGracePeriod = Date.now() - this.backgroundTransitionAt < TIMING.RADIO_BG_GRACE_PERIOD;
        if (appInBackground || inGracePeriod) {
          logger.log('Polling: Ignoring pause (app not active or grace period)');
          return;
        }
        logger.log('Polling: External pause detected');
        this.isIntentionallyStopped = true;
        this.isPlaying = false;
        this.isBuffering = false;
        this.bufferingStartedAt = 0;
        this.unsubscribeFromNowPlaying();
        this.emitStatus(false);
        return;
      }

      this.isPlaying = playerPlaying;
      this.isBuffering = playerBuffering;

      // Stall detection: se ficamos presos a fazer buffer durante demasiado
      // tempo, o stream provavelmente caiu silenciosamente. Forçar reconnect
      // em vez de deixar o utilizador a ver um spinner para sempre.
      if (playerBuffering && !playerPlaying) {
        if (this.bufferingStartedAt === 0) {
          this.bufferingStartedAt = Date.now();
        } else if (
          Date.now() - this.bufferingStartedAt > TIMING.RADIO_STALL_TIMEOUT &&
          this.settings?.autoReconnect
        ) {
          logger.warn('Stream stalled in buffering, triggering reconnect');
          this.bufferingStartedAt = 0;
          this.reconnect();
          return;
        }
      } else if (playerPlaying) {
        // Voltámos a tocar, limpar timer de stall
        this.bufferingStartedAt = 0;
      }

      const isLoading = !this.isPlaying && !this.isIntentionallyStopped;

      if (wasPlaying !== this.isPlaying || wasBuffering !== this.isBuffering) {
        // logger.log removido — disparava a cada mudança de estado e era
        // ruído que enchia o console em playback normal.
        this.emitStatus(isLoading);
      }
    } catch (error) {
      logger.error('Error polling player status:', error);
    }
  }

  async initialize(preloadedSettings?: RadioSettings) {
    if (this.isInitialized) {
      return;
    }

    try {
      // Use preloaded settings or load fresh
      this.settings = preloadedSettings ?? (await radioSettingsService.load());
      this.volume = this.settings.volume;

      // Subscribe to settings changes
      this.settingsUnsubscribe = radioSettingsService.subscribe((newSettings) => {
        this.handleSettingsChange(newSettings);
      });

      // Configure audio mode for background playback
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: this.settings.backgroundPlayback,
        interruptionMode: 'doNotMix',
      });

      // Setup AppState listener for app lifecycle events
      this.setupAppStateListener();

      this.isInitialized = true;
      logger.log('RadioService initialized with expo-audio');

      // Auto-play if enabled
      if (this.settings.autoPlayOnStart) {
        setTimeout(() => this.play(), TIMING.RADIO_AUTOPLAY_DELAY);
      }
    } catch (error) {
      logger.error('Error initializing RadioService:', error);
      // Leave isInitialized = false so init can be retried on next play()
    }
  }

  private setupAppStateListener(): void {
    this.lastAppState = AppState.currentState;
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus): Promise<void> => {
    logger.log('AppState changed:', this.lastAppState, '->', nextAppState);

    // App coming back to active from background/inactive
    if (this.lastAppState.match(/inactive|background/) && nextAppState === 'active') {
      this.backgroundTransitionAt = 0; // clear grace period

      if (this.player && !this.isIntentionallyStopped) {
        // Reconcile state: check if player was paused externally while in
        // background (we suppress external-pause detection in BG to avoid
        // false positives from Activity lifecycle transients).
        const playerPlaying = this.player.playing ?? false;
        if (!playerPlaying) {
          logger.log('Player paused during background, marking as stopped');
          this.isIntentionallyStopped = true;
          this.isPlaying = false;
          this.isBuffering = false;
          this.unsubscribeFromNowPlaying();
          this.emitStatus(false);
        }
      }

      // Ensure polling is running at foreground cadence
      if (this.player && !this.statusPollingInterval) {
        this.startStatusPolling();
      }
    }

    // App going to background — polling stays alive. The foreground media
    // service keeps the JS context running and the overhead of a status
    // poll (two native bridge reads) is negligible next to the audio
    // stream. Keeping it alive guarantees stall detection, auto-reconnect,
    // and lock screen play/pause detection all work in background.
    if (nextAppState === 'background') {
      // Mark the transition so external-pause detection is suppressed
      // during the grace window (the native player may briefly report
      // playing=false during the Activity lifecycle change).
      this.backgroundTransitionAt = Date.now();

      // If stopOnClose is enabled, stop the radio when app goes to background
      // This must be fast and synchronous-like because the process may be killed
      if (this.settings?.stopOnClose && this.isPlaying) {
        logger.log('Stopping radio due to stopOnClose setting');
        // Deactivate lock screen immediately before stop() in case process is killed
        if (this.player) {
          try {
            this.player.setActiveForLockScreen(false);
          } catch {
            // Ignore - best effort
          }
        }
        await this.stop();
      }
    }

    this.lastAppState = nextAppState;
  };

  private async handleSettingsChange(newSettings: RadioSettings) {
    const oldSettings = this.settings;
    this.settings = newSettings;

    // Update volume in real-time
    if (oldSettings?.volume !== newSettings.volume) {
      this.volume = newSettings.volume;
      if (this.player) {
        this.player.volume = this.volume;
      }
    }

    // Update background playback mode in real-time
    if (oldSettings?.backgroundPlayback !== newSettings.backgroundPlayback) {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: newSettings.backgroundPlayback,
          interruptionMode: 'doNotMix',
        });
        logger.log('Background playback updated:', newSettings.backgroundPlayback);
      } catch (error) {
        logger.error('Error updating audio mode:', error);
      }
    }
  }

  setStatusCallback(callback: (_status: RadioStatus) => void) {
    this.onStatusChange = callback;
  }

  private emitStatus(isLoading: boolean = false) {
    if (this.onStatusChange) {
      this.onStatusChange({
        isPlaying: this.isPlaying,
        volume: this.volume,
        isLoading: isLoading,
        isReconnecting: this.reconnectAttempts > 0,
        reconnectAttempt: this.reconnectAttempts,
      });
    }
  }

  async play(): Promise<boolean> {
    // Guard against concurrent play() calls
    if (this.isPlayInProgress) {
      logger.log('Play already in progress, ignoring');
      return false;
    }
    this.isPlayInProgress = true;

    try {
      this.isIntentionallyStopped = false;
      this.bufferingStartedAt = 0;
      this.clearReconnectTimeout();
      this.clearLockScreenTimeout();
      this.stopStatusPolling();
      this.emitStatus(true);

      if (!this.isInitialized) {
        await this.initialize();
      }

      // FAST PATH — reusar o player existente. Acontece quando o utilizador
      // faz pause→play: a connection HTTP/ICY do stream pode ainda estar
      // alive e o ExoPlayer/AVPlayer reanuncia em <100ms, em vez dos 1-3s
      // do recreate completo (TCP handshake + prebuffer + decoder warmup).
      if (this.player) {
        try {
          this.player.play();
          this.subscribeToNowPlaying();
          this.startStatusPolling();
          this.reconnectAttempts = 0;
          this.emitStatus(true);
          logger.log('Radio stream resumed (player reused)');
          return true;
        } catch (resumeError) {
          // Se o player nativo morreu silenciosamente durante o pause
          // (ex.: process killed and restored sem JS context), cai no slow
          // path e recriamos o player do zero.
          logger.warn('Resume failed, falling back to recreate:', resumeError);
          this.removePlayerListener();
          try {
            this.player.release();
          } catch {
            // ignore
          }
          this.player = null;
          this.resetLockScreenCache();
        }
      }

      // SLOW PATH — primeiro play, ou recreate após resume falhar.
      logger.log('Creating audio player for:', siteConfig.radio.streamUrl);

      this.player = createAudioPlayer({ uri: siteConfig.radio.streamUrl });
      this.player.volume = this.volume;

      // Subscribe to status updates
      this.playerSubscription = this.player.addListener('playbackStatusUpdate', (status) => {
        this.handlePlaybackStatus(status);
      });

      // Start playback first
      this.player.play();

      // Enable lock screen controls after playback starts (avoid blocking).
      // Use the pre-cached file:// logo URI — never the remote URL, which
      // would block the native side on a slow openConnection() fetch.
      this.lockScreenTimeout = setTimeout(() => {
        this.lockScreenTimeout = null;
        this.updateLockScreen({
          title: siteConfig.radio.name,
          artist: siteConfig.radio.tagline,
          artworkUrl: getLogoUri(siteConfig.radio.logoUrl),
        });
      }, TIMING.RADIO_LOCK_SCREEN_DELAY);

      // Subscribe to now-playing updates for lock screen metadata
      // Always unsubscribe first to prevent duplicate listeners on reconnect
      this.unsubscribeFromNowPlaying();
      this.subscribeToNowPlaying();

      // Start polling as fallback for playbackStatusUpdate (which may not fire for live streams)
      this.startStatusPolling();

      // Don't set isPlaying = true here - wait for playbackStatusUpdate callback
      // or polling to confirm playback has actually started
      this.reconnectAttempts = 0;
      this.emitStatus(true); // Keep showing loading until confirmed

      logger.log('Radio stream starting...');
      return true;
    } catch (error) {
      logger.error('Error playing radio:', error);
      this.isPlaying = false;
      this.emitStatus(false);

      if (!this.isIntentionallyStopped && this.settings?.autoReconnect) {
        this.reconnect();
      }
      return false;
    } finally {
      this.isPlayInProgress = false;
    }
  }

  private handlePlaybackStatus(status: {
    error?: string;
    isLoaded?: boolean;
    isPlaying?: boolean;
    isBuffering?: boolean;
    playing?: boolean;
    buffering?: boolean;
  }) {
    // Ignore status updates if intentionally stopped (prevents race conditions)
    if (this.isIntentionallyStopped) {
      return;
    }

    if (status.error) {
      logger.error('Playback error:', status.error);
      this.isPlaying = false;
      this.isBuffering = false;
      this.bufferingStartedAt = 0;
      this.emitStatus(false);

      if (!this.isIntentionallyStopped && this.settings?.autoReconnect) {
        this.reconnect();
      }
      return;
    }

    const wasPlaying = this.isPlaying;
    const wasBuffering = this.isBuffering;

    // expo-audio reports playing status
    const newIsPlaying = status.isPlaying ?? status.playing ?? false;
    const newIsBuffering = status.isBuffering ?? status.buffering ?? false;

    // Detect external pause (e.g., from lock screen controls).
    // Suppress detection when the app is NOT in foreground — the native
    // player may transiently report playing=false during the Activity
    // lifecycle change. We reconcile the real state when the app returns
    // to foreground (see handleAppStateChange).
    if (wasPlaying && !newIsPlaying && !newIsBuffering) {
      const appInBackground = AppState.currentState !== 'active';
      const inGracePeriod = Date.now() - this.backgroundTransitionAt < TIMING.RADIO_BG_GRACE_PERIOD;
      if (appInBackground || inGracePeriod) {
        logger.log('Ignoring transient pause (app not active or grace period)');
        return;
      }
      logger.log('External pause detected (lock screen or system)');
      this.isIntentionallyStopped = true;
      this.isPlaying = false;
      this.isBuffering = false;
      this.bufferingStartedAt = 0;
      this.unsubscribeFromNowPlaying();
      this.emitStatus(false);
      return;
    }

    this.isPlaying = newIsPlaying;
    this.isBuffering = newIsBuffering;
    if (newIsPlaying) {
      // Voltámos a tocar — limpa o timer de stall do polling
      this.bufferingStartedAt = 0;
    }

    // Loading is finished when playback has started
    // We consider it playing if isPlaying is true, regardless of buffering
    const isLoading = !this.isPlaying && !this.isIntentionallyStopped;

    if (wasPlaying !== this.isPlaying || wasBuffering !== this.isBuffering) {
      // logger.log removido — disparava em todo o playbackStatusUpdate
      // (até 2x/segundo a default 500ms) e enchia o console.
      this.emitStatus(isLoading);
    }
  }

  private subscribeToNowPlaying() {
    if (this.nowPlayingUnsubscribe) {
      this.nowPlayingUnsubscribe();
    }

    // Start the now playing service polling
    nowPlayingService.start();

    this.nowPlayingUnsubscribe = nowPlayingService.subscribe((data) => {
      // Verificar se ainda estamos tocando antes de atualizar lock screen
      if (!this.player || this.isIntentionallyStopped) return;

      // Pass file:// URIs when available (loads in <10ms from disk).
      // When localArtUri isn't cached yet, use the fallback logo with a
      // fragment cache-buster (#timestamp) so the native loadArtworkFromUrl
      // always processes it as a "new" URL — it compares url != currentArtworkUrl,
      // and without the fragment the same logo URL would be skipped entirely
      // (no download, no notification rebuild, metadata stays stale).
      // The fragment is ignored by file:// I/O but makes URL comparison unique.
      const fallbackLogo = getLogoUri(siteConfig.radio.logoUrl);
      const pickArt = (): string => data.localArtUri || `${fallbackLogo}#${Date.now()}`;

      switch (data.mode) {
        case 'music':
          if (data.song) {
            this.updateLockScreen({
              title: data.song.title,
              artist: data.song.artist,
              artworkUrl: pickArt(),
            });
            return;
          }
          break;
        case 'liveShow':
          this.updateLockScreen({
            title: data.liveShowName || siteConfig.radio.name,
            artist: siteConfig.radio.name,
            artworkUrl: `${fallbackLogo}#${Date.now()}`,
          });
          return;
        case 'podcast':
          this.updateLockScreen({
            title: data.podcastName,
            artist: siteConfig.radio.name,
            artworkUrl: pickArt(),
          });
          return;
        case 'announcement':
          this.updateLockScreen({
            title: data.announcementName,
            artist: siteConfig.radio.name,
            artworkUrl: pickArt(),
          });
          return;
      }

      // Idle (or music with missing song object) — fall back to radio identity.
      this.updateLockScreen({
        title: siteConfig.radio.name,
        artist: siteConfig.radio.tagline,
        artworkUrl: `${fallbackLogo}#${Date.now()}`,
      });
    });
  }

  private unsubscribeFromNowPlaying() {
    if (this.nowPlayingUnsubscribe) {
      this.nowPlayingUnsubscribe();
      this.nowPlayingUnsubscribe = null;
    }
    nowPlayingService.stop();
  }

  private reconnect() {
    if (this.isIntentionallyStopped) return;
    if (this.reconnectAttempts >= LIMITS.MAX_RECONNECT_ATTEMPTS) {
      logger.log('Max reconnect attempts reached, giving up');
      // Reset state so user can try again manually
      this.reconnectAttempts = 0;
      this.isPlaying = false;
      this.isBuffering = false;
      this.bufferingStartedAt = 0;
      this.isIntentionallyStopped = true;
      this.stopStatusPolling();
      this.unsubscribeFromNowPlaying();
      this.emitStatus(false);
      return;
    }

    this.clearReconnectTimeout();

    const delay = Math.min(
      TIMING.RADIO_RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      TIMING.RADIO_MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts++;

    logger.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.emitStatus(true);

    this.reconnectTimeout = setTimeout(() => {
      if (!this.isIntentionallyStopped) {
        this.play();
      }
    }, delay);
  }

  async pause(): Promise<void> {
    // Set flag FIRST to prevent any polling/callbacks from restarting
    this.isIntentionallyStopped = true;
    this.isPlaying = false;
    this.reconnectAttempts = 0;
    this.bufferingStartedAt = 0;
    // Cancel pending lock screen timeout
    this.clearLockScreenTimeout();

    // Pause player BEFORE stopping polling to ensure consistent state
    if (this.player) {
      try {
        this.player.pause();
      } catch (e) {
        logger.error('Error pausing player:', e);
      }
    }

    // Now safe to stop polling and cleanup
    this.clearReconnectTimeout();
    this.stopStatusPolling();

    // Clean up now playing subscription to prevent memory leaks
    this.unsubscribeFromNowPlaying();

    this.emitStatus();
  }

  async stop(): Promise<void> {
    // Set flags FIRST to prevent any polling/callbacks from restarting
    this.isIntentionallyStopped = true;
    this.isPlaying = false;
    this.reconnectAttempts = 0;
    this.bufferingStartedAt = 0;
    this.resetLockScreenCache();

    // Cancel pending lock screen timeout
    this.clearLockScreenTimeout();

    // Release player immediately - no delays that could be interrupted by process kill
    if (this.player) {
      try {
        this.player.pause();
        this.player.setActiveForLockScreen(false);
      } catch (e) {
        logger.error('Error deactivating lock screen:', e);
      }
      this.removePlayerListener();
      try {
        this.player.release();
      } catch (releaseError) {
        logger.error('Error releasing player:', releaseError);
      }
      this.player = null;
    }

    // Now safe to cleanup
    this.clearReconnectTimeout();
    this.stopStatusPolling();
    this.unsubscribeFromNowPlaying();

    this.emitStatus();
  }

  async setVolume(value: number): Promise<void> {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(1, value));

    if (this.settings) {
      await radioSettingsService.updateSetting('volume', this.volume);
    }

    if (this.player) {
      this.player.volume = this.volume;
    }

    this.emitStatus();
  }

  async togglePlayPause(): Promise<boolean> {
    if (this.isPlaying) {
      await this.pause();
      return false;
    } else {
      return await this.play();
    }
  }

  async forceReconnect(): Promise<boolean> {
    this.reconnectAttempts = 0;
    this.clearReconnectTimeout();
    return await this.play();
  }

  getStatus(): RadioStatus {
    return {
      isPlaying: this.isPlaying,
      volume: this.volume,
      isLoading: false,
      isReconnecting: this.reconnectAttempts > 0,
      reconnectAttempt: this.reconnectAttempts,
    };
  }

  getSettings(): RadioSettings | null {
    return this.settings;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async cleanup() {
    // Clear all timeouts first
    this.clearLockScreenTimeout();
    this.clearReconnectTimeout();
    this.bufferingStartedAt = 0;
    this.resetLockScreenCache();

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
    this.stopStatusPolling();
    this.unsubscribeFromNowPlaying();

    // Ensure lock screen is deactivated even if stop() partially failed before
    if (this.player) {
      try {
        this.player.setActiveForLockScreen(false);
      } catch {
        // Ignore if already released
      }
    }

    await this.stop();
    this.isInitialized = false;
  }
}

export interface RadioStatus {
  isPlaying: boolean;
  volume: number;
  isLoading: boolean;
  isReconnecting?: boolean;
  reconnectAttempt?: number;
}

export const radioService = new RadioService();
