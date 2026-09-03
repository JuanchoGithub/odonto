import { setRequestLocale } from 'next-intl/server';
import { LoginForm } from '@/components/auth/login-form';

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <LoginForm />
    </div>
  );
}
