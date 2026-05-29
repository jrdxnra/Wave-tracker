'use client';

import { useEffect } from 'react';

const RELOAD_GUARD_KEY = '__wave_tracker_chunk_reload_once__';

function shouldHandleChunkError(value: unknown): boolean {
  const message = typeof value === 'string'
    ? value
    : value instanceof Error
      ? `${value.name}: ${value.message}`
      : '';

  return /ChunkLoadError|Failed to load chunk|Loading chunk [^ ]+ failed/i.test(message);
}

function reloadOnceForChunkError() {
  if (typeof window === 'undefined') return;

  try {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY) === '1') {
      return;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
  } catch {
    return;
  }

  window.location.reload();
}

export default function ChunkErrorRecovery() {
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (shouldHandleChunkError(event.reason)) {
        event.preventDefault();
        reloadOnceForChunkError();
      }
    };

    const onError = (event: ErrorEvent) => {
      if (shouldHandleChunkError(event.error || event.message)) {
        reloadOnceForChunkError();
      }
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('error', onError);

    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  return null;
}
