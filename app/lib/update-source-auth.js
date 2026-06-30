import crypto from 'crypto';

// ==================== 管理令牌校验 ====================
// 用于保护源码热更新等高危管理接口，避免匿名访客触发 git pull / npm install / build。
//
// 用法：在 .env.local 设置 UPDATE_SOURCE_TOKEN=<你自己的长随机串>，
// 调用接口时通过 Authorization: Bearer <token> 或 x-update-token 头携带。
// 未设置该环境变量时，接口默认拒绝（403），避免裸奔部署。

/**
 * 校验请求携带的管理令牌是否与环境变量 UPDATE_SOURCE_TOKEN 匹配。
 * @param {Request} request
 * @returns {{ ok: true } | { ok: false, status: number, code: string, error: string }}
 */
export function assertUpdateToken(request) {
    const expected = process.env.UPDATE_SOURCE_TOKEN;
    if (!expected) {
        return {
            ok: false,
            status: 403,
            code: 'UPDATE_TOKEN_NOT_CONFIGURED',
            error: '更新接口未配置访问令牌（UPDATE_SOURCE_TOKEN），已拒绝访问。请在服务端设置该环境变量后再使用。',
        };
    }

    const authHeader = request.headers.get('authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const headerToken = request.headers.get('x-update-token') || '';
    const provided = bearer || headerToken;

    if (!provided) {
        return {
            ok: false,
            status: 401,
            code: 'UPDATE_TOKEN_REQUIRED',
            error: '更新接口需要访问令牌。请通过 Authorization: Bearer <token> 或 x-update-token 头携带。',
        };
    }

    // 常量时间比较，避免时序侧信道
    const a = Buffer.from(String(provided));
    const b = Buffer.from(String(expected));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return {
            ok: false,
            status: 403,
            code: 'UPDATE_TOKEN_INVALID',
            error: '访问令牌无效。',
        };
    }

    return { ok: true };
}
