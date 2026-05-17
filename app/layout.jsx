import './globals.css';

export const metadata = {
  title: 'IPM Platform — Integrated Personality Modeling',
  description: 'Dialog-native neurochemical personality profiling',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Instrument+Serif&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
