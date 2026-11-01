'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { endSession, isAdmin, passwordMatches, startSession } from '@/lib/admin-auth';
import { db, rateLimit } from '@/lib/supabase';

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

const leadUpdate = z.object({
  id: z.string().uuid(),
  lead_status: z.enum(['new', 'contacted', 'quoted', 'won', 'lost']),
  owner_notes: z.string().max(3000),
});

export async function updateLead(form: FormData): Promise<void> {
  if (!(await isAdmin())) redirect('/admin/login');
  const parsed = leadUpdate.safeParse({
    id: form.get('id'),
    lead_status: form.get('lead_status'),
    owner_notes: String(form.get('owner_notes') || ''),
  });
  if (!parsed.success) return;
  const { id, ...patch } = parsed.data;
  await db().from('quote_requests').update(patch).eq('id', id);
  revalidatePath('/admin');
}
