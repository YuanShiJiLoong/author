'use client';

import "./globals.css";
import { BASE_PATH, apiPath } from './lib/api-base';
import { useEffect, useState } from "react";
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import FirebaseAnalytics from './components/FirebaseAnalytics';

// 内联脚本：在 HTML 解析阶段同步读取 theme，避免 hydration 不匹配和闪烁
const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('author-theme') || 'light';
    document.documentElement.setAttribute('data-theme', t);
    var v = localStorage.getItem('author-visual');
    if (v) document.documentElement.setAttribute('data-visual', v);
    var wf = localStorage.getItem('author-writing-font-family');
    if (wf && wf.length < 240 && !/[;{}]/.test(wf)) {
      document.documentElement.style.setProperty('--font-writing', wf);
    }
  } catch(e) {}
})();
`;

export default function RootLayout({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <title>Author - AI辅助创作平台</title>
        <meta name="description" content="面向小说创作者的AI辅助写作工具，让创作更自由" />
        <link
          rel="stylesheet"
          href={apiPath('/katex/katex.min.css')}
        />
        <style dangerouslySetInnerHTML={{ __html: `:root{--brand-feather:url("${BASE_PATH}/brand/feather-logo.svg");--brand-wordmark:url("${BASE_PATH}/brand/author-wordmark.svg")}` }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        {children}
        <FirebaseAnalytics />
        {/* Vercel 统计仅在 Vercel 平台部署时有意义;其余部署(官方 /app、自托管、桌面)不加载其脚本 */}
        {process.env.NEXT_PUBLIC_VERCEL_URL ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
