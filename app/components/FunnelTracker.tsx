'use client';
import { useEffect, useRef } from 'react';
import { useReportWebVitals } from 'next/web-vitals';
import { fe, flush, furthestStep, sessionContext } from '@/lib/funnel-client';

// Seconds on page that count as engaged in the browser. The dashboard can apply a stricter
// threshold afterwards using the time on page sent with page_exit.
const ENGAGED_SECONDS = Number(process.env.NEXT_PUBLIC_ENGAGED_SECONDS || 10);

type Vitals = { lcp?: number; fcp?: number; ttfb?: number };

export default function FunnelTracker() {
  const vitals = useRef<Vitals>({});
  const loadSent = useRef<'none' | 'partial' | 'full'>('none');

  useReportWebVitals((m) => {
    if (m.name !== 'LCP' && m.name !== 'FCP' && m.name !== 'TTFB') return;
    vitals.current[m.name.toLowerCase() as keyof Vitals] = Math.round(m.value);
    if (m.name === 'LCP' && loadSent.current !== 'full') {
      loadSent.current = 'full';
      fe('page_load', undefined, { ...vitals.current });
    }
  });

  useEffect(() => {
    const start = Date.now();
    sessionContext();
    fe('page_view', undefined, { path: location.pathname });

    let engaged = false;
    let clicked = false;
    let maxScroll = 0;
    const sentDepth = new Set<number>();
    const engage = (reason: 'time' | 'scroll' | 'click') => {
      if (engaged) return;
      engaged = true;
      fe('engaged', undefined, { reason, seconds: Math.round((Date.now() - start) / 1000) });
    };
    const timer = setTimeout(() => engage('time'), ENGAGED_SECONDS * 1000);

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        const pct = max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 100;
        maxScroll = Math.max(maxScroll, pct);
        for (const d of [25, 50, 75, 100]) {
          if (maxScroll >= d && !sentDepth.has(d)) {
            sentDepth.add(d);
            fe(`scroll_${d}` as 'scroll_25');
          }
        }
        if (maxScroll >= 50) engage('scroll');
      });
    };

    const onClick = (e: MouseEvent) => {
      clicked = true;
      engage('click');
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-cta]');
      if (el) fe('cta_click', undefined, { cta: el.dataset.cta });
    };

    let exits = 0;
    let lastExit = 0;
    const onHide = () => {
      // visibilitychange and pagehide often fire together; report the exit once.
      if (document.visibilityState !== 'hidden' || Date.now() - lastExit < 1000) return;
      lastExit = Date.now();
      if (loadSent.current === 'none' && (vitals.current.fcp || vitals.current.ttfb)) {
        loadSent.current = 'partial';
        fe('page_load', undefined, { ...vitals.current });
      }
      fe('page_exit', furthestStep() || undefined, {
        seconds: Math.round((Date.now() - start) / 1000),
        max_scroll: maxScroll,
        clicked,
        last_step: furthestStep(),
        exit_n: ++exits,
      });
      flush(true);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      flush();
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  return null;
}
