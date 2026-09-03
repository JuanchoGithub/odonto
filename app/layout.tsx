import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Odonto',
  description: 'Dental clinic management',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
