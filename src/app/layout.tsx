import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import SecurityProvider from '@/components/SecurityProvider';
import BrandingThemeProvider from '@/components/BrandingThemeProvider';
import ChunkErrorRecovery from '@/components/ChunkErrorRecovery';

export const metadata: Metadata = {
  title: 'Wave Tracker',
  description: 'Manage participants and their Wave performance.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light" />
      </head>
      <body className="font-sans bg-gray-50 text-gray-900" suppressHydrationWarning>
        <SecurityProvider>
          <BrandingThemeProvider />
          <ChunkErrorRecovery />
          {children}
        </SecurityProvider>
      </body>
    </html>
  );
}
