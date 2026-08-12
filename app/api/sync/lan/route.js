import { NextResponse } from 'next/server';
import os from 'os';
import crypto from 'crypto';
import { isOfficialWebServer } from '../../../lib/server-security.mjs';

export const runtime = 'nodejs';

const MAX_TTL_MS = 2 * 60 * 60 * 1000;
const MIN_TTL_MS = 5 * 60 * 1000;

const shares = globalThis.__AUTHOR_LAN_SYNC_SHARES__ || new Map();
globalThis.__AUTHOR_LAN_SYNC_SHARES__ = shares;

function withCors(response) {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    response.headers.set('Cache-Control', 'no-store');
    return response;
}

function disabledOnOfficialWeb() {
    return withCors(NextResponse.json(
        { error: '局域网临时分享仅在桌面端或自部署环境可用', code: 'LAN_SYNC_LOCAL_ONLY' },
        { status: 403 },
    ));
}

function pruneExpiredShares() {
    const now = Date.now();
    for (const [token, share] of shares.entries()) {
        if (!share || share.expiresAt <= now) shares.delete(token);
    }
}

function getLanAddresses() {
    const addresses = [];
    const nets = os.networkInterfaces();
    for (const entries of Object.values(nets)) {
        for (const entry of entries || []) {
            if (entry.family === 'IPv4' && !entry.internal) {
                addresses.push(entry.address);
            }
        }
    }
    return addresses;
}

function buildUrls(requestUrl, token) {
    const url = new URL(requestUrl);
    const hosts = new Set();
    if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
        hosts.add(url.hostname);
    }
    for (const address of getLanAddresses()) hosts.add(address);
    if (hosts.size === 0) hosts.add(url.hostname);

    const port = url.port ? `:${url.port}` : '';
    const path = `/api/sync/lan?token=${encodeURIComponent(token)}`;
    return Array.from(hosts).map(host => `${url.protocol}//${host}${port}${path}`);
}

function validateSnapshot(bundle) {
    if (!bundle || bundle.type !== 'author-sync-snapshot-v1' || !Array.isArray(bundle.entries)) {
        throw new Error('无效的同步快照');
    }
    return bundle;
}

export async function OPTIONS() {
    if (isOfficialWebServer()) return disabledOnOfficialWeb();
    return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request) {
    if (isOfficialWebServer()) return disabledOnOfficialWeb();
    try {
        pruneExpiredShares();
        const payload = await request.json();
        if (payload?.action !== 'create') {
            return withCors(NextResponse.json({ error: 'Unsupported LAN sync action' }, { status: 400 }));
        }

        const bundle = validateSnapshot(payload.bundle);
        const ttlMs = Math.max(MIN_TTL_MS, Math.min(MAX_TTL_MS, Number(payload.ttlMs) || 30 * 60 * 1000));
        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = Date.now() + ttlMs;

        shares.set(token, {
            bundle,
            createdAt: Date.now(),
            expiresAt,
        });

        return withCors(NextResponse.json({
            token,
            expiresAt,
            urls: buildUrls(request.url, token),
            entryCount: bundle.entries.length,
        }));
    } catch {
        return withCors(NextResponse.json({ error: '创建局域网分享失败' }, { status: 400 }));
    }
}

export async function GET(request) {
    if (isOfficialWebServer()) return disabledOnOfficialWeb();
    try {
        pruneExpiredShares();
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');
        if (!token || !shares.has(token)) {
            return withCors(NextResponse.json({ error: '分享不存在或已过期', code: 'SHARE_NOT_FOUND' }, { status: 404 }));
        }

        const share = shares.get(token);
        return withCors(NextResponse.json(share.bundle));
    } catch {
        return withCors(NextResponse.json({ error: '读取局域网分享失败' }, { status: 500 }));
    }
}
