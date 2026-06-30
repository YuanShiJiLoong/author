// ==================== 上游地址安全校验（SSRF 防护）====================
// 用于 AI 代理路由群：在服务端 fetch 用户可控的 baseUrl / endpoint 之前，
// 校验协议与目标主机，拒绝指向本机/内网/保留段/云元数据的地址，
// 避免匿名访客把服务器当作开放代理探测内网或窃取云元数据。
//
// 设计与 app/api/sync/webdav/route.js 的 isLocalHost()/isLocalRequest() 思路一致：
// 仅当请求来自本机时才允许私网目标（本机开发联调本地模型）；
// 公网部署下私网/保留地址一律拒绝。
// 仅允许 http/https 协议；生产环境（非本机请求）强制 https 不在此处硬性要求，
// 以兼容部分自建中转的 http，但保留地址与元数据地址在任何情况下都拒绝。

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

// 判断主机名是否为私网/保留/元数据地址
function isPrivateHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return true;
    if (LOOPBACK_HOSTNAMES.has(host)) return true;
    if (host.endsWith('.local') || host.endsWith('.internal')) return true;

    // IPv4 私网/保留段
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    if (/^169\.254\./.test(host)) return true;          // 链路本地 + 云元数据 169.254.169.254
    if (/^0\./.test(host)) return true;
    if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./.test(host)) return true; // CGNAT 100.64/10
    if (/^198\.(1[8-9])\./.test(host)) return true;      // 198.18/15 基准测试
    if (/^255\./.test(host)) return true;                // 广播

    // IPv6 私网/保留/链路本地
    if (host === '::' || host === '::1') return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;   // ULA
    if (host.startsWith('fe80')) return true;                          // 链路本地
    if (host.startsWith('::ffff:')) {
        // IPv4-mapped IPv6，取出内嵌 IPv4 再判一次
        const v4 = host.slice('::ffff:'.length);
        if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return isPrivateHost(v4);
    }
    return false;
}

// 判断本次请求是否来自本机/内网（参考 webdav/route.js 的 isLocalRequest，
// 并叠加 Host 头校验：若客户端 Host 头显式指向公网域名，则视为公网请求，
// 避免本地伪造 Host 头绕过；生产环境 request.url 通常已是公网域名，同样判为非本机）
function isLocalRequest(requestUrl, hostHeader) {
    let urlHost = '';
    try {
        urlHost = new URL(requestUrl).hostname;
    } catch {
        urlHost = '';
    }
    const headerHost = String(hostHeader || '').split(':')[0].trim();

    // request.url 的主机名判本机/内网
    const urlIsLocal = urlHost ? isPrivateHost(urlHost) : false;
    // Host 头存在且为公网域名 → 视为公网请求
    const headerIsPublic = headerHost ? !isPrivateHost(headerHost) : false;

    if (headerIsPublic) return false;
    return urlIsLocal || (LOOPBACK_HOSTNAMES.has(headerHost));
}

/**
 * 校验用户提供的上游 URL 是否允许服务端发起请求。
 * @param {string} rawUrl  用户可控的 baseUrl / endpoint
 * @param {Request} request  当前请求对象（用于判断是否本机调用，决定是否放行私网）
 * @returns {{ ok: true, url: string } | { ok: false, status: number, code: string, error: string }}
 */
export function assertUpstreamUrl(rawUrl, request) {
    const raw = String(rawUrl || '').trim();
    if (!raw) {
        return { ok: false, status: 400, code: 'NO_BASE_URL', error: '请先填写上游 API 地址' };
    }

    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        return { ok: false, status: 400, code: 'INVALID_UPSTREAM_URL', error: '上游 API 地址格式无效' };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { ok: false, status: 400, code: 'UPSTREAM_UNSUPPORTED_SCHEME', error: '上游地址只支持 http 或 https' };
    }

    if (isPrivateHost(parsed.hostname)) {
        // 仅当请求来自本机时允许私网目标（本机开发联调本地模型）
        const fromLocal = request ? isLocalRequest(request.url, request.headers?.get?.('host')) : false;
        if (!fromLocal) {
            return {
                ok: false,
                status: 400,
                code: 'UPSTREAM_PRIVATE_BLOCKED',
                error: '上游地址指向本机或内网/保留地址，公网部署不允许代理访问',
            };
        }
    }

    return { ok: true, url: parsed.toString() };
}
