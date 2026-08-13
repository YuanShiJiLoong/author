import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));
const isOfficialWebBuild = process.env.NEXT_PUBLIC_DEPLOYMENT_TARGET === 'official-web';
const isVercelBuild = process.env.VERCEL === '1';
const isDevelopment = process.env.NODE_ENV === 'development';

const officialWebSecurityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "media-src 'self' data: blob: https:",
      "worker-src 'self' blob:",
      "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com",
      "manifest-src 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel uses its native Next.js build output. Standalone remains enabled
  // for Electron, Docker, and self-hosted deployments.
  output: isVercelBuild ? undefined : 'standalone',
  poweredByHeader: false,
  devIndicators: false,
  // Electron uses localhost, while local browser checks may use 127.0.0.1.
  // Keep this exception development-only; it does not affect production headers.
  allowedDevOrigins: isDevelopment ? ['127.0.0.1'] : undefined,
  // 通用子路径部署配置；仅描述路由挂载位置，不用于识别 Author 官方网站。
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  async headers() {
    if (!isOfficialWebBuild) return [];
    return [{ source: '/:path*', headers: officialWebSecurityHeaders }];
  },
  // pdf-parse / word-extractor 仅在服务端 API 路由中使用，标记为外部包避免打包解析
  serverExternalPackages: ['pdf-parse', 'word-extractor'],
  outputFileTracingExcludes: {
    '*': [
      '.git',
      '.git/**/*',
      '.env*',
      '.agent',
      '.agent/**/*',
      '.codex',
      '.codex/**/*',
      '.gemini',
      '.gemini/**/*',
      '.tmp',
      '.tmp/**/*',
      'author-*',
      'author-*/**/*',
      'data',
      'data/**/*',
      'logs',
      'logs/**/*',
      '*.log',
      '**/*.log',
      '*.key',
      '**/*.key',
      '*.pem',
      '**/*.pem',
      'CLAUDE.md',
      'mcp_config.json',
      'mobile',
      'mobile/**/*',
      'mobile_ios',
      'mobile_ios/**/*',
      'docs',
      'docs/**/*',
      '.idea/**/*',
      '.venv/**/*',
      'build/**/*',
      'dist/**/*',
      'dist-*',
      'dist-*/**/*',
      'local-clients-v*',
      'local-clients-v*/**/*',
      '方案*',
      '方案*/**/*',
      '计划*',
      '计划*/**/*',
      '*草稿*',
      '*草稿*/**/*',
      '*draft*',
      '*draft*/**/*'
    ],
  },
  outputFileTracingIncludes: {
    '*': [
      'node_modules/next/dist/**/*',
    ],
  },
  // 提高请求体大小限制，避免大 PDF/DOC 文件上传时返回 413
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
