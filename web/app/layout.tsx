import type { Metadata } from 'next';
import { Assistant, DM_Mono, Suez_One } from 'next/font/google';
import './globals.css';

/*
 * Three faces, three jobs. Suez One is the display voice for destination names,
 * Assistant carries Hebrew UI text at every size, and DM Mono sets times and
 * flight codes in a departure-board register.
 */
const display = Suez_One({ weight: '400', subsets: ['hebrew', 'latin'], variable: '--font-display' });
const body = Assistant({ weight: ['300', '400', '600', '700'], subsets: ['hebrew', 'latin'], variable: '--font-body' });
const mono = DM_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'מחירון',
  description: 'מעקב מחירים לחופשות — טיסות ומלונות במקום אחד',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="he" dir="rtl" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
