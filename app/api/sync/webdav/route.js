import { NextResponse } from 'next/server';
import { proxyFetch } from '../../../lib/proxy-fetch';
import { isOutboundRequestBlocked, redactSensitiveText } from '../../../lib/server-security.mjs';

export const runtime = 'nodejs';

const ALLOWED_ACTIONS = new Set(['get', 'put', 'delete', 'mkcol', 'propfind']);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const MKCOL_OK_STATUSES = new Set([200, 201, 204, 207, 301, 302, 405]);

function isLocalHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    if (LOCAL_HOSTNAMES.has(host)) return true;
    if (host.endsWith('.local')) return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    if (/^169\.254\./.test(host)) return true;
    if (/^0\./.test(host)) return true;
    if (host === '[::1]') return true;
    if (host.includes(':') && (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80'))) return true;
    return false;
}

function isLocalRequest(requestUrl, hostHeader) {
    try {
        const requestHost = new URL(requestUrl).hostname || String(hostHeader || '').split(':')[0];
        return isLocalHost(requestHost);
    } catch {
        return isLocalHost(String(hostHeader || '').split(':')[0]);
    }
}

function normalizePath(inputPath) {
    const raw = String(inputPath || '').trim().replace(/\\/g, '/');
    if (!raw || raw === '/') return '';
    if (raw.includes('\0')) {
        throw new Error('Invalid WebDAV path');
    }
    return raw
        .split('/')
        .map(segment => segment.trim())
        .filter(Boolean)
        .map(segment => {
            let decoded = segment;
            try {
                decoded = decodeURIComponent(segment);
            } catch {
                decoded = segment;
            }
            if (
                !decoded ||
                decoded === '.' ||
                decoded === '..' ||
                decoded.includes('/') ||
                decoded.includes('\\') ||
                decoded.includes('\0')
            ) {
                throw new Error('Invalid WebDAV path');
            }
            return encodeURIComponent(decoded);
        })
        .join('/');
}

function normalizeEndpointBaseUrl(parsedBase) {
    const normalizedPath = normalizePath(parsedBase.pathname);
    parsedBase.pathname = normalizedPath ? `/${normalizedPath}/` : '/';
    parsedBase.search = '';
    parsedBase.hash = '';
    return parsedBase.toString();
}

function buildWebDavUrl(endpoint, inputPath, options = {}) {
    const base = String(endpoint || '').trim();
    if (!/^https?:\/\//i.test(base)) {
        throw new Error('WebDAV 地址必须以 http:// 或 https:// 开头');
    }
    const parsedBase = new URL(base);
    if (!options.allowPrivateNetwork && isLocalHost(parsedBase.hostname)) {
        throw new Error('公网部署不允许代理访问本机或内网 WebDAV 地址');
    }
    const normalizedBase = normalizeEndpointBaseUrl(parsedBase);
    let normalizedPath = normalizePath(inputPath);
    if (options.collection && normalizedPath && !normalizedPath.endsWith('/')) {
        normalizedPath = `${normalizedPath}/`;
    }
    return new URL(normalizedPath, normalizedBase).toString();
}

function createAuthHeader(username, password) {
    return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

async function proxyWebDav({ action, path, body, config }, options = {}) {
    if (!ALLOWED_ACTIONS.has(action)) {
        throw new Error('Unsupported WebDAV action');
    }
    const endpoint = config?.endpoint;
    const username = config?.username;
    const password = config?.password;
    if (!endpoint || !username || !password) {
        throw new Error('WebDAV 配置不完整');
    }

    const isCollectionAction = action === 'mkcol' || action === 'propfind';
    const url = buildWebDavUrl(endpoint, path, {
        ...options,
        collection: isCollectionAction,
    });
    const headers = {
        Authorization: createAuthHeader(username, password),
        'User-Agent': 'Author-WebDAV-Sync/1.0',
    };
    let method = 'GET';
    let requestBody;

    if (action === 'put') {
        method = 'PUT';
        headers['Content-Type'] = 'application/json; charset=utf-8';
        requestBody = typeof body === 'string' ? body : JSON.stringify(body ?? null);
    } else if (action === 'delete') {
        method = 'DELETE';
    } else if (action === 'mkcol') {
        method = 'MKCOL';
    } else if (action === 'propfind') {
        method = 'PROPFIND';
        headers.Depth = '0';
    }

    const response = await proxyFetch(url, {
        method,
        headers,
        body: requestBody,
        cache: 'no-store',
    });

    if (action === 'get') {
        if (response.status === 404) return { ok: true, missing: true, status: 404 };
        if (!response.ok) {
            return { ok: false, status: response.status, body: await response.text().catch(() => '') };
        }
        return { ok: true, status: response.status, body: await response.text() };
    }

    if (action === 'propfind') {
        if (response.status === 404) return { ok: true, missing: true, status: 404 };
        if ([200, 207, 301, 302].includes(response.status)) {
            return { ok: true, status: response.status, exists: true };
        }
        return { ok: false, status: response.status, body: await response.text().catch(() => '') };
    }

    if (action === 'mkcol') {
        if (MKCOL_OK_STATUSES.has(response.status)) {
            return { ok: true, status: response.status };
        }
        if (response.status === 409) {
            const exists = await proxyFetch(url, {
                method: 'PROPFIND',
                headers: {
                    ...headers,
                    Depth: '0',
                },
                cache: 'no-store',
            });
            if ([200, 207, 301, 302].includes(exists.status)) {
                return { ok: true, status: response.status, existed: true };
            }
            return { ok: false, status: 409, body: await response.text().catch(() => '') };
        }
    }

    if (action === 'delete' && response.status === 404) {
        return { ok: true, missing: true, status: 404 };
    }

    if (![200, 201, 204].includes(response.status)) {
        return { ok: false, status: response.status, body: await response.text().catch(() => '') };
    }

    return { ok: true, status: response.status };
}

function safeErrorMessage(result) {
    if (!result?.status) return 'WebDAV 请求失败';
    if (result.status === 401 || result.status === 403) return 'WebDAV 认证失败，请检查账号和应用密码';
    if (result.status === 404) return 'WebDAV 路径不存在';
    if (result.status === 409) return 'WebDAV 目录不存在或无法创建';
    return `WebDAV 请求失败 (${result.status})`;
}

export async function POST(request) {
    try {
        const payload = await request.json();
        const result = await proxyWebDav(payload || {}, {
            allowPrivateNetwork: isLocalRequest(request.url, request.headers.get('host')),
        });
        if (!result.ok) {
            return NextResponse.json({ error: safeErrorMessage(result), status: result.status }, { status: 502 });
        }
        return NextResponse.json(result);
    } catch (error) {
        if (isOutboundRequestBlocked(error)) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
        }
        return NextResponse.json({ error: redactSensitiveText(error?.message || 'WebDAV 请求失败', 200) }, { status: 400 });
    }
}
