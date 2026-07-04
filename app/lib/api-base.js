// ==================== 内部 API 基址 ====================
// 子路径部署（如官方 free.author2.com/app，basePath=/app）时，客户端 fetch('/api/...')
// 不会自动带上 basePath 前缀，会打到根路径 404。所以所有对本应用内部 API 路由的调用
// 都经此工具补前缀。
//
// 开源分发：NEXT_PUBLIC_BASE_PATH 留空 → apiPath 原样返回，行为与现在完全一致，不接任何服务器。
// 官方 /app 版：构建时 NEXT_PUBLIC_BASE_PATH=/app → 自动补成 '/app/api/...'。

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** 给应用内部路径（'/api/...'）补上 basePath 前缀；无 basePath 时原样返回。 */
export function apiPath(path) {
    if (!BASE_PATH || typeof path !== 'string' || !path.startsWith('/')) return path;
    return `${BASE_PATH}${path}`;
}

// ==================== 官方网页版入口 ====================
// 公开产品地址（非密钥），供开源 / 桌面 / 移动版引导用户前往官方云同步网页版。
// 官方云同步服务因合规要求（备案主体绑定）目前先在此网页版上线。
export const OFFICIAL_APP_URL = process.env.NEXT_PUBLIC_OFFICIAL_APP_URL || 'https://free.author2.com/app';

// 页脚版权署名（「© {年份} {署名}. All rights reserved.」；不设置则不显示版权行）
export const COPYRIGHT_NAME = process.env.NEXT_PUBLIC_COPYRIGHT_NAME || '';

// ==================== 备案信息（设置了才显示） ====================
// 中国大陆公网部署的合规要求：页面展示 ICP 备案号并链接工信部。
// 仅当构建时设置了 NEXT_PUBLIC_ICP_BEIAN 才渲染（部署方填自己的备案号）；
// 不设置 → 页面无任何备案痕迹。
export const ICP_BEIAN = process.env.NEXT_PUBLIC_ICP_BEIAN || '';
export const ICP_BEIAN_URL = process.env.NEXT_PUBLIC_ICP_BEIAN_URL || 'https://beian.miit.gov.cn/';
// 公安网备（可选，格式如「京公网安备 11010802XXXXXX号」）
export const POLICE_BEIAN = process.env.NEXT_PUBLIC_POLICE_BEIAN || '';
export const POLICE_BEIAN_URL = process.env.NEXT_PUBLIC_POLICE_BEIAN_URL || '';
