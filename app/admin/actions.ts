'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { endSession, isAdmin, passwordMatches, startSession } from '@/lib/admin-auth';
import { db, rateLimit } from '@/lib/supabase';
import { env } from '@/lib/env';
import { addNote, removeNote, MAX_NOTE_LENGTH } from '@/lib/notes';

export async function login(_prev: string, form: FormData): Promise<string> {
  const ip = ((await headers()).get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (!(await rateLimit(`admin-login:${ip}`, 8, 900))) return 'Too many tries. Wait 15 minutes.';
  if (!passwordMatches(String(form.get('password') || ''))) return 'Wrong password.';
  await startSession();
  redirect('/admin');
}

export async function logout(): Promise<void> {
  await endSession();
  redirect('/admin/login');
}

const id = z.string().uuid();
const STATUS = z.enum(['new', 'contacted', 'quoted', 'won', 'lost']);

async function guard(): Promise<void> {
  if (!(await isAdmin())) redirect('/admin/login');
}

// One tap moves the lead to another stage, like dragging a card in a CRM pipeline.
export async function moveLead(form: FormData): Promise<void> {
  await guard();
  const parsed = z.object({ id, lead_status: STATUS }).safeParse({ id: form.get('id'), lead_status: form.get('lead_status') });
  if (!parsed.success) return;
  await db().from('quote_requests').update({ lead_status: parsed.data.lead_status }).eq('id', parsed.data.id);
  revalidatePath('/admin');
}

export async function addLeadNote(form: FormData): Promise<void> {
  await guard();
  const parsed = z.object({ id, text: z.string().trim().min(1).max(MAX_NOTE_LENGTH) }).safeParse({ id: form.get('id'), text: String(form.get('text') || '') });
  if (!parsed.success) return;
  const { data } = await db().from('quote_requests').select('owner_notes').eq('id', parsed.data.id).maybeSingle();
  if (!data) return;
  await db().from('quote_requests').update({ owner_notes: addNote(data.owner_notes, parsed.data.text) }).eq('id', parsed.data.id);
  revalidatePath('/admin');
}

export async function deleteLeadNote(form: FormData): Promise<void> {
  await guard();
  const parsed = z.object({ id, index: z.coerce.number().int().min(0) }).safeParse({ id: form.get('id'), index: form.get('index') });
  if (!parsed.success) return;
  const { data } = await db().from('quote_requests').select('owner_notes').eq('id', parsed.data.id).maybeSingle();
  if (!data) return;
  await db().from('quote_requests').update({ owner_notes: removeNote(data.owner_notes, parsed.data.index) }).eq('id', parsed.data.id);
  revalidatePath('/admin');
}

// Deletes the lead for good, with its artwork and quote PDF in storage.
export async function deleteLead(form: FormData): Promise<void> {
  await guard();
  const parsed = id.safeParse(form.get('id'));
  if (!parsed.success) return;
  const { data } = await db().from('quote_requests').select('files, pdf_path').eq('id', parsed.data).maybeSingle();
  if (!data) return;
  const row = data as { files: { path: string }[] | null; pdf_path: string | null };
  const paths = [...(row.files || []).map((f) => f.path), row.pdf_path].filter((p): p is string => !!p);
  if (paths.length) await db().storage.from(env.artworkBucket()).remove(paths);
  await db().from('quote_requests').delete().eq('id', parsed.data);
  revalidatePath('/admin');
}
