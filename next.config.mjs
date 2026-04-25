/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  devIndicators: false,
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
      'dist/**/*'
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
