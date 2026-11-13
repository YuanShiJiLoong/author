import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

const OFFICIAL_WEB = process.env.NEXT_PUBLIC_DEPLOYMENT_TARGET === 'official-web';
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

export class OutboundRequestBlockedError extends Error {
    constructor(message = '官网服务端只允许连接公网 HTTP(S) 地址') {
        super(message);
        this.name = 'OutboundRequestBlockedError';
        this.code = 'OUTBOUND_REQUEST_BLOCKED';
    }
}

export class ServerCredentialBlockedError extends Error {
    constructor(message = '服务端托管密钥不能用于此请求；请在客户端配置自己的 API Key') {
        super(message);
        this.name = 'ServerCredentialBlockedError';
        this.code = 'SERVER_CREDENTIAL_BLOCKED';
    }
}

export function isOfficialWebServer() {
    return OFFICIAL_WEB;
}

// 可信自部署（如 NAS 上的 Docker）连同机/局域网的本地模型、WebDAV 用。
// 部署者显式开启才生效；官网构建一律忽略。
export function isPrivateNetworkAllowedByDeployment() {
    if (OFFICIAL_WEB) return false;
    return /^(1|true)$/i.test(String(process.env.AUTHOR_ALLOW_PRIVATE_NETWORK || '').trim());
}

const PRIVATE_NETWORK_BLOCKED_MESSAGE = OFFICIAL_WEB
    ? '服务端默认禁止访问本机或内网地址'
    : '服务端默认禁止访问本机或内网地址；自部署需连接本地模型时，请设置环境变量 AUTHOR_ALLOW_PRIVATE_NETWORK=1 后重启';

function constantTimeEqual(left, right) {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function requestCookie(request, name) {
    const cookieHeader = request?.headers?.get?.('cookie') || '';
    for (const part of cookieHeader.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0) continue;
        if (part.slice(0, separator).trim() !== name) continue;
        try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return ''; }
    }
    return '';
}

export function isAuthorizedDesktopRequest(request) {
    const expected = String(process.env.AUTHOR_DESKTOP_CAPABILITY || '');
    const actual = requestCookie(request, 'author-desktop-capability');
    return constantTimeEqual(actual, expected);
}

export function authorizeSourceUpdate(request) {
    const expected = String(process.env.AUTHOR_UPDATE_TOKEN || '');
    if (!expected) {
        return { ok: false, status: 403, code: 'SOURCE_UPDATE_DISABLED' };
    }

    const authorization = String(request?.headers?.get?.('authorization') || '');
    const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const provided = bearer || String(request?.headers?.get?.('x-author-update-token') || '').trim();
    if (!provided) {
        return { ok: false, status: 401, code: 'SOURCE_UPDATE_AUTH_REQUIRED' };
    }
    if (!constantTimeEqual(provided, expected)) {
        return { ok: false, status: 403, code: 'SOURCE_UPDATE_AUTH_INVALID' };
    }
    return { ok: true };
}

function normalizedEndpoint(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

export function resolveAiCredential({ request, clientApiKey, clientBaseUrl, envApiKey, envBaseUrl }) {
    const suppliedKey = String(clientApiKey || '').trim();
    const suppliedBaseUrl = normalizedEndpoint(clientBaseUrl);
    const configuredKey = String(envApiKey || '').trim();
    const configuredBaseUrl = normalizedEndpoint(envBaseUrl);

    if (suppliedKey) {
        return { apiKey: suppliedKey, baseUrl: suppliedBaseUrl || configuredBaseUrl };
    }
    if (!configuredKey) {
        return { apiKey: '', baseUrl: suppliedBaseUrl || configuredBaseUrl };
    }
    if (!isAuthorizedDesktopRequest(request)) {
        throw new ServerCredentialBlockedError();
    }
    if (!configuredBaseUrl) {
        throw new ServerCredentialBlockedError('服务端密钥缺少固定的服务端 API 地址，已拒绝使用');
    }
    if (suppliedBaseUrl && suppliedBaseUrl !== configuredBaseUrl) {
        throw new ServerCredentialBlockedError('服务端密钥只能发送到服务端预设的 API 地址');
    }
    return { apiKey: configuredKey, baseUrl: configuredBaseUrl };
}

export function isServerCredentialBlocked(error) {
    return error?.code === 'SERVER_CREDENTIAL_BLOCKED';
}

function normalizedIp(value) {
    return String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
}

function isPublicIpv4(address) {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    const [a, b, c] = parts;

    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
}

function mappedIpv4(address) {
    const dotted = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (dotted) return dotted[1];
    const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (!hex) return '';
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPublicIpv6(address) {
    const mapped = mappedIpv4(address);
    if (mapped) return isPublicIpv4(mapped);
    if (address === '::' || address === '::1') return false;
    if (/^f[cd]/i.test(address) || /^fe[89ab]/i.test(address) || /^ff/i.test(address)) return false;
    if (/^2001:db8(?::|$)/i.test(address)) return false;
    // Public IPv6 global unicast currently occupies 2000::/3.
    return /^[23][0-9a-f]{3}:/i.test(address);
}

export function isPublicIpAddress(value) {
    const address = normalizedIp(value);
    const family = isIP(address);
    if (family === 4) return isPublicIpv4(address);
    if (family === 6) return isPublicIpv6(address);
    return false;
}

function parseHttpUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || '').trim());
    } catch {
        throw new OutboundRequestBlockedError('API 地址格式无效');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new OutboundRequestBlockedError('服务端只允许连接 HTTP(S) API 地址');
    }
    if (parsed.username || parsed.password) {
        throw new OutboundRequestBlockedError('API 地址中不能包含账号或密码');
    }
    const hostname = normalizedIp(parsed.hostname);
    if (!hostname) throw new OutboundRequestBlockedError('API 地址缺少主机名');
    return parsed;
}

// 代理工具（Clash、Surge 等）的 fake-ip 模式会把域名解析成 198.18.0.0/15 里的假地址，
// 连接时再由代理转发。这段地址不是公网，照样拦截，但单独提示原因和解决办法，免得用户误以为 Key 填错。
export function isFakeIpAddress(address) {
    const ipv4 = mappedIpv4(normalizedIp(address)) || normalizedIp(address);
    return isIP(ipv4) === 4 && /^198\.(18|19)\./.test(ipv4);
}

export const FAKE_IP_BLOCKED_CODE = 'OUTBOUND_FAKE_IP_BLOCKED';

function fakeIpBlockedError(hostname) {
    const error = new OutboundRequestBlockedError(
        `${hostname} 被解析成了 198.18.x.x，这是代理工具 fake-ip 模式给的假地址，服务端按内网地址拦截了。`
        + '可以在代理工具里把这个域名加入 fake-ip 过滤名单（或关闭 TUN / fake-ip），或者设置环境变量 AUTHOR_ALLOW_PRIVATE_NETWORK=1 后重启。'
    );
    error.code = FAKE_IP_BLOCKED_CODE;
    return error;
}

async function lookupPublicAddresses(hostname, family = 0) {
    const host = normalizedIp(hostname);
    if (isIP(host)) {
        if (!isPublicIpAddress(host)) throw new OutboundRequestBlockedError();
        return [{ address: host, family: isIP(host) }];
    }

    const records = await dnsLookup(host, { all: true, verbatim: true });
    const filtered = family === 4 || family === 6
        ? records.filter(record => record.family === family)
        : records;
    if (filtered.length === 0 || filtered.some(record => !isPublicIpAddress(record.address))) {
        // 官网服务端不会装代理工具，也不能用 AUTHOR_ALLOW_PRIVATE_NETWORK，沿用原提示
        if (!OFFICIAL_WEB && filtered.some(record => isFakeIpAddress(record.address))) throw fakeIpBlockedError(host);
        throw new OutboundRequestBlockedError(OFFICIAL_WEB ? undefined : PRIVATE_NETWORK_BLOCKED_MESSAGE);
    }
    return filtered;
}

export async function assertSafeOutboundUrl(rawUrl, options = {}) {
    const parsed = parseHttpUrl(rawUrl);
    if (options.allowPrivateNetwork === true) return parsed;
    const hostname = normalizedIp(parsed.hostname);
    if (hostname === 'localhost' || BLOCKED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))) {
        throw new OutboundRequestBlockedError(PRIVATE_NETWORK_BLOCKED_MESSAGE);
    }
    if (isIP(hostname) && !isPublicIpAddress(hostname)) {
        throw new OutboundRequestBlockedError(PRIVATE_NETWORK_BLOCKED_MESSAGE);
    }
    await lookupPublicAddresses(parsed.hostname);
    return parsed;
}

// Passed to undici so the addresses used for the real connection are checked
// again at connection time, reducing DNS-rebinding/TOCTOU exposure.
export function secureDnsLookup(hostname, options, callback) {
    const family = typeof options === 'number' ? options : Number(options?.family || 0);
    lookupPublicAddresses(hostname, family)
        .then(records => {
            if (typeof options === 'object' && options?.all) {
                callback(null, records);
                return;
            }
            callback(null, records[0].address, records[0].family);
        })
        .catch(error => callback(error));
}

export function rejectOfficialProxy(proxyUrl) {
    if (OFFICIAL_WEB && String(proxyUrl || '').trim()) {
        throw new OutboundRequestBlockedError('官网服务端回退不接受自定义代理地址；请使用浏览器直连或桌面端代理');
    }
}

export function isOutboundRequestBlocked(error) {
    return error?.code === 'OUTBOUND_REQUEST_BLOCKED' || error?.code === FAKE_IP_BLOCKED_CODE;
}

export function redactSensitiveText(value, maxLength = 500) {
    let text;
    try {
        text = typeof value === 'string' ? value : JSON.stringify(value);
    } catch {
        text = String(value || '');
    }
    return String(text || '')
        .replace(/(:\/\/[^:/\s]+:)[^@/\s]+@/g, '$1[已隐藏]@')
        .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi, '$1 [已隐藏]')
        .replace(/([?&](?:api_?key|key|token|access_token)=)[^&\s"']+/gi, '$1[已隐藏]')
        .replace(/\b(?:sk-[A-Za-z0-9._-]{8,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g, '[已隐藏密钥]')
        .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[已隐藏令牌]')
        .replace(/((?:api[_ -]?key|access[_ -]?token|authorization|password|secret)\s*[=:]\s*["']?)[^\s,"'}]+/gi, '$1[已隐藏]')
        .slice(0, maxLength);
}

export function safeUpstreamDetail(raw, maxLength = 500) {
    let detail = raw;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        detail = parsed?.error?.message || parsed?.errors?.message || parsed?.message || parsed?.error || parsed?.errors || raw;
    } catch { /* plain text */ }
    return redactSensitiveText(detail, maxLength);
}
