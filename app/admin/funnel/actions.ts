'use server';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin-auth';
import { saveSettings } from '@/lib/funnel/load';
import { DEFAULT_SETTINGS, mergeSettings, type SettingKey } from '@/lib/funnel/settings';

export async function saveFunnelSettings(_prev: string, form: FormData): Promise<string> {
  if (!(await isAdmin())) redirect('/admin/login');
  if (form.get('reset') === '1') {
    await saveSettings({ ...DEFAULT_SETTINGS });
    return 'Thresholds reset to the defaults.';
  }
  const raw: Record<string, number> = {};
  for (const k of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) raw[k] = Number(form.get(k));
  try {
    await saveSettings(mergeSettings(raw));
    return 'Saved. The dashboard uses the new thresholds from the next refresh.';
  } catch (e) {
    return e instanceof Error ? e.message : 'Saving failed.';
  }
}
