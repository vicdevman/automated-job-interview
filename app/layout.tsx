import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { ThemeScript } from '@/components/ui/ThemeScript';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Interview Simulator',
    template: '%s · Interview Simulator',
  },
  description:
    'Practise a spoken job interview with an AI interviewer that asks questions grounded in your actual CV, then scores how you answered.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0F1115' },
    { media: '(prefers-color-scheme: light)', color: '#FBFBFC' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={geist.variable}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
