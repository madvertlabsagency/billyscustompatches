import type { Metadata } from 'next';
import localFont from 'next/font/local';
import QuoteForm from '../components/QuoteForm';
import FunnelTracker from '../components/FunnelTracker';
import { HeroQuiz, PickTypeLink, StickyCta, UploadCta, ViewContentObserver } from '../components/Interactive';
import { BUSINESS, PATCH_TYPES } from '@/lib/options';
import { withBase } from '@/lib/base';
import css from './v2.module.css';

// Version 2 of the landing page in the Billys brand kit (dark navy, prism ribbons, yellow buttons).
// Same offers, quote form, WhatsApp flow and tracking as the version at /.

const bebas = localFont({ src: '../fonts/bebas-neue-latin-400-normal.woff2', weight: '400', variable: '--font-bebas', display: 'swap' });
const montserrat = localFont({ src: '../fonts/montserrat-latin-800-normal.woff2', weight: '800', variable: '--font-mont', display: 'swap' });
const manrope = localFont({
  src: [
    { path: '../fonts/manrope-latin-400-normal.woff2', weight: '400' },
    { path: '../fonts/manrope-latin-600-normal.woff2', weight: '600' },
    { path: '../fonts/manrope-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Billys Custom Patches, Get a Free Quote',
  alternates: { canonical: '/' },
};

const ICON: Record<string, string> = {
  PVC: withBase('/assets/v2/ic-pvc.webp'),
  Embroidered: withBase('/assets/v2/ic-embroidered.webp'),
  Chenille: withBase('/assets/v2/ic-chenille.webp'),
  Woven: withBase('/assets/v2/ic-woven.webp'),
  Sublimation: withBase('/assets/v2/ic-printed.webp'),
};

const Arrow = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

const Cta = ({ id, children = 'Get my free quote' }: { id: string; children?: React.ReactNode }) => (
  <a href="#quote" className={css.cta} data-cta={id}>{children}<Arrow /></a>
);

// The brand kit's prism ribbon: five glowing bands in the logo colors.
const Prism = ({ className }: { className: string }) => (
  <svg className={className} viewBox="0 0 1440 360" preserveAspectRatio="none" aria-hidden="true">
    {['#6931C7', '#075BC4', '#18A94A', '#FFC328', '#EE293A'].map((c, k) => (
      <path key={c} d={`M-60 ${300 - k * 22} C 320 ${120 - k * 18}, 760 ${380 - k * 20}, 1500 ${60 - k * 16}`} stroke={c} strokeWidth="20" fill="none" strokeLinecap="round" />
    ))}
  </svg>
);

const OFFERS = [
  ['i-box', 'No Minimum Order', 'Order one patch or thousands', '#075BC4'],
  ['i-pencil', 'Free Design', 'Send a logo, sketch or idea and we design it', '#18A94A'],
  ['i-clock', 'Free Mockup in 24 Hours', 'See your patch before you approve anything', '#FFC328'],
  ['i-loop', 'Unlimited Design Revisions', 'We adjust the design until you love it', '#EE293A'],
  ['i-truck', 'Free Shipping', 'Delivered to your door at no extra cost', '#00C2FF'],
  ['i-gift', 'Money Back Guarantee', 'Not happy with your patches? Get your money back', '#6931C7'],
];

const EXPERT = [
  ['Professional Digitizing', 'Every design is digitized by hand by an award winning team.'],
  ['Stitch Planning and Optimization', 'Stitch paths, density and order planned for your exact size.'],
  ['Cleaner Stitches, Superior Details', 'Sharp edges, small text that stays readable, no fuzz.'],
  ['Design Accuracy You Can Trust', 'Your patch matches your artwork and your instructions.'],
];

const PROMISES = [
  ['Money back guarantee', 'If your patches are not right, you get your money back. Simple as that.'],
  ['Sample before production', 'We make a pre production sample so you can check the design, size and colors before the full run.'],
  ['Matches your approved sample', 'If your patches do not match the sample you approved, we replace those pieces.'],
  ['A real person on every order', 'Our US based sales team stays with you from quote to delivery, on WhatsApp, phone or email.'],
];

const STEPS = [
  ['Tell us what you need', 'Pick your patch type, size and quantity. It takes about a minute.'],
  ['Send your artwork', 'Upload your logo, sketch or photo. Our digitizers check every file.'],
  ['Get your free mockup in 24 hours', 'We send your price and mockup on WhatsApp. Production starts only when you approve.'],
];

const MADE_FOR = [
  ['Clothing brands', '/assets/art/made-brands.webp', 'Hoodies and jackets on a clothing rack, each with a custom embroidered patch'],
  ['Streetwear labels', '/assets/art/made-streetwear.webp', 'Denim jacket back covered in colorful custom patches'],
  ['Small businesses', '/assets/art/made-small-business.webp', 'Coffee shop apron with an embroidered patch on the chest'],
  ['Sports teams', '/assets/art/made-teams.webp', 'Team jerseys and caps with custom patches'],
  ['Clubs and events', '/assets/art/made-clubs.webp', 'Leather club vest with large embroidered back patches'],
];

const FAQ: [string, string][] = [
  ['How much do custom patches cost?', 'It depends on the size, the detail and the quantity. Send your request and we reply with a clear price and a free mockup within 24 hours. Bigger orders get a lower price per patch.'],
  ['Is there a minimum order?', 'No. Order one patch or thousands. Bigger orders get a lower price per patch.'],
  ['Are design and shipping really free?', 'Yes. Design is free, shipping is free, and you get unlimited design revisions until you love it.'],
  ['What if I am not happy with my patches?', 'Every order comes with our money back guarantee. Tell us what is wrong and we make it right or give your money back.'],
  ['Why does digitizing matter so much?', 'Most of a great embroidered patch is good digitizing: turning your artwork into stitch paths. Bad digitizing means fuzzy edges and lost detail. We have done it for 20+ years and won awards for it.'],
  ['Do I see my patch before you make it?', 'Yes. You get a free mockup within 24 hours, and we make a pre production sample to check the design, size and colors before the full run.'],
  ['Can you rush my order?', 'Yes, priority production is available. Tell us your deadline in the quote form and we confirm the timing with your quote.'],
  ['Which file types can I upload?', 'PNG, JPG, JPEG, PDF, AI, EPS and SVG. A clear photo of a sketch works too.'],
];

export default function V2() {
  const quizTypes = PATCH_TYPES.map((t) => ({ label: t.label, img: ICON[t.label] || '' }));
  const bySlug = Object.fromEntries(PATCH_TYPES.map((t) => [t.key, t]));
  return (
    <div className={`${css.v2} ${bebas.variable} ${montserrat.variable} ${manrope.variable}`}>
      <div className={css.announce}>
        <span>No minimum order</span>
        <span className={css.hl}>Free mockup in 24 hours</span>
        <span>Free design and free shipping</span>
      </div>

      <header className={css.top}>
        <a href="#top" className={css.brand} aria-label={`${BUSINESS.name} home`}>
          <img src={withBase('/assets/v2/wordmark-white.webp')} alt={BUSINESS.name} width={485} height={192} />
        </a>
        <nav className={css.nav}>
          {BUSINESS.phoneTel && <a href={`tel:${BUSINESS.phoneTel}`} className={css.phone} data-cta="header_phone">{BUSINESS.phoneDisplay}</a>}
          <a href="#quote" className={css.ctaSm} data-cta="header_quote">Get a quote<Arrow /></a>
        </nav>
      </header>

      <main>
        <section id="top" className={css.hero}>
          <Prism className={css.prismHero} />
          <div className={css.heroGrid}>
            <div className={css.heroCopy}>
              <p className={css.kicker}>Award winning digitizing, 20+ years</p>
              <h1 className={css.h1}>
                <span>Custom patches</span>
                <span>that bring your</span>
                <span className={css.yellow}>brand to life.</span>
              </h1>
              <HeroQuiz types={quizTypes} id="hq-m" className={`hq-mobile ${css.quiz}`} />
              <p className={css.lead}>Send your logo or idea and see a free mockup in 24 hours. Free design, unlimited revisions, free shipping and no minimum order, backed by our money back guarantee.</p>
              <div className={css.ctas}>
                <Cta id="hero_quote" />
                <span className={css.ghostWrap}><UploadCta /></span>
              </div>
              <ul className={css.checks}>
                {['Free mockup in 24 hours', 'No minimum order', 'Money back guarantee'].map((t) => <li key={t}>{t}</li>)}
              </ul>
            </div>
            <div className={css.heroSide}>
              <span className={css.panels} aria-hidden="true"><i /><i /><i /><i /></span>
              <HeroQuiz types={quizTypes} id="hq-d" className={`hq-desktop ${css.quiz}`} />
            </div>
          </div>
        </section>

        <section className={css.strip} aria-label="What is included">
          {[['i-pencil', 'Free Design'], ['i-truck', 'Free Shipping'], ['i-box', 'No Minimum Order'], ['i-clock', 'Free Mockup in 24 Hours']].map(([ic, t]) => (
            <div key={t}><span className={`i3 s44 ${ic}`} aria-hidden="true" /><b>{t}</b></div>
          ))}
        </section>

        <section className={css.expert}>
          <div className={css.wrapGrid}>
            <figure className={css.eagle}>
              <img src={withBase('/assets/v2/eagle.webp')} alt="Close up of an embroidered eagle patch with a gold merrow border" width={642} height={470} loading="lazy" decoding="async" />
              <figcaption>Award winning digitizing expertise</figcaption>
            </figure>
            <div className={css.expertCopy}>
              <p className={css.kicker}>Why Billys</p>
              <h2 className={css.h2}>Experience that shows in <span className={css.yellow}>every stitch.</span></h2>
              <p className={css.p}>Ask anyone who knows machine embroidery: 80% of a great patch is digitizing, turning your artwork into stitch paths. We are a design company first, with 20+ years and awards in embroidery digitizing.</p>
              <ul className={css.expertList}>
                {EXPERT.map(([t, d], k) => (
                  <li key={t} style={{ ['--c' as string]: ['#075BC4', '#FFC328', '#EE293A', '#18A94A'][k] }}><b>{t}</b><span>{d}</span></li>
                ))}
              </ul>
              <Cta id="expert_quote">Work with experienced experts</Cta>
            </div>
          </div>
        </section>

        <section className={css.section}>
          <div className={css.wrap}>
            <h2 className={`${css.h2} ${css.center}`}>Everything included. <span className={css.yellow}>Zero risk.</span></h2>
            <p className={`${css.p} ${css.center} ${css.narrow}`}>Free design, free shipping and unlimited revisions on every order, with no minimum and a money back guarantee.</p>
            <div className={css.offers}>
              {OFFERS.map(([ic, t, d, c]) => (
                <div key={t} className={css.offer} style={{ ['--c' as string]: c }}>
                  <span className={`i3 s56 ${ic}`} aria-hidden="true" />
                  <b>{t}</b>
                  <span>{d}</span>
                </div>
              ))}
            </div>
            <div className={css.ctaRow}><Cta id="offers_quote" /><span>Free mockup in 24 hours. Takes about a minute.</span></div>
          </div>
        </section>

        <section className={`${css.section} ${css.alt}`}>
          <div className={css.wrap}>
            <h2 className={`${css.h2} ${css.center}`}>Pick your <span className={css.yellow}>patch style</span></h2>
            <p className={`${css.p} ${css.center} ${css.narrow}`}>Not sure which style fits? Choose Not sure in the quote form and our team will recommend the best option.</p>
            <div className={css.types}>
              {['pvc', 'emb', 'che', 'wov', 'sub'].map((k) => {
                const t = bySlug[k];
                return (
                  <div key={k} className={css.type}>
                    <img src={ICON[t.label]} alt="" width={152} height={124} loading="lazy" />
                    <b>{t.label}</b>
                    <span>{t.desc}</span>
                    <PickTypeLink type={t.label} />
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className={css.section}>
          <div className={css.wrap}>
            <h2 className={`${css.h2} ${css.center}`}>No surprises when your <span className={css.yellow}>patches arrive</span></h2>
            <p className={`${css.p} ${css.center} ${css.narrow}`}>You see it, you check it, you approve it. Then we make it, and our money back guarantee covers the rest.</p>
            <div className={css.promises}>
              {PROMISES.map(([t, d], k) => (
                <div key={t} className={css.promise} style={{ ['--c' as string]: ['#FFC328', '#18A94A', '#075BC4', '#EE293A'][k] }}>
                  <b>{t}</b><span>{d}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={`${css.section} ${css.alt}`}>
          <div className={css.wrap}>
            <h2 className={`${css.h2} ${css.center}`}>For brands, teams <span className={css.yellow}>and organizations</span></h2>
            <p className={`${css.p} ${css.center} ${css.narrow}`}>Ordering for a business or for yourself, you get the same digitizing team and the same care.</p>
            <div className={css.made}>
              {MADE_FOR.map(([l, src, alt]) => (
                <figure key={l}><img src={withBase(src)} alt={alt} width={720} height={1080} loading="lazy" decoding="async" /><figcaption>{l}</figcaption></figure>
              ))}
            </div>
          </div>
        </section>

        <section className={css.section}>
          <div className={css.wrap}>
            <h2 className={`${css.h2} ${css.center}`}>Design to patch in <span className={css.yellow}>3 steps</span></h2>
            <ol className={css.steps}>
              {STEPS.map(([t, d], k) => (
                <li key={t}><span className={css.num}>{k + 1}</span><b>{t}</b><span>{d}</span></li>
              ))}
            </ol>
            <div className={css.ctaRow}><Cta id="how_quote">Start my free quote</Cta><span>Free mockup in 24 hours. Takes about a minute.</span></div>
          </div>
        </section>

        <section id="quote" className={css.quote}>
          <ViewContentObserver />
          <Prism className={css.prismQuote} />
          <div className={css.wrap}>
            <h2 className={`${css.h2} ${css.center}`}>Get your <span className={css.yellow}>free quote</span></h2>
            <p className={`${css.p} ${css.center} ${css.narrow}`}>Seven quick steps. Takes about a minute. We reply on WhatsApp.</p>
            <div className={css.formWrap}><QuoteForm /></div>
          </div>
        </section>

        <section className={css.section}>
          <div className={css.wrapNarrow}>
            <h2 className={`${css.h2} ${css.center}`}>Questions, <span className={css.yellow}>answered</span></h2>
            <div className={css.faq}>
              {FAQ.map(([q, a]) => (
                <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>
              ))}
            </div>
          </div>
        </section>

        <section className={css.final}>
          <Prism className={css.prismFinal} />
          <div className={css.finalInner}>
            <h2 className={css.h2}>Get your free mockup <span className={css.yellow}>within 24 hours.</span></h2>
            <p className={css.p}>Free design, free shipping, no minimum order and a money back guarantee.</p>
            <Cta id="final_quote" />
          </div>
        </section>
      </main>

      <footer className={css.footer}>
        <div className={css.footInner}>
          <img src={withBase('/assets/v2/wordmark-white.webp')} alt={BUSINESS.name} width={485} height={192} className={css.footLogo} />
          <div className={css.footCols}>
            {BUSINESS.phoneTel && <a href={`tel:${BUSINESS.phoneTel}`}>{BUSINESS.phoneDisplay}</a>}
            {BUSINESS.email && <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>}
            {BUSINESS.address && <span>{BUSINESS.address}</span>}
            <span className={css.footLinks}><a href={withBase('/privacy')}>Privacy Policy</a><a href={withBase('/terms')}>Terms</a></span>
          </div>
        </div>
      </footer>

      <StickyCta />
      <FunnelTracker />
    </div>
  );
}
