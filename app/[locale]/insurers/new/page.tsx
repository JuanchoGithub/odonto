import { setRequestLocale, getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InsurerForm } from '@/components/insurers/insurer-form';

export default async function NewInsurerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser();
  const t = await getTranslations('insurers');

  return (
    <div className="container py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{t('new')}</CardTitle>
        </CardHeader>
        <CardContent>
          <InsurerForm />
        </CardContent>
      </Card>
    </div>
  );
}
