'use client';

// ==================== Firebase Auth 封装 ====================
// 提供统一的认证接口，供 SettingsPanel 和 persistence 层使用

import { localizedError } from './runtime-i18n';

import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
    onAuthStateChanged,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase';

// ==================== 状态管理 ====================

let _currentUser = null;
const _listeners = new Set();

// 初始化认证状态监听（应在应用启动时调用一次）
export function initAuth() {
    if (!isFirebaseConfigured || !auth) return;

    onAuthStateChanged(auth, (user) => {
        _currentUser = user;
        // 记录登录过的账号到历史
        if (user) saveAccountToHistory(user);
        // 发送每日活跃心跳（异步，不阻塞认证流程）
        if (user) {
            import('./heartbeat').then(m => m.sendDailyHeartbeat()).catch(() => {});
        }
        import('./firebase')
            .then(m => m.setFirebaseAnalyticsUserContext?.({ userId: user?.uid || null }))
            .catch(() => {});
        _listeners.forEach(fn => {
            try { fn(user); } catch (e) { console.error('[auth] listener error:', e); }
        });
    });
}

// ==================== 账号历史 ====================

const ACCOUNT_HISTORY_KEY = 'author-account-history';

function saveAccountToHistory(user) {
    if (typeof window === 'undefined' || !user) return;
    try {
        const history = getAccountHistory();
        const existing = history.findIndex(a => a.uid === user.uid);
        const entry = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            provider: user.providerData?.[0]?.providerId || 'password',
            lastLogin: Date.now(),
        };
        if (existing >= 0) {
            history[existing] = entry;
        } else {
            history.unshift(entry);
        }
        // 最多保存 5 个账号
        localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
    } catch {}
}

export function getAccountHistory() {
    if (typeof window === 'undefined') return [];
    try {
        return JSON.parse(localStorage.getItem(ACCOUNT_HISTORY_KEY) || '[]');
    } catch { return []; }
}

export function removeAccountFromHistory(uid) {
    if (typeof window === 'undefined') return;
    try {
        const history = getAccountHistory().filter(a => a.uid !== uid);
        localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(history));
    } catch {}
}

// 获取当前登录用户
export function getCurrentUser() {
    return _currentUser;
}

// 是否已登录
export function isSignedIn() {
    return _currentUser !== null;
}

// 注册认证状态变化回调
export function onAuthChange(callback) {
    _listeners.add(callback);
    // 立即通知当前状态
    if (_currentUser !== undefined) callback(_currentUser);
    return () => _listeners.delete(callback);
}

// ==================== 登录方法 ====================

// 邮箱 + 密码登录
export async function signInWithEmail(email, password) {
    if (!auth) throw localizedError('Firebase 未配置', 'Firebase is not configured.', 'Firebase не настроен.');
    const result = await signInWithEmailAndPassword(auth, email, password);
    // 互斥登录（一山不容二虎）：登了 Firebase 就把自建账号挤下线
    import('./custom-auth').then(m => m.signOutCustom?.()).catch(() => {});
    return result.user;
}

// 邮箱 + 密码注册
export async function signUpWithEmail(email, password) {
    if (!auth) throw localizedError('Firebase 未配置', 'Firebase is not configured.', 'Firebase не настроен.');
    const result = await createUserWithEmailAndPassword(auth, email, password);
    import('./custom-auth').then(m => m.signOutCustom?.()).catch(() => {});
    return result.user;
}

// Google 登录
export async function signInWithGoogle() {
    if (!auth) throw localizedError('Firebase 未配置', 'Firebase is not configured.', 'Firebase не настроен.');
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    import('./custom-auth').then(m => m.signOutCustom?.()).catch(() => {});
    return result.user;
}

// 退出登录
export async function signOut() {
    if (!auth) return;
    await firebaseSignOut(auth);
}

// ==================== 工具方法 ====================

// 获取用户显示信息
export function getUserProfile() {
    if (!_currentUser) return null;
    return {
        uid: _currentUser.uid,
        email: _currentUser.email,
        displayName: _currentUser.displayName,
        photoURL: _currentUser.photoURL,
    };
}

// 更新用户个人资料（昵称 / 头像）
export async function updateUserProfile({ displayName, photoURL }) {
    if (!auth?.currentUser) throw localizedError('未登录', 'Not signed in.', 'Вы не вошли в систему.');
    const { updateProfile } = await import('firebase/auth');
    await updateProfile(auth.currentUser, { displayName, photoURL });
    // 刷新内部缓存
    _currentUser = auth.currentUser;
    _listeners.forEach(fn => { try { fn(_currentUser); } catch {} });
}

// 切换账号：先退出再打开登录弹窗
export async function switchAccount() {
    if (!auth) return;
    await firebaseSignOut(auth);
}
