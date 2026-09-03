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
        <div className="flex items-end gap-2">
          <div>
            <label className="text-sm font-medium block mb-1">{t('kind')}</label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="w-40">
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
          <input ref={fileRef} type="file" className="text-sm" />
          <Button onClick={onUpload} disabled={uploading}>
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
                className="flex items-center justify-between border rounded-md p-2 text-sm"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-xs px-2 py-0.5 rounded bg-muted">
                    {t(`kinds.${a.kind}` as any)}
                  </span>
                  <span className="truncate">{a.filename ?? a.blob_url}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(a.uploaded_at, (locale ?? 'es') as AppLocale)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={a.blob_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 hover:bg-accent rounded"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => onDelete(a.id)}
                    className="p-1 hover:bg-accent rounded text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
