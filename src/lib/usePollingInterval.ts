import { useEffect, useRef } from 'react';

/**
 * Shared polling hook with mount jitter (0-500ms) and automatic cleanup.
 * Prevents multiple components or tabs hitting the server simultaneously on the exact same tick.
 */
export function usePollingInterval(callback: () => void, delay: number | null, deps: any[] = []): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null || delay <= 0) return;

    // Stagger interval start times with a small random jitter (0-500ms) on mount
    const jitter = Math.floor(Math.random() * 500);
    let intervalId: any = null;

    const timeoutId = setTimeout(() => {
      savedCallback.current();
      intervalId = setInterval(() => {
        savedCallback.current();
      }, delay);
    }, jitter);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [delay, ...deps]);
}
