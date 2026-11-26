import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { translate, useI18n } from '../i18n';

export interface YouTubePlayerController {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setMuted: (muted: boolean) => void;
  isReady: () => boolean;
}

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
  getPlayerState: () => number;
  getVideoData?: () => { title?: string; author?: string; video_id?: string };
}

interface YTNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YTPlayerInstance }) => void;
        onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) => YTPlayerInstance;
  PlayerState?: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (window.YT && typeof window.YT.Player === 'function') {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevCallback?.();
      if (window.YT) {
        resolve(window.YT);
      } else {
        reject(new Error(translate('youtubePlayer.apiInitFailed')));
      }
    };

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        ytApiPromise = null;
        reject(new Error(translate('youtubePlayer.apiLoadFailed')));
      };
      document.head.appendChild(script);
    }

    // Poll safety net in case API finished loading before callback attached
    const poll = window.setInterval(() => {
      if (window.YT && typeof window.YT.Player === 'function') {
        clearInterval(poll);
        resolve(window.YT);
      }
    }, 150);
    window.setTimeout(() => clearInterval(poll), 12000);
  });

  return ytApiPromise;
}

interface YouTubePlayerViewProps {
  videoId: string;
  isMuted: boolean;
  controllerRef: React.RefObject<YouTubePlayerController | null>;
  onReady?: (durationSec: number, info?: { title?: string; author?: string }) => void;
  onPlaybackStateChange?: (state: 'playing' | 'paused' | 'ended') => void;
}

export const YouTubePlayerView: React.FC<YouTubePlayerViewProps> = ({
  videoId,
  isMuted,
  controllerRef,
  onReady,
  onPlaybackStateChange,
}) => {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const readyRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const onStateRef = useRef(onPlaybackStateChange);
  const mutedRef = useRef(isMuted);

  const [isLoading, setIsLoading] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onStateRef.current = onPlaybackStateChange;
  }, [onPlaybackStateChange]);

  useEffect(() => {
    mutedRef.current = isMuted;
    const p = playerRef.current;
    if (p && readyRef.current) {
      try {
        if (isMuted) p.mute();
        else p.unMute();
      } catch {
        // ignore transient player state errors
      }
    }
  }, [isMuted]);

  useImperativeHandle(
    controllerRef,
    () => ({
      play: () => {
        if (playerRef.current && readyRef.current) {
          try {
            playerRef.current.playVideo();
          } catch {
            // ignore
          }
        }
      },
      pause: () => {
        if (playerRef.current && readyRef.current) {
          try {
            playerRef.current.pauseVideo();
          } catch {
            // ignore
          }
        }
      },
      seekTo: (seconds: number, allowSeekAhead = true) => {
        if (playerRef.current && readyRef.current) {
          try {
            playerRef.current.seekTo(Math.max(0, seconds), allowSeekAhead);
          } catch {
            // ignore
          }
        }
      },
      getCurrentTime: () => {
        if (playerRef.current && readyRef.current) {
          try {
            const t = playerRef.current.getCurrentTime();
            return Number.isFinite(t) ? t : 0;
          } catch {
            return 0;
          }
        }
        return 0;
      },
      getDuration: () => {
        if (playerRef.current && readyRef.current) {
          try {
            const d = playerRef.current.getDuration();
            return Number.isFinite(d) ? d : 0;
          } catch {
            return 0;
          }
        }
        return 0;
      },
      setMuted: (muted: boolean) => {
        if (playerRef.current && readyRef.current) {
          try {
            if (muted) playerRef.current.mute();
            else playerRef.current.unMute();
          } catch {
            // ignore
          }
        }
      },
      isReady: () => readyRef.current,
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;
    setIsLoading(true);
    setPlayerError(null);

    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;

        // Mount fresh inner container so YT.Player can safely replace it with an iframe
        hostRef.current.innerHTML = '';
        const mountEl = document.createElement('div');
        mountEl.className = 'w-full h-full';
        hostRef.current.appendChild(mountEl);

        const player = new YT.Player(mountEl, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            controls: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              readyRef.current = true;
              setIsLoading(false);
              if (mutedRef.current) {
                event.target.mute();
              } else {
                event.target.unMute();
              }
              const dur = event.target.getDuration();
              const vData =
                typeof event.target.getVideoData === 'function'
                  ? event.target.getVideoData()
                  : undefined;
              onReadyRef.current?.(Number.isFinite(dur) ? dur : 0, {
                title: vData?.title,
                author: vData?.author,
              });
            },
            onStateChange: (event) => {
              if (cancelled) return;
              // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
              if (event.data === 1) {
                onStateRef.current?.('playing');
              } else if (event.data === 2) {
                onStateRef.current?.('paused');
              } else if (event.data === 0) {
                onStateRef.current?.('ended');
              }
            },
            onError: (event) => {
              if (cancelled) return;
              setIsLoading(false);
              if (event.data === 101 || event.data === 150) {
                setPlayerError(translate('youtubePlayer.embedRestricted'));
              } else if (event.data === 100) {
                setPlayerError(translate('youtubePlayer.videoUnavailable'));
              } else {
                setPlayerError(translate('youtubePlayer.playerGenericError'));
              }
            },
          },
        });

        playerRef.current = player;
      })
      .catch((err) => {
        if (cancelled) return;
        setIsLoading(false);
        setPlayerError(err instanceof Error ? err.message : translate('youtubePlayer.playerInitFailed'));
      });

    return () => {
      cancelled = true;
      readyRef.current = false;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [videoId]);

  return (
    <div className="relative w-full h-full bg-black">
      <div ref={hostRef} className="w-full h-full" />

      {isLoading && !playerError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 pointer-events-none">
          <div className="flex items-center gap-2 text-xs text-[#CBD5E1]">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            <span>{t('youtubePlayer.loadingPlayer')}</span>
          </div>
        </div>
      )}

      {playerError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6">
          <div className="max-w-md text-center space-y-2">
            <AlertCircle className="w-6 h-6 text-amber-400 mx-auto" />
            <p className="text-xs text-[#E2E8F0] leading-relaxed">{playerError}</p>
          </div>
        </div>
      )}
    </div>
  );
};
