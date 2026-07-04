import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  devIndicators: false,
  // 子路径部署（官方 free.author2.com/app）时由构建时 env 注入；开源分发留空 = 根路径、行为不变。
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  // pdf-parse / word-extractor 仅在服务端 API 路由中使用，标记为外部包避免打包解析
  serverExternalPackages: ['pdf-parse', 'word-extractor'],
  outputFileTracingExcludes: {
    '*': [
      'mobile/**/*',
      'docs/**/*',
      '.idea/**/*',
      '.agent/**/*',
      '.venv/**/*',
      'build/**/*',
      'dist/**/*',
      'dist-*',
      'dist-*/**/*',
      'local-clients-v*',
      'local-clients-v*/**/*'
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
