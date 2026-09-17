import type { Metadata, Viewport } from 'next';
import { Instrument_Sans } from 'next/font/google';
import { ThemeScript } from '@/components/ui/ThemeScript';
import './globals.css';
import PixelBlast from '@/components/ui/pixelBlast';

const geist = Instrument_Sans({
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
      <body className="min-h-dvh antialiased">
          {/* Interactive Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div style={{ width: '100%', height: '100%', position: 'fixed' }}>
          <PixelBlast
            variant="square"
            pixelSize={1}
            color="#4f7bff"
            opacity={0.15}
            patternScale={2}
            patternDensity={1}
            pixelSizeJitter={0}
            enableRipples={true}
            rippleSpeed={0.005}
            rippleThickness={0.12}
            rippleIntensityScale={1.5}
            liquid={false}
            liquidStrength={0.12}
            liquidRadius={1.2}
            liquidWobbleSpeed={5}
            speed={0.5}
            edgeFade={0.25}
            transparent
            className="absolute inset-0"
          />
        </div>
      </div>
        {children}</body>
    </html>
  );
}
