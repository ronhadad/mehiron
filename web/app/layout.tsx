import type { Metadata } from 'next';
import { Frank_Ruhl_Libre, Heebo } from 'next/font/google';
import './globals.css';

/*
 * The two faces the design uses: Frank Ruhl Libre for the display voice — the
 * wordmark, page titles, destination names — and Heebo for everything else.
 */
const display = Frank_Ruhl_Libre({
  weight: ['400', '500', '700'],
  subsets: ['hebrew', 'latin'],
  variable: '--font-display',
});
const body = Heebo({
  weight: ['400', '500', '600', '700'],
  subsets: ['hebrew', 'latin'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'מחירון',
  description: 'מעקב מחירים לחופשות — טיסות ומלונות במקום אחד',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="he" dir="rtl" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
