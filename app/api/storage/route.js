import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const runtime = 'nodejs';

// 文件系统存储只适用于受信任的单用户自托管实例。Cookie 中的 userId 不是身份认证，
// 因此公开或多用户部署必须保持默认关闭，改用浏览器本地存储或带认证的云同步。
const DATA_ROOT_VALUE = process.env.DATA_DIR?.trim();
const DATA_ROOT = DATA_ROOT_VALUE ? path.resolve(DATA_ROOT_VALUE) : null;
const FILE_STORAGE_ENABLED = /^(1|true)$/i.test(process.env.AUTHOR_ENABLE_FILE_STORAGE || '') && DATA_ROOT !== null;
const ORPHAN_ADOPTION_ENABLED = /^(1|true)$/i.test(process.env.AUTHOR_ALLOW_ORPHAN_STORAGE_ADOPTION || '');
const MAX_STORAGE_REQUEST_BYTES = 5 * 1024 * 1024;

class StorageRequestError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

function json(data, init = {}) {
    const headers = new Headers(init.headers);
    headers.set('Cache-Control', 'no-store');
    return NextResponse.json(data, { ...init, headers });
}

function disabledResponse() {
    return json({ error: 'Server file storage is disabled' }, { status: 403 });
}

// 从请求中提取或创建用户ID
function getUserId(request) {
    const cookies = request.headers.get('cookie') || '';
    const match = cookies.match(/(?:^|;\s*)author-uid=([a-zA-Z0-9_-]{1,128})(?:;|$)/);
    if (match) return match[1];
    return null;
}

// 确保目录存在
async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (e) {
        if (e.code !== 'EEXIST') throw e;
    }
}

// key → 文件路径映射（防止路径穿越）
function resolveFilePath(userId, key) {
    if (typeof key !== 'string' || key.length === 0 || key.length > 512) {
        throw new StorageRequestError('Invalid storage key');
    }
    // 不静默清洗字符，避免两个不同 key 被映射到同一文件。
    if (!/^[a-zA-Z0-9\-_./]+$/.test(key) || key.includes('..')) {
        throw new StorageRequestError('Invalid storage key');
    }
    const userDir = path.join(DATA_ROOT, userId);
    const filePath = path.join(userDir, key + '.json');

    // 安全检查：确保路径在用户目录内
    const resolvedPath = path.resolve(filePath);
    const resolvedUserDir = path.resolve(userDir);
    const relativePath = path.relative(resolvedUserDir, resolvedPath);
    if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
        throw new StorageRequestError('Invalid storage path');
    }

    return resolvedPath;
}

async function readStorageBody(request) {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_STORAGE_REQUEST_BYTES) {
        throw new StorageRequestError('Storage request is too large', 413);
    }

    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_STORAGE_REQUEST_BYTES) {
        throw new StorageRequestError('Storage request is too large', 413);
    }

    try {
        return JSON.parse(raw);
    } catch {
        throw new StorageRequestError('Invalid JSON body');
    }
}

// 安全读取 JSON 文件（带重试，防止读到写入一半的数据）
async function safeReadJson(filePath, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        const content = await fs.readFile(filePath, 'utf-8');
        try {
            return JSON.parse(content);
        } catch (parseErr) {
            // JSON 解析失败 = 可能读到了写入一半的文件，等待后重试
            if (i < maxRetries - 1) {
                await new Promise(r => setTimeout(r, 80 * (i + 1)));
                continue;
            }
            throw parseErr; // 最后一次仍然失败，抛出错误
        }
    }
}

const WINDOWS_REPLACE_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'EEXIST']);

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function unlinkIfExists(filePath) {
    try {
        await fs.unlink(filePath);
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }
}

async function replaceFileWithRetry(tmpPath, filePath, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await fs.rename(tmpPath, filePath);
            return;
        } catch (e) {
            if (!WINDOWS_REPLACE_RETRY_CODES.has(e.code) || i === maxRetries - 1) {
                throw e;
            }

            await wait(40 * (i + 1));
            try {
                await unlinkIfExists(filePath);
            } catch (unlinkError) {
                if (!WINDOWS_REPLACE_RETRY_CODES.has(unlinkError.code) || i === maxRetries - 1) {
                    throw unlinkError;
                }
            }
        }
    }
}

async function atomicWriteJson(filePath, value) {
    const tmpPath = filePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
    await fs.writeFile(tmpPath, JSON.stringify(value, null, 2), 'utf-8');

    try {
        await replaceFileWithRetry(tmpPath, filePath);
    } catch (e) {
        await unlinkIfExists(tmpPath).catch(() => {});
        throw e;
    }
}

// GET /api/storage?key=xxx — 读取数据
export async function GET(request) {
    if (!FILE_STORAGE_ENABLED) return disabledResponse();
    try {
        const userId = getUserId(request);
        if (!userId) {
            return json({ error: 'No user ID' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');
        if (!key) {
            return json({ error: 'Missing key parameter' }, { status: 400 });
        }

        const filePath = resolveFilePath(userId, key);

        try {
            const data = await safeReadJson(filePath);
            return json({ data });
        } catch (e) {
            if (e.code === 'ENOENT') {
                // 旧数据领养具有跨用户风险，只允许受信任的管理员显式临时启用。
                const adopted = ORPHAN_ADOPTION_ENABLED && await tryAdoptOrphanData(userId);
                if (adopted) {
                    // 领养成功，重试读取
                    try {
                        const data2 = await safeReadJson(filePath);
                        return json({ data: data2 });
                    } catch { }
                }
                return json({ data: null });
            }
            throw e;
        }
    } catch (error) {
        if (error instanceof StorageRequestError) {
            return json({ error: error.message }, { status: error.status });
        }
        console.error('Storage GET error:', error);
        return json({ error: 'Storage operation failed' }, { status: 500 });
    }
}

/**
 * 自动领养孤儿数据：如果当前用户目录不存在或为空，且 data/ 下恰好只有一个其他用户目录，
 * 则将其重命名为当前用户目录，实现数据无缝继承。
 * 适用场景：用户拷贝项目目录到另一台电脑，浏览器生成了新的 userId。
 */
async function tryAdoptOrphanData(currentUserId) {
    try {
        const currentUserDir = path.join(DATA_ROOT, currentUserId);
        
        // 检查当前用户目录是否已有数据
        try {
            const entries = await fs.readdir(currentUserDir);
            if (entries.length > 0) return false; // 已有数据，不需要领养
        } catch (e) {
            if (e.code !== 'ENOENT') return false;
            // 目录不存在，继续尝试领养
        }

        // 扫描 data/ 下的所有用户目录
        let allDirs;
        try {
            allDirs = await fs.readdir(DATA_ROOT, { withFileTypes: true });
        } catch {
            return false; // data/ 目录不存在
        }

        const otherDirs = allDirs
            .filter(d => d.isDirectory() && d.name !== currentUserId)
            .map(d => d.name);

        if (otherDirs.length !== 1) return false; // 只有恰好一个其他用户时才自动领养

        const orphanDir = path.join(DATA_ROOT, otherDirs[0]);
        
        // 检查孤儿目录是否有数据
        try {
            const orphanEntries = await fs.readdir(orphanDir);
            if (orphanEntries.length === 0) return false;
        } catch {
            return false;
        }

        // 重命名孤儿目录为当前用户目录
        await fs.rename(orphanDir, currentUserDir);
        return true;
    } catch {
        return false;
    }
}

// POST /api/storage — 写入数据 { key, value }
export async function POST(request) {
    if (!FILE_STORAGE_ENABLED) return disabledResponse();
    try {
        const userId = getUserId(request);
        if (!userId) {
            return json({ error: 'No user ID' }, { status: 401 });
        }

        const { key, value } = await readStorageBody(request);
        if (!key) {
            return json({ error: 'Missing key' }, { status: 400 });
        }

        const filePath = resolveFilePath(userId, key);
        await ensureDir(path.dirname(filePath));

        // 原子写入：先写临时文件，再重命名，防止并发读取到半截数据
        await atomicWriteJson(filePath, value);

        return json({ ok: true });
    } catch (error) {
        if (error instanceof StorageRequestError) {
            return json({ error: error.message }, { status: error.status });
        }
        console.error('Storage POST error:', error);
        return json({ error: 'Storage operation failed' }, { status: 500 });
    }
}

// DELETE /api/storage?key=xxx — 删除数据
export async function DELETE(request) {
    if (!FILE_STORAGE_ENABLED) return disabledResponse();
    try {
        const userId = getUserId(request);
        if (!userId) {
            return json({ error: 'No user ID' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');
        if (!key) {
            return json({ error: 'Missing key parameter' }, { status: 400 });
        }

        const filePath = resolveFilePath(userId, key);

        try {
            await fs.unlink(filePath);
        } catch (e) {
            if (e.code !== 'ENOENT') throw e;
        }

        return json({ ok: true });
    } catch (error) {
        if (error instanceof StorageRequestError) {
            return json({ error: error.message }, { status: error.status });
        }
        console.error('Storage DELETE error:', error);
        return json({ error: 'Storage operation failed' }, { status: 500 });
    }
}
