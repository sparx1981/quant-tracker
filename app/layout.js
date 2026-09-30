import './globals.css';

export const metadata = {
  title: 'Quant Tracker · QNT intelligence',
  description: 'Your QNT market dashboard: price, portfolio, momentum, on-chain activity and news.',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' }
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
