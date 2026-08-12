import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  devIndicators: false,
  // 通用子路径部署配置；仅描述路由挂载位置，不用于识别 Author 官方网站。
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
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
