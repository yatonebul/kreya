'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh({ interval = 8000 }: { interval?: number }) {
  const router = useRouter();

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        router.refresh();
      }
    };

    const pollInterval = setInterval(() => {
      if (!document.hidden) {
        router.refresh();
      }
    }, interval);

    // Also refresh when page becomes visible
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router, interval]);

  return null;
}
