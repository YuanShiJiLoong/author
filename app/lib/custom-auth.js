'use client';

// ==================== 自建服务器（Author Cloud）Auth 封装 ====================
// 与 auth.js(Firebase) 平级、接口对齐，供 LoginModal / persistence 层无感调用。
// 仅调用后端 HTTP API，不含任何服务端实现，不硬编码任何密钥。
// 服务器地址可配置：默认读环境变量 NEXT_PUBLIC_AUTHOR_CLOUD_URL，允许用户覆盖
// （自托管），支持公开开源分发。

import { localizedError } from './runtime-i18n';

const PRODUCT = 'author_free';
const SESSION_KEY = 'author-cloud-session';         // 本地令牌 + 用户，绝不上云
const SERVER_CONFIG_KEY = 'author-cloud-config';    // 用户自定义服务器地址
const CUSTOM_HISTORY_KEY = 'author-cloud-account-history';

// ==================== 服务器地址（可配） ====================

const DEFAULT_SERVER_URL = String(process.env.NEXT_PUBLIC_AUTHOR_CLOUD_URL || '').replace(/\/+$/, '');

export function getCloudServerUrl() {
    if (typeof window !== 'undefined') {
        try {
            const cfg = JSON.parse(localStorage.getItem(SERVER_CONFIG_KEY) || 'null');
            if (cfg?.serverUrl) return String(cfg.serverUrl).replace(/\/+$/, '');
        } catch {}
    }
    return DEFAULT_SERVER_URL;
}

export function setCloudServerUrl(url) {
    if (typeof window === 'undefined') return;
    const clean = String(url || '').trim().replace(/\/+$/, '');
    try {
        localStorage.setItem(SERVER_CONFIG_KEY, JSON.stringify({ serverUrl: clean }));
    } catch {}
}

export function isCustomServerConfigured() {
    return Boolean(getCloudServerUrl());
}

// ==================== 状态管理 ====================

let _currentCustomUser = null;
let _session = null; // { tokenType, accessToken, refreshToken, accessExpiresAt, refreshExpiresAt }
const _listeners = new Set();

function notify() {
    _listeners.forEach((fn) => {
        try { fn(_currentCustomUser); } catch (e) { console.error('[custom-auth] listener error:', e); }
    });
}

function loadSession() {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function saveSession(data) {
    if (typeof window === 'undefined') return;
    try {
        if (data) localStorage.setItem(SESSION_KEY, JSON.stringify(data));
        else localStorage.removeItem(SESSION_KEY);
    } catch {}
}

// 从本地恢复会话（应用启动时调用一次）。令牌若过期，首次授权请求会自动刷新。
export function initCustomAuth() {
    const saved = loadSession();
    if (saved?.user && saved?.tokens?.accessToken) {
        _currentCustomUser = saved.user;
        _session = saved.tokens;
    }
    notify();
}

export function getCurrentCustomUser() { return _currentCustomUser; }

export function isCustomSignedIn() { return _currentCustomUser !== null; }

export function onCustomAuthChange(callback) {
    _listeners.add(callback);
    try { callback(_currentCustomUser); } catch {}
    return () => _listeners.delete(callback);
}

// 与 Firebase 的 getUserProfile 结构对齐（uid/email/displayName/photoURL），上层无感
export function getCustomUserProfile() {
    if (!_currentCustomUser) return null;
    const u = _currentCustomUser;
    return { uid: u.id, email: u.email || '', displayName: u.displayName || '', photoURL: '' };
}

// ==================== 内部：HTTP ====================

function requireServer() {
    const url = getCloudServerUrl();
    if (!url) throw localizedError('未配置同步服务器', 'Sync server is not configured.', 'Сервер синхронизации не настроен.');
    return url;
}

async function postJson(path, body, { token } = {}) {
    const url = requireServer();
    const headers = { 'content-type': 'application/json', 'x-author-product': PRODUCT };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${url}${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    let data = null;
    try { data = await res.json(); } catch {}
    return { res, data };
}

function applyLoginResult(data) {
    _currentCustomUser = data.user;
    _session = data.tokens;
    saveSession({ user: data.user, tokens: data.tokens });
    saveCustomAccountToHistory(data.user);
    notify();
    return _currentCustomUser;
}

// 把后端 error.code 映射为三语提示；未知则用兜底文案
function authError(data, fallbackZh, fallbackEn, fallbackRu) {
    const map = {
        invalid_credentials: ['邮箱或密码错误', 'Invalid email or password.', 'Неверная почта или пароль.'],
        email_taken: ['该邮箱已被注册', 'That email is already registered.', 'Эта почта уже зарегистрирована.'],
        weak_password: ['密码至少 8 位', 'Password must be at least 8 characters.', 'Пароль должен быть не менее 8 символов.'],
        invalid_email: ['邮箱格式不正确', 'Please enter a valid email address.', 'Введите корректный адрес почты.'],
        rate_limited: ['发送太频繁，请稍后再试', 'Too many requests. Please wait a moment.', 'Слишком часто, подождите немного.'],
        code_required: ['请先获取并填写验证码', 'Request and enter the verification code.', 'Запросите и введите код подтверждения.'],
        invalid_code: ['验证码错误', 'Incorrect verification code.', 'Неверный код подтверждения.'],
        code_expired: ['验证码已过期，请重新获取', 'Code expired, request a new one.', 'Код истёк, запросите новый.'],
        too_many_attempts: ['尝试次数过多，请重新获取验证码', 'Too many attempts, request a new code.', 'Слишком много попыток, запросите новый код.'],
        delivery_failed: ['验证码发送失败，请稍后重试', 'Failed to send the code, try again later.', 'Не удалось отправить код, попробуйте позже.'],
    };
    const m = map[data?.error?.code];
    if (m) return localizedError(m[0], m[1], m[2]);
    return localizedError(fallbackZh, fallbackEn, fallbackRu);
}

// ==================== 注册 / 登录 / 登出 ====================

export async function signUpWithCustomServer(email, password, displayName, code) {
    const { res, data } = await postJson('/api/auth/register', { email, password, displayName, code, product: PRODUCT });
    if (!res.ok || !data?.ok) throw authError(data, '注册失败', 'Registration failed.', 'Не удалось зарегистрироваться.');
    return applyLoginResult(data);
}

// 请求邮箱注册验证码。成功返回 { retryAfter }；失败 throw（三语提示；限流附带 retryAfter 秒）。
export async function sendEmailCode(email) {
    const { res, data } = await postJson('/api/auth/send-code', { email, channel: 'email', product: PRODUCT });
    if (!res.ok || !data?.ok) {
        const err = authError(data, '验证码发送失败', 'Failed to send code.', 'Не удалось отправить код.');
        if (data?.error?.retryAfter) err.retryAfter = data.error.retryAfter;
        throw err;
    }
    return { retryAfter: data.retryAfter || 60 };
}

export async function signInWithCustomServer(email, password) {
    const { res, data } = await postJson('/api/auth/session', { email, password, product: PRODUCT });
    if (!res.ok || !data?.ok) throw authError(data, '登录失败', 'Sign-in failed.', 'Не удалось войти.');
    return applyLoginResult(data);
}

export async function signOutCustom() {
    const token = _session?.accessToken;
    if (token) {
        try { await postJson('/api/auth/logout', {}, { token }); } catch {}
    }
    await forceLocalSignOut();
}

async function forceLocalSignOut() {
    _currentCustomUser = null;
    _session = null;
    saveSession(null);
    notify();
}

// ==================== 令牌 & 授权请求 ====================

export function getAccessToken() { return _session?.accessToken || null; }

async function refreshSession() {
    const refreshToken = _session?.refreshToken;
    if (!refreshToken) return false;
    try {
        const { res, data } = await postJson('/api/auth/refresh', { refreshToken, product: PRODUCT });
        if (!res.ok || !data?.ok || !data.tokens) return false;
        _session = data.tokens;
        saveSession({ user: _currentCustomUser, tokens: _session });
        return true;
    } catch {
        return false;
    }
}

// 带令牌的 fetch：遇 401 用 refresh 换新令牌重试一次；刷新失败则本地登出。
// 供 custom-server-sync 调用同步端点。
export async function authorizedFetch(path, { method = 'GET', body, query } = {}) {
    const url = requireServer();
    const build = () => {
        const headers = { 'x-author-product': PRODUCT };
        if (_session?.accessToken) headers.authorization = `Bearer ${_session.accessToken}`;
        if (body !== undefined) headers['content-type'] = 'application/json';
        let qs = '';
        if (query) {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(query)) {
                if (v !== undefined && v !== null) params.set(k, String(v));
            }
            qs = `?${params.toString()}`;
        }
        return fetch(`${url}${path}${qs}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    };
    let res = await build();
    if (res.status === 401 && _session?.refreshToken) {
        const ok = await refreshSession();
        if (ok) res = await build();
        else await forceLocalSignOut();
    }
    return res;
}

// ==================== 账号历史（自建，与 Firebase 分开存） ====================

function saveCustomAccountToHistory(user) {
    if (typeof window === 'undefined' || !user) return;
    try {
        const list = getCustomAccountHistory();
        const i = list.findIndex((a) => a.uid === user.id);
        const entry = {
            uid: user.id,
            email: user.email || '',
            displayName: user.displayName || '',
            provider: 'custom-server',
            lastLogin: Date.now(),
        };
        if (i >= 0) list[i] = entry; else list.unshift(entry);
        localStorage.setItem(CUSTOM_HISTORY_KEY, JSON.stringify(list.slice(0, 5)));
    } catch {}
}

export function getCustomAccountHistory() {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(CUSTOM_HISTORY_KEY) || '[]'); } catch { return []; }
}

export function removeCustomAccountFromHistory(uid) {
    if (typeof window === 'undefined') return;
    try {
        const list = getCustomAccountHistory().filter((a) => a.uid !== uid);
        localStorage.setItem(CUSTOM_HISTORY_KEY, JSON.stringify(list));
    } catch {}
}
