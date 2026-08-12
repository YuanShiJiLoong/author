import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const OFFICIAL_WEB = process.env.NEXT_PUBLIC_DEPLOYMENT_TARGET === 'official-web';
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

export class OutboundRequestBlockedError extends Error {
    constructor(message = '官网服务端只允许连接公网 HTTP(S) 地址') {
        super(message);
        this.name = 'OutboundRequestBlockedError';
        this.code = 'OUTBOUND_REQUEST_BLOCKED';
    }
}

export function isOfficialWebServer() {
    return OFFICIAL_WEB;
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

function parsePublicHttpUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || '').trim());
    } catch {
        throw new OutboundRequestBlockedError('API 地址格式无效');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new OutboundRequestBlockedError('官网服务端只允许连接 HTTP(S) API 地址');
    }
    if (parsed.username || parsed.password) {
        throw new OutboundRequestBlockedError('API 地址中不能包含账号或密码');
    }
    const hostname = normalizedIp(parsed.hostname);
    if (!hostname || hostname === 'localhost' || BLOCKED_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))) {
        throw new OutboundRequestBlockedError();
    }
    if (isIP(hostname) && !isPublicIpAddress(hostname)) {
        throw new OutboundRequestBlockedError();
    }
    return parsed;
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
        throw new OutboundRequestBlockedError();
    }
    return filtered;
}

export async function assertSafeOutboundUrl(rawUrl) {
    if (!OFFICIAL_WEB) return;
    const parsed = parsePublicHttpUrl(rawUrl);
    await lookupPublicAddresses(parsed.hostname);
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
    return error?.code === 'OUTBOUND_REQUEST_BLOCKED';
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
