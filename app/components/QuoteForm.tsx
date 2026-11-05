'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { ARTWORK_EXTENSIONS, BUSINESS, BACKINGS, CONTACT_METHODS, DEADLINES, PATCH_TYPES, QUANTITIES, extOf, formatDeadline } from '@/lib/options';
import { getAttribution, track, uuid } from '@/lib/track-client';
import { fe, flush, funnelIds, noteStep } from '@/lib/funnel-client';
import { DIAL_CODES, joinPhone, toE164 } from '@/lib/phone';
import { withBase } from '@/lib/base';

const MAX_MB = Number(process.env.NEXT_PUBLIC_ARTWORK_MAX_MB || 25);
const TURNSTILE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const STORE = 'cpl-quote-v1';

type UploadState = 'uploading' | 'done' | 'error';
type FileItem = { id: string; name: string; size: number; ext: string; path?: string; state: UploadState; progress: number; error?: string; preview?: string };

type Form = {
  step: number;
  type: string;
  qty: string;
  w: string;
  h: string;
  sizeUnsure: boolean;
  backing: string;
  noArt: boolean;
  deadline: string;
  date: string;
  notes: string;
  first: string;
  last: string;
  biz: string;
  email: string;
  phone: string;
  cc: string;
  contact: string;
  consent: boolean;
  folder: string;
  eventId: string;
};

const EMPTY: Form = {
  step: 1, type: '', qty: '', w: '', h: '', sizeUnsure: false, backing: '', noArt: false, deadline: '', date: '', notes: '',
  first: '', last: '', biz: '', email: '', phone: '', cc: '+1', contact: '', consent: false, folder: '', eventId: '',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fmtSize = (b: number) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void };
  }
}

export default function QuoteForm() {
  const router = useRouter();
  const [f, setF] = useState<Form>(EMPTY);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [err, setErr] = useState('');
  const [errField, setErrField] = useState('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tsToken, setTsToken] = useState('');
  const loaded = useRef(false);
  const started = useRef(false);
  const fileObjs = useRef(new Map<string, File>());
  const cardRef = useRef<HTMLDivElement>(null);
  const tsRef = useRef<HTMLDivElement>(null);
  const tsId = useRef<string | null>(null);
  const stepAt = useRef(Date.now());

  // Restore saved answers so Back, refresh or a failed upload never loses data.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) || 'null');
      if (saved?.f) setF({ ...EMPTY, ...saved.f });
      if (Array.isArray(saved?.files)) setFiles(saved.files.filter((x: FileItem) => x.state === 'done'));
    } catch {
      /* ignore */
    }
    loaded.current = true;
    // Patch type card or Upload link followed before the page finished loading.
    const q = new URLSearchParams(location.search);
    const t = q.get('type');
    if (t && PATCH_TYPES.some((p) => p.label === t)) pickType(t);
    if (q.get('upload')) setF((p) => ({ ...p, step: 5 }));
    if (t || q.get('upload')) history.replaceState(null, '', location.pathname + location.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ f, files: files.map(({ preview, ...x }) => x) }));
    } catch {
      /* ignore */
    }
  }, [f, files]);

  // Funnel analytics: one rfq_step_view each time a step is shown.
  // Step 1 counts as viewed when the quote card first scrolls into view; later steps when shown.
  useEffect(() => {
    stepAt.current = Date.now();
    noteStep(f.step);
    if (f.step > 1) fe('rfq_step_view', f.step);
  }, [f.step]);
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fe('rfq_step_view', 1);
      stepAt.current = Date.now();
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setErr('');
    setErrField('');
    if (!started.current) {
      started.current = true;
      track('StartRFQ');
      fe('rfq_start');
    }
  }, []);

  const scrollToCard = () => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const pickType = useCallback(
    (type: string, fromPage = false) => {
      setF((p) => {
        if (p.step === 1) fe('rfq_step_complete', 1, { ms: Date.now() - stepAt.current, patch_type: type });
        return { ...p, type, step: p.step === 1 ? 2 : p.step };
      });
      setErr('');
      if (!started.current) {
        started.current = true;
        track('StartRFQ');
        fe('rfq_start');
      }
      track('PatchTypeSelected', { patch_type: type });
      if (fromPage) setTimeout(() => document.getElementById('quote')?.scrollIntoView({ behavior: 'smooth' }), 0);
    },
    [],
  );

  // Patch type cards and the hero Upload button elsewhere on the page talk to the form through events.
  useEffect(() => {
    const onPick = (e: Event) => pickType((e as CustomEvent<string>).detail, true);
    const onUpload = () => {
      setF((p) => ({ ...p, step: 5 }));
      document.getElementById('quote')?.scrollIntoView({ behavior: 'smooth' });
    };
    window.addEventListener('cpl:pick', onPick);
    window.addEventListener('cpl:upload', onUpload);
    return () => {
      window.removeEventListener('cpl:pick', onPick);
      window.removeEventListener('cpl:upload', onUpload);
    };
  }, [pickType]);

  // Render Turnstile only when the visitor reaches the last step (keeps the page fast).
  const renderTurnstile = useCallback(() => {
    if (!TURNSTILE_KEY || !window.turnstile || !tsRef.current || tsId.current) return;
    tsId.current = window.turnstile.render(tsRef.current, {
      sitekey: TURNSTILE_KEY,
      callback: (t: string) => setTsToken(t),
      'expired-callback': () => setTsToken(''),
      appearance: 'interaction-only',
    });
  }, []);
  useEffect(() => {
    if (f.step === 7) renderTurnstile();
    else tsId.current = null;
  }, [f.step, renderTurnstile]);

  async function upload(item: FileItem, file: File, folderArg?: string) {
    const update = (patch: Partial<FileItem>) => setFiles((list) => list.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
    update({ state: 'uploading', progress: 0, error: undefined });
    try {
      const folder = folderArg || f.folder || uuid();
      if (!f.folder) setF((p) => ({ ...p, folder }));
      const res = await fetch(withBase('/api/upload/sign'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, folder }),
      });
      const data = await res.json().catch(() => ({ error: 'Upload is not available right now. Tick "send it later" and send your file after.' }));
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', data.signedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.upload.onprogress = (e) => e.lengthComputable && update({ progress: Math.round((e.loaded / e.total) * 100) });
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed. Check your connection and tap Retry.')));
        xhr.onerror = () => reject(new Error('Upload failed. Check your connection and tap Retry.'));
        xhr.send(file);
      });
      update({ state: 'done', progress: 100, path: data.path });
      fileObjs.current.delete(item.id);
      track('ArtworkUploaded', { file_type: item.ext });
      fe('artwork_upload_success', 5, { ext: item.ext, size: item.size });
    } catch (e) {
      update({ state: 'error', error: e instanceof Error ? e.message : 'Upload failed.' });
      fe('artwork_upload_fail', 5, { ext: item.ext, size: item.size, error: (e instanceof Error ? e.message : 'failed').slice(0, 120) });
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    let bad = '';
    const add: { item: FileItem; file: File }[] = [];
    Array.from(list).forEach((file) => {
      const ext = extOf(file.name);
      if (!(ARTWORK_EXTENSIONS as readonly string[]).includes(ext)) {
        bad = `${file.name} is not a supported file type. Use PNG, JPG, PDF, AI, EPS or SVG.`;
        fe('artwork_upload_fail', 5, { ext: ext || 'none', size: file.size, error: 'unsupported type' });
        return;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        bad = `${file.name} is over ${MAX_MB} MB. Upload a smaller version.`;
        fe('artwork_upload_fail', 5, { ext, size: file.size, error: 'too large' });
        return;
      }
      const isImg = /^image\/(png|jpe?g|svg\+xml)$/.test(file.type);
      const item: FileItem = { id: uuid(), name: file.name, size: file.size, ext, state: 'uploading', progress: 0, preview: isImg ? URL.createObjectURL(file) : undefined };
      fileObjs.current.set(item.id, file);
      add.push({ item, file });
    });
    if (add.length) {
      const folder = f.folder || uuid();
      if (!f.folder) setF((p) => ({ ...p, folder }));
      setFiles((prev) => [...prev, ...add.map((a) => a.item)]);
      setF((p) => ({ ...p, noArt: false }));
      add.forEach((a) => upload(a.item, a.file, folder));
    }
    setErr(bad);
    setDrag(false);
  }

  function validate(step: number): [string, string] {
    if (step === 1 && !f.type) return ['Choose a patch type to continue. Pick Not sure if you want a recommendation.', 'type'];
    if (step === 2 && !f.qty) return ['Choose how many patches you need. Not sure yet is fine too.', 'qty'];
    if (step === 3 && !f.sizeUnsure && (!(parseFloat(f.w) > 0) || !(parseFloat(f.h) > 0))) return ["Enter a width and height in inches, or tick I'm not sure yet.", 'w'];
    if (step === 4 && !f.backing) return ['Choose a backing, or pick Not sure.', 'backing'];
    if (step === 5) {
      if (files.some((x) => x.state === 'uploading')) return ['Wait for your files to finish uploading.', 'files'];
      if (files.some((x) => x.state === 'error')) return ['One file did not upload. Tap Retry on it, or remove it.', 'files'];
      if (!files.length && !f.noArt) return ["Upload your artwork, or tick I don't have artwork yet.", 'files'];
      if (f.email && !EMAIL_RE.test(f.email.trim())) return ['Check your email address, it looks incomplete.', 'email'];
    }
    if (step === 6) {
      if (!f.deadline) return ['Choose when you need your patches.', 'deadline'];
      if (f.deadline === 'Specific deadline' && !f.date) return ['Pick your deadline date.', 'date'];
    }
    if (step === 7) {
      if (!f.first.trim()) return ['Enter your first name.', 'first'];
      if (!f.last.trim()) return ['Enter your last name.', 'last'];
      if (!EMAIL_RE.test(f.email.trim())) return ['Enter a valid email so we can send your quote.', 'email'];
      {
        const full = toE164(joinPhone(f.cc || '+1', f.phone));
        if (!full) return ['Check your WhatsApp number: pick your country code and type the number without the leading 0.', 'phone'];
      }
      if (!f.contact) return ['Choose how you would like us to contact you.', 'contact'];
      if (!f.consent) return ['Tick the box to agree to be contacted about your quote.', 'consent'];
    }
    return ['', ''];
  }

  function stepAnswer(step: number): Record<string, unknown> {
    if (step === 1) return { patch_type: f.type };
    if (step === 2) return { quantity: f.qty };
    if (step === 3) return { size_unsure: f.sizeUnsure };
    if (step === 4) return { backing: f.backing };
    if (step === 5) return { files: files.filter((x) => x.state === 'done').length, no_artwork: f.noArt };
    if (step === 6) return { deadline: f.deadline };
    return {};
  }

  function next() {
    const [e, field] = validate(f.step);
    if (e) {
      setErr(e);
      setErrField(field);
      fe('validation_error', f.step, { field });
      return;
    }
    fe('rfq_step_complete', f.step, { ms: Date.now() - stepAt.current, ...stepAnswer(f.step) });
    setF((p) => ({ ...p, step: Math.min(7, p.step + 1) }));
    setErr('');
    scrollToCard();
  }

  function back() {
    setF((p) => ({ ...p, step: Math.max(1, p.step - 1) }));
    setErr('');
    scrollToCard();
  }

  async function submit() {
    for (let i = 1; i <= 7; i++) {
      const [e, field] = validate(i);
      if (e) {
        setF((p) => ({ ...p, step: i }));
        setErr(e);
        setErrField(field);
        fe('validation_error', i, { field });
        return;
      }
    }
    if (TURNSTILE_KEY && !tsToken) {
      setErr('One moment, we are checking you are not a robot. Tap Request my free quote again in a second.');
      return;
    }
    setBusy(true);
    const eventId = f.eventId || uuid();
    if (!f.eventId) setF((p) => ({ ...p, eventId }));
    const attr = { ...getAttribution(), ...funnelIds() };
    try {
      const res = await fetch(withBase('/api/rfq'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patchType: f.type,
          quantity: f.qty,
          width: f.w,
          height: f.h,
          sizeUnsure: f.sizeUnsure,
          backing: f.backing,
          files: files.filter((x) => x.state === 'done' && x.path).map((x) => ({ path: x.path, name: x.name, size: x.size, ext: x.ext })),
          noArtwork: f.noArt && !files.length,
          deadline: f.deadline,
          deadlineDate: f.deadline === 'Specific deadline' ? f.date : '',
          notes: f.notes,
          firstName: f.first,
          lastName: f.last,
          business: f.biz,
          email: f.email,
          phone: joinPhone(f.cc || '+1', f.phone),
          contactMethod: f.contact,
          consent: f.consent,
          turnstileToken: tsToken,
          eventId,
          tracking: attr,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || 'Something went wrong. Please try again.');
        if (window.turnstile && tsId.current) window.turnstile.reset(tsId.current);
        setTsToken('');
        setBusy(false);
        return;
      }
      // Browser Lead uses the same event_id as the server CAPI Lead, so Meta counts it once.
      track('Lead', { content_name: f.type, content_category: f.qty }, eventId, false);
      fe('rfq_step_complete', 7, { ms: Date.now() - stepAt.current, contact: f.contact });
      sessionStorage.setItem(
        'cpl-last',
        JSON.stringify({ id: data.id, code: data.code, first: f.first, summary: summary(true), hasArtwork: data.hasArtwork }),
      );
      sessionStorage.removeItem(STORE);
      flush();
      router.push('/thank-you');
    } catch {
      setErr('Network problem. Check your connection and tap Request my free quote again. Your answers are saved.');
      setBusy(false);
    }
  }

  function summary(done = false) {
    const out: { k: string; v: string }[] = [];
    if (f.type) out.push({ k: 'Patch type', v: f.type });
    if (f.qty) out.push({ k: 'Quantity', v: f.qty });
    if (f.sizeUnsure) out.push({ k: 'Size', v: 'Recommend for me' });
    else if (f.w && f.h) out.push({ k: 'Size', v: `${f.w} x ${f.h} in` });
    if (f.backing) out.push({ k: 'Backing', v: f.backing });
    const ok = files.filter((x) => x.state === 'done').length;
    if (ok) out.push({ k: 'Artwork', v: done ? `Artwork received (${ok} ${ok === 1 ? 'file' : 'files'})` : `${ok} ${ok === 1 ? 'file' : 'files'} received` });
    else if (f.noArt) out.push({ k: 'Artwork', v: 'Design help needed' });
    if (f.deadline) out.push({ k: 'Deadline', v: formatDeadline(f.deadline, f.date) });
    if (done && f.contact) out.push({ k: 'We will contact you by', v: f.contact });
    return out;
  }

  const pct = Math.round((f.step / 7) * 100);
  const rows = summary();
  const inv = (k: string) => (errField === k ? { 'aria-invalid': true as const, 'aria-describedby': 'q-err' } : {});

  // Plain render helper (not a component) so buttons keep focus across re-renders.
  const opt = (field: 'qty' | 'backing' | 'deadline' | 'contact', label: string, desc?: string) => (
    <button key={label} type="button" className="opt" aria-pressed={f[field] === label} onClick={() => set(field, label)}>
      {desc ? <strong style={{ fontSize: 16 }}>{label}</strong> : label}
      {desc && <span className="desc">{desc}</span>}
    </button>
  );

  return (
    <div className="qwrap">
      {TURNSTILE_KEY && f.step === 7 && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={renderTurnstile} />
      )}
      <div className="qcard" ref={cardRef} style={{ scrollMarginTop: 16 }}>
        <div className="qhead">
          <span>Step {f.step} of 7</span>
          <span style={{ color: 'var(--teal)' }}>{pct}% complete</span>
        </div>
        <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Quote progress">
          <div style={{ width: `${pct}%` }} />
        </div>
        <ol className="stepdots" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <li key={n} className={n < f.step ? 'done' : n === f.step ? 'current' : ''} />
          ))}
        </ol>

        {f.step === 1 && (
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="hd h3 mb">What type of patch do you need?</legend>
            <div className="ogrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {PATCH_TYPES.map((t) => (
                <button key={t.key} type="button" className="opt tall" aria-pressed={f.type === t.label} onClick={() => pickType(t.label)}>
                  {t.img ? <img src={t.img} alt="" width={72} height={72} /> : <span className="unsure hd" aria-hidden="true">?</span>}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {f.step === 2 && (
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="hd h3">How many patches do you need?</legend>
            <p className="hint">No minimum order. Bigger orders get better pricing per patch.</p>
            <div className="ogrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {QUANTITIES.map((q) => opt('qty', q))}
            </div>
          </fieldset>
        )}

        {f.step === 3 && (
          <div>
            <h3 className="hd h3">What size do you need?</h3>
            <p className="hint">Most patches are 2 to 4 inches. An estimate is fine.</p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="fld">
                Width (inches)
                <input className="inp" style={{ width: 150, fontSize: 18 }} type="number" min="0.5" step="0.25" inputMode="decimal" placeholder="3" value={f.w} onChange={(e) => set('w', e.target.value)} disabled={f.sizeUnsure} {...inv('w')} />
              </label>
              <span className="hd" style={{ fontSize: 22, paddingBottom: 12 }} aria-hidden="true">x</span>
              <label className="fld">
                Height (inches)
                <input className="inp" style={{ width: 150, fontSize: 18 }} type="number" min="0.5" step="0.25" inputMode="decimal" placeholder="3" value={f.h} onChange={(e) => set('h', e.target.value)} disabled={f.sizeUnsure} {...inv('w')} />
              </label>
            </div>
            <label className="chk" style={{ marginTop: 18 }}>
              <input type="checkbox" checked={f.sizeUnsure} onChange={(e) => set('sizeUnsure', e.target.checked)} />
              I&apos;m not sure yet, please recommend a size
            </label>
          </div>
        )}

        {f.step === 4 && (
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="hd h3">Choose your backing</legend>
            <p className="hint">Backing is free on every order.</p>
            <div className="ogrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
              {BACKINGS.map((b) => opt('backing', b.label, b.desc))}
            </div>
          </fieldset>
        )}

        {f.step === 5 && (
          <div>
            <h3 className="hd h3">Upload your artwork</h3>
            <p className="hint">Upload your logo, artwork, sketch or reference image. PNG, JPG, PDF, AI, EPS or SVG, up to {MAX_MB} MB each.</p>
            <label
              className={`drop${drag ? ' drag' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer?.files || null); }}
            >
              <input type="file" multiple accept=".png,.jpg,.jpeg,.pdf,.ai,.eps,.svg,image/*,application/pdf" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              <span className="i3 s64 i-upload" aria-hidden="true" />
              <strong style={{ fontSize: 18 }}>Tap to upload or drag your files here</strong>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>Photos from your phone work too</span>
            </label>
            {files.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }} aria-live="polite">
                {files.map((x) => (
                  <li key={x.id} className={`file${x.state === 'error' ? ' err' : ''}`}>
                    {x.preview && <img src={x.preview} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="nm">{x.name}</div>
                      <div className="meta">
                        {fmtSize(x.size)} {x.state === 'uploading' && `, uploading ${x.progress}%`}
                        {x.state === 'done' && ', uploaded'}
                        {x.state === 'error' && <span style={{ color: '#B42318', fontWeight: 700 }}>, {x.error}</span>}
                      </div>
                      {x.state === 'uploading' && <div className="prog"><div style={{ width: `${x.progress}%` }} /></div>}
                    </div>
                    {x.state === 'error' && fileObjs.current.get(x.id) && (
                      <button type="button" className="retry" onClick={() => upload(x, fileObjs.current.get(x.id)!)}>Retry</button>
                    )}
                    <button type="button" className="x" aria-label={`Remove ${x.name}`} onClick={() => { fileObjs.current.delete(x.id); setFiles((l) => l.filter((y) => y.id !== x.id)); }}>x</button>
                  </li>
                ))}
              </ul>
            )}
            <label className="chk" style={{ marginTop: 16 }}>
              <input type="checkbox" checked={f.noArt} onChange={(e) => set('noArt', e.target.checked)} />
              I don&apos;t have artwork yet, I need design help
            </label>
            <label className="fld" style={{ marginTop: 14 }}>
              Email, so we can send your free mockup
              <input className="inp" style={{ maxWidth: 440 }} type="email" autoComplete="email" placeholder="you@company.com" value={f.email} onChange={(e) => set('email', e.target.value)} {...inv('email')} />
            </label>
          </div>
        )}

        {f.step === 6 && (
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="hd h3 mb">When do you need your patches?</legend>
            <div className="ogrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {DEADLINES.map((d) => opt('deadline', d))}
            </div>
            {f.deadline === 'Specific deadline' && (
              <label className="fld" style={{ marginTop: 16 }}>
                Your deadline
                <input className="inp" style={{ maxWidth: 260 }} type="date" min={new Date().toISOString().slice(0, 10)} value={f.date} onChange={(e) => set('date', e.target.value)} {...inv('date')} />
              </label>
            )}
            <label className="fld" style={{ marginTop: 18 }}>
              Anything else we should know? (optional)
              <textarea className="inp" rows={4} maxLength={3000} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Tell us about colors, special requirements, intended use, packaging or anything else that may help us quote your project." />
            </label>
          </fieldset>
        )}

        {f.step === 7 && (
          <div>
            <h3 className="hd h3 mb">Where should we send your quote?</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
              <label className="fld">First name<input className="inp" type="text" autoComplete="given-name" value={f.first} onChange={(e) => set('first', e.target.value)} {...inv('first')} /></label>
              <label className="fld">Last name<input className="inp" type="text" autoComplete="family-name" value={f.last} onChange={(e) => set('last', e.target.value)} {...inv('last')} /></label>
              <label className="fld">Business name (optional)<input className="inp" type="text" autoComplete="organization" value={f.biz} onChange={(e) => set('biz', e.target.value)} /></label>
              <label className="fld">Email<input className="inp" type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} {...inv('email')} /></label>
              <label className="fld">
                WhatsApp number
                <span style={{ display: 'flex', gap: 8 }}>
                  <select className="inp" aria-label="Country code" style={{ width: 112, flex: '0 0 112px', paddingLeft: 10, paddingRight: 4 }} value={f.cc || '+1'} onChange={(e) => set('cc', e.target.value)}>
                    {DIAL_CODES.map((d) => (
                      <option key={d.code} value={d.code}>{d.label}</option>
                    ))}
                  </select>
                  <input className="inp" type="tel" autoComplete="tel-national" placeholder="(555) 123 4567" value={f.phone} onChange={(e) => set('phone', e.target.value)} {...inv('phone')} />
                </span>
                <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--muted)' }}>We send your quote and mockup on WhatsApp. Another country? Pick its code, or type the full number starting with +.</span>
              </label>
            </div>
            <p style={{ margin: '18px 0 10px', fontWeight: 700, fontSize: 14 }} id="ct-l">How should we contact you?</p>
            <div className="ogrid" role="group" aria-labelledby="ct-l" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {CONTACT_METHODS.map((c) => opt('contact', c))}
            </div>
            <label style={{ marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.45, cursor: 'pointer' }}>
              <input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} style={{ width: 22, height: 22, marginTop: 1, accentColor: 'var(--red)', flexShrink: 0 }} {...inv('consent')} />
              <span>
                I agree that {BUSINESS.name} may contact me by phone, SMS, WhatsApp or email about this quote. Message and data rates may apply. See our{' '}
                <a href={withBase('/privacy')}>Privacy Policy</a> and <a href={withBase('/terms')}>Terms</a>.
              </span>
            </label>
            <div ref={tsRef} style={{ marginTop: 12 }} />
          </div>
        )}

        {err && <p className="alert" role="alert" id="q-err">{err}</p>}

        <div className="navrow">
          {f.step > 1 && <button type="button" className="back" onClick={back}>Back</button>}
          {f.step < 7 && <button type="button" className="next" onClick={next}>Continue<span className="arr" aria-hidden="true">→</span></button>}
          {f.step === 7 && (
            <button type="button" className="submit" onClick={submit} disabled={busy} aria-busy={busy}>
              {busy ? 'Sending your request...' : <>Request my free quote<span className="arr" aria-hidden="true">→</span></>}
            </button>
          )}
        </div>
        {f.step === 7 && (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>
            Your information is only used to prepare and follow up on your custom patch quotation.
          </p>
        )}
      </div>

      <aside className="aside" aria-label="Your patch summary">
        <strong className="hd" style={{ fontSize: 20 }}>Your patch</strong>
        {rows.length === 0 && <p style={{ margin: '10px 0 0', color: 'var(--muted)', fontSize: 15 }}>Your choices appear here as you go.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
          {rows.map((r) => (
            <div className="srow" key={r.k}><span>{r.k}</span><strong>{r.v}</strong></div>
          ))}
        </div>
        <div className="incl">
          <span>Included free with every order:</span>
          <span style={{ fontWeight: 400 }}>Design, mockup within 24 hours, unlimited design revisions and shipping. No minimum order, backed by our money back guarantee.</span>
        </div>
      </aside>
    </div>
  );
}
