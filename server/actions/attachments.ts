'use server';
import { revalidatePath } from 'next/cache';
import { put, del } from '@vercel/blob';
import { query, queryOne } from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { uid, nowIso } from '@/lib/utils';
import { z } from 'zod';

const MetaSchema = z.object({
  patient_id: z.string().min(1),
  kind: z.enum(['xray', 'photo', 'doc', 'consent', 'other']),
  filename: z.string().optional(),
});

export async function uploadAttachment(formData: FormData) {
  const user = await requireUser();
  const file = formData.get('file') as File | null;
  if (!file) return { error: 'No file' };
  const meta = MetaSchema.safeParse({
    patient_id: formData.get('patient_id'),
    kind: formData.get('kind'),
    filename: file.name,
  });
  if (!meta.success) return { error: 'Invalid' };

  const blob = await put(
    `patients/${meta.data.patient_id}/${meta.data.kind}/${Date.now()}-${file.name}`,
    file,
    { access: 'public' },
  );

  const id = uid();
  await query(
    `INSERT INTO attachments (id, patient_id, blob_url, blob_pathname, kind, filename, uploaded_by, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      meta.data.patient_id,
      blob.url,
      blob.pathname,
      meta.data.kind,
      file.name,
      user.id,
      nowIso(),
    ],
  );
  revalidatePath(`/patients/${meta.data.patient_id}`);
  return { ok: true, id, url: blob.url };
}

export async function deleteAttachment(id: string) {
  const user = await requireUser();
  const a = await queryOne<{ patient_id: string; blob_pathname: string }>(
    'SELECT patient_id, blob_pathname FROM attachments WHERE id = ?',
    [id],
  );
  if (a) {
    try {
      await del(a.blob_pathname);
    } catch {
      // ignore if blob not found
    }
    await query('DELETE FROM attachments WHERE id = ?', [id]);
    revalidatePath(`/patients/${a.patient_id}`);
  }
}

export type Attachment = {
  id: string;
  patient_id: string;
  blob_url: string;
  kind: string;
  filename: string | null;
  uploaded_at: string;
};

export async function listAttachments(patientId: string) {
  return query<Attachment>(
    'SELECT id, patient_id, blob_url, kind, filename, uploaded_at FROM attachments WHERE patient_id = ? ORDER BY uploaded_at DESC',
    [patientId],
  );
}
