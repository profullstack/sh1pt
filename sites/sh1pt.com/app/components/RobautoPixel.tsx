'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const PID = '40281f66-1d2d-49f7-b391-1c91e4860eeb';
const EP = 'https://hkeytqaukllckucnhzey.supabase.co/functions/v1/track';

export default function RobautoPixel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const data = JSON.stringify({
      path: window.location.pathname,
      url: window.location.href,
      referer: document.referrer,
    });
    const url = `${EP}?pid=${PID}`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, data);
    } else {
      const x = new XMLHttpRequest();
      x.open('POST', url);
      x.setRequestHeader('Content-Type', 'application/json');
      x.send(data);
    }
  }, [pathname, searchParams]);

  return null;
}
