'use client';
import { useEffect, useRef } from 'react';
import { track } from '@/lib/track-client';
import { fe } from '@/lib/funnel-client';
import { BUSINESS } from '@/lib/options';
import { withBase } from '@/lib/base';

export function PickTypeLink({ type }: { type: string }) {
  return (
    <a
      href={`?type=${encodeURIComponent(type)}#quote`}
      className="type-link"
      onClick={(e) => {
        e.preventDefault();
        fe('patch_type_card_click', undefined, { patch_type: type });
        window.dispatchEvent(new CustomEvent('cpl:pick', { detail: type }));
      }}
    >
      Get a quote for this style
    </a>
  );
}

export function UploadCta() {
  return (
    <a
      href="?upload=1#quote"
      className="btn cta-ghost"
      data-cta="hero_upload"
      onClick={(e) => {
        e.preventDefault();
        window.dispatchEvent(new Event('cpl:upload'));
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#121316" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M6 10l6-6 6 6M4 20h16" /></svg>
      Upload my design
    </a>
  );
}

// Fires ViewContent once when the quote configurator scrolls into view, and hides the
// sticky mobile CTA while the form is on screen.
export function ViewContentObserver() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    let sent = false;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      document.body.classList.toggle('in-quote', visible);
      if (visible && !sent) {
        sent = true;
        track('ViewContent', { content_name: 'Quote configurator' });
      }
    }, { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <span ref={ref} hidden />;
}

// Links work before hydration too: the form reads ?type= / ?upload= on load.

// Official Trustpilot TrustBox. Only renders when a business unit id is configured;
// until then the designed rating block shows.
export function TrustBox({ template, height, fallback }: { template: string; height: string; fallback: React.ReactNode }) {
  const bu = process.env.NEXT_PUBLIC_TRUSTPILOT_BUSINESSUNIT_ID;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!bu) return;
    const load = () => {
      const w = window as unknown as { Trustpilot?: { loadFromElement: (el: HTMLElement, b: boolean) => void } };
      if (w.Trustpilot && ref.current) w.Trustpilot.loadFromElement(ref.current, true);
    };
    if (!document.getElementById('tp-bootstrap')) {
      const s = document.createElement('script');
      s.id = 'tp-bootstrap';
      s.src = 'https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js';
      s.async = true;
      s.onload = load;
      document.body.appendChild(s);
    } else load();
  }, [bu]);
  if (!bu) return <>{fallback}</>;
  return (
    <div
      ref={ref}
      className="trustpilot-widget"
      data-locale="en-US"
      data-template-id={template}
      data-businessunit-id={bu}
      data-style-height={height}
      data-style-width="100%"
      data-theme="light"
    >
      <a href={BUSINESS.trustpilotUrl || "https://www.trustpilot.com"} target="_blank" rel="noopener">Trustpilot</a>
    </div>
  );
}

// Silent process reel. The video files only download when the section gets close to the
// screen, it pauses when scrolled away, and people who prefer reduced motion see the
// poster with a play button instead of autoplay.
export function ProcessReel() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let loaded = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !loaded) {
          loaded = true;
          v.preload = 'auto';
          v.load();
        }
        if (still) return;
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { rootMargin: '200px 0px' },
    );
    if (still) v.controls = true;
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      className="reel-video"
      muted
      loop
      playsInline
      preload="none"
      poster={withBase('/assets/video/patch-lab-reel-poster.webp')}
      width={1280}
      height={720}
      aria-label="Our patches being stitched on an embroidery machine, heat pressed onto a denim jacket and worn"
    >
      <source src={withBase('/assets/video/patch-lab-reel.webm')} type="video/webm" />
      <source src={withBase('/assets/video/patch-lab-reel.mp4')} type="video/mp4" />
    </video>
  );
}

// Step 1 of the quote form, right in the hero. A tap selects the patch type and jumps
// to the form at step 2, so the visitor has already started before they scroll.
export function HeroQuiz({ types, id, className = '' }: { types: { label: string; img: string }[]; id: string; className?: string }) {
  return (
    <div className={`hq ${className}`} role="group" aria-labelledby={id}>
      <div className="hq-head">
        <span className="hq-step">Step 1 of 7</span>
        <span className="hq-time">Takes about 60 seconds</span>
      </div>
      <div className="hq-bar" aria-hidden="true"><span /></div>
      <h2 id={id} className="hd hq-title">What type of patch do you need?</h2>
      <div className="hq-grid">
        {types.map((t) => (
          <a
            key={t.label}
            href={`?type=${encodeURIComponent(t.label)}#quote`}
            className="hq-opt"
            data-cta={`hero_quiz_${t.label}`}
            onClick={(e) => {
              e.preventDefault();
              fe('patch_type_card_click', undefined, { patch_type: t.label, source: 'hero_quiz' });
              window.dispatchEvent(new CustomEvent('cpl:pick', { detail: t.label }));
            }}
          >
            {t.img ? <img src={t.img} alt="" width={56} height={56} /> : <span className="hq-q" aria-hidden="true">?</span>}
            <span>{t.label}</span>
          </a>
        ))}
      </div>
      <p className="hq-foot">Free mockup in 24 hours. No minimum order.</p>
    </div>
  );
}

// "Get my free quote" stays on screen once the hero is scrolled past, and hides while the form is open.
export function StickyCta() {
  useEffect(() => {
    const on = () => document.body.classList.toggle('scrolled', window.scrollY > 520);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <div className="scta">
      <a href="#quote" data-cta="sticky_quote">
        Get my free quote
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </a>
    </div>
  );
}
