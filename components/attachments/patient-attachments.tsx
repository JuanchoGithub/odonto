'use client';
import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, Upload, ExternalLink } from 'lucide-react';
import { uploadAttachment, deleteAttachment, type Attachment } from '@/server/actions/attachments';
import { useRouter } from '@/lib/navigation';
import { formatDateTime } from '@/lib/format';
import type { AppLocale } from '@/lib/schemas/common';

export function PatientAttachments({
  patientId,
  locale,
}: {
  patientId: string;
  locale?: AppLocale;
}) {
  const t = useTranslations('attachments');
  const tCommon = useTranslations('common');
  const [kind, setKind] = useState('doc');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [rows, setRows] = useState<Attachment[] | null>(null);

  useEffect(() => {
    fetch(`/api/attachments?patient_id=${patientId}`)
      .then((r) => r.json())
      .then(setRows);
  }, [patientId]);

  async function onUpload() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    setUploading(true);
    const fd = new FormData();
    fd.set('file', f);
    fd.set('patient_id', patientId);
    fd.set('kind', kind);
    await uploadAttachment(fd);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    const fresh = await fetch(`/api/attachments?patient_id=${patientId}`).then((r) =>
      r.json(),
    );
    setRows(fresh);
    router.refresh();
  }

  async function onDelete(id: string) {
    await deleteAttachment(id);
    const fresh = await fetch(`/api/attachments?patient_id=${patientId}`).then((r) =>
      r.json(),
    );
    setRows(fresh);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div>
            <label className="text-sm font-medium block mb-1">{t('kind')}</label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xray">{t('kinds.xray')}</SelectItem>
                <SelectItem value="photo">{t('kinds.photo')}</SelectItem>
                <SelectItem value="doc">{t('kinds.doc')}</SelectItem>
                <SelectItem value="consent">{t('kinds.consent')}</SelectItem>
                <SelectItem value="other">{t('kinds.other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground sm:w-auto sm:flex-1">
            {fileRef.current?.files?.[0]?.name ?? t('upload')}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const lbl = e.currentTarget.parentElement;
                if (lbl && e.target.files?.[0]) {
                  lbl.textContent = e.target.files[0].name;
                }
              }}
            />
          </label>
          <Button
            onClick={onUpload}
            disabled={uploading}
            className="min-h-[44px] w-full sm:w-auto"
          >
            <Upload className="h-4 w-4" />
            {uploading ? tCommon('loading') : t('upload')}
          </Button>
        </div>
        <div className="space-y-2">
          {!rows ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            rows.map((a) => (
              <div
                key={a.id}
                className="flex min-h-[64px] items-center gap-2 rounded-xl border p-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">
                    {a.filename ?? a.blob_url}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      {t(`kinds.${a.kind}` as any)}
                    </span>
                    <span>{formatDateTime(a.uploaded_at, (locale ?? 'es') as AppLocale)}</span>
                  </span>
                </span>
                <a
                  href={a.blob_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t('upload')}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md hover:bg-accent"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => onDelete(a.id)}
                  aria-label={tCommon('delete')}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-destructive hover:bg-accent"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
