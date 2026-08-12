// ==================== 构建目标 ====================
// 默认始终是开源 / 自部署版本。只有 Author 官方腾讯云构建才显式设置：
// NEXT_PUBLIC_DEPLOYMENT_TARGET=official-web
//
// BASE_PATH 只描述 URL 挂载位置，不能用来判断是否为官网；任意自部署用户也可能
// 把应用挂在 /app 等子路径下。

export const DEPLOYMENT_TARGET = String(
    process.env.NEXT_PUBLIC_DEPLOYMENT_TARGET || 'open-source',
).trim().toLowerCase();

export const IS_OFFICIAL_WEB = DEPLOYMENT_TARGET === 'official-web';

