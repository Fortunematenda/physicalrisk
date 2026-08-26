import type { Metadata } from 'next';
import { Inter, Nunito_Sans } from 'next/font/google';
import { ConfirmProvider } from '@/components/confirm-dialog';
import { PortalFrame } from '@/components/PortalFrame';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const nunitoSans = Nunito_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-nunito-sans',
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: 'MOSS',
  description: 'Management Operating Security System — Physical Risk Consultancy',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${nunitoSans.variable} font-sans`}>
        <ToastProvider>
          <ConfirmProvider>
            <PortalFrame>{children}</PortalFrame>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
