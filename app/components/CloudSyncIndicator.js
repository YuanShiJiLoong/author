'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, CloudOff, LogOut, RefreshCw, CheckCircle2, User, ArrowRightLeft, Settings } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';

/**
 * 顶栏云同步状态指示器
 * - 未登录：显示灰色云图标 + "同步方式"，点击弹出登录弹窗
 * - 已登录（Firebase 或自建服务器）：显示用户头像 + 绿色圆点，点击弹出账户菜单
 *
 * 登录态来自两个来源：Firebase 与自建服务器（Author Cloud）。单后端跟随登录，
 * 两者不会并存；Firebase 优先。
 */
export default function CloudSyncIndicator() {
    const { setShowAccountModal, setShowSyncMethodModal } = useAppStore();
    const { text } = useI18n();
    const [firebaseUser, setFirebaseUser] = useState(null);
    const [customUser, setCustomUser] = useState(null);
    const [syncStatus, setSyncStatus] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const btnRef = useRef(null);

    // Firebase 登录态
    useEffect(() => {
        let unmounted = false;
        (async () => {
            try {
                const { isFirebaseConfigured } = await import('../lib/firebase');
                if (!isFirebaseConfigured || unmounted) return;
                const { onAuthChange, initAuth } = await import('../lib/auth');
                const { onSyncStatusChange } = await import('../lib/firestore-sync');
                initAuth();
                onAuthChange(user => { if (!unmounted) setFirebaseUser(user); });
                onSyncStatusChange(status => { if (!unmounted) setSyncStatus(status); });
            } catch { /* Firebase 未配置 */ }
        })();
        return () => { unmounted = true; };
    }, []);

    // 自建服务器登录态
    useEffect(() => {
        let unmounted = false;
        let unsub = null;
        (async () => {
            try {
                const { onCustomAuthChange, getCustomUserProfile, initCustomAuth, isCustomServerConfigured } = await import('../lib/custom-auth');
                if (unmounted || !isCustomServerConfigured()) return;
                initCustomAuth();
                unsub = onCustomAuthChange(() => {
                    if (!unmounted) setCustomUser(getCustomUserProfile());
                });
            } catch { /* 自建服务器未配置 */ }
        })();
        return () => { unmounted = true; if (unsub) unsub(); };
    }, []);

    // 统一登录态：Firebase 优先，其次自建服务器
    const account = firebaseUser
        ? { provider: 'firebase', displayName: firebaseUser.displayName, email: firebaseUser.email, photoURL: firebaseUser.photoURL }
        : customUser
            ? { provider: 'custom', displayName: customUser.displayName, email: customUser.email, photoURL: customUser.photoURL || '' }
            : null;

    const openSyncMethod = () => {
        setMenuOpen(false);
        setShowSyncMethodModal(true);
    };

    const handleSignOut = async () => {
        try {
            await useAppStore.getState().flushPendingEditorSave();
            const { stopCloudSync } = await import('../lib/persistence');
            await stopCloudSync();
            if (account?.provider === 'custom') {
                const { signOutCustom } = await import('../lib/custom-auth');
                await signOutCustom();
            } else {
                const auth = await import('../lib/auth');
                await auth.signOut();
            }
        } catch (err) {
            console.error('Sign out error:', err);
        }
        setMenuOpen(false);
    };

    // 同步状态文字（目前来自 Firebase；自建服务器同步状态在后续接入）
    const getSyncText = () => {
        if (!syncStatus) return null;
        if (syncStatus.syncing) return text('同步中...', 'Syncing...', 'Синхронизация...');
        if (syncStatus.pending > 0) return text(`${syncStatus.pending} 项待同步`, `${syncStatus.pending} pending`, `Ожидает синхронизации: ${syncStatus.pending}`);
        if (syncStatus.lastSync) return text(`已同步 ${new Date(syncStatus.lastSync).toLocaleTimeString()}`, `Synced ${new Date(syncStatus.lastSync).toLocaleTimeString()}`, `Синхронизировано ${new Date(syncStatus.lastSync).toLocaleTimeString()}`);
        return null;
    };

    // 未登录状态：点击弹出登录弹窗
    if (!account) {
        return (
            <button
                id="tour-cloud-sync"
                className="cloud-sync-indicator cloud-sync-login"
                onClick={openSyncMethod}
                title={text('选择同步方式', 'Choose a sync method', 'Выбрать способ синхронизации')}
            >
                <CloudOff size={15} />
                <span className="cloud-sync-label">{text('同步方式', 'Sync Method', 'Способ синхронизации')}</span>
            </button>
        );
    }

    // 已登录状态
    const initial = (account.displayName || account.email || '?')[0].toUpperCase();

    return (
        <>
            <button
                id="tour-cloud-sync"
                ref={btnRef}
                className="cloud-sync-indicator cloud-sync-active"
                onClick={() => setMenuOpen(!menuOpen)}
                title={`${account.displayName || account.email} · ${text('点击查看同步状态和同步方式', 'View sync status and method', 'Просмотреть статус и способ синхронизации')}`}
            >
                {account.photoURL ? (
                    <img src={account.photoURL} alt="" className="cloud-sync-avatar" />
                ) : (
                    <span className="cloud-sync-avatar-letter">{initial}</span>
                )}
                <span className="cloud-sync-dot" />
                {getSyncText() && (
                    <span className="cloud-sync-status-text">{getSyncText()}</span>
                )}
            </button>

            {menuOpen && createPortal(
                <>
                    <div className="cloud-sync-menu-backdrop" onClick={() => setMenuOpen(false)} />
                    <div
                        className="cloud-sync-menu"
                        style={{
                            top: btnRef.current ? btnRef.current.getBoundingClientRect().bottom + 8 : 48,
                            right: 16,
                        }}
                    >
                        <div className="cloud-sync-menu-header">
                            {account.photoURL ? (
                                <img src={account.photoURL} alt="" className="cloud-sync-menu-avatar" />
                            ) : (
                                <div className="cloud-sync-menu-avatar-letter">{initial}</div>
                            )}
                            <div className="cloud-sync-menu-info">
                                <div className="cloud-sync-menu-name">
                                    {account.displayName || account.email}
                                </div>
                                {account.displayName && (
                                    <div className="cloud-sync-menu-email">{account.email}</div>
                                )}
                            </div>
                        </div>

                        {syncStatus && (
                            <div className="cloud-sync-menu-status">
                                {syncStatus.syncing ? (
                                    <><RefreshCw size={12} className="spin" /> {text('正在同步...', 'Syncing...', 'Синхронизация...')}</>
                                ) : syncStatus.pending > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                                        <div>{text(`${syncStatus.pending} 项待同步`, `${syncStatus.pending} pending`, `Ожидает синхронизации: ${syncStatus.pending}`)}</div>
                                        {syncStatus.keys && syncStatus.keys.length > 0 && (
                                            <div style={{
                                                maxHeight: 120, overflowY: 'auto',
                                                fontSize: 11, color: 'var(--text-muted)',
                                                background: 'var(--bg-primary)', padding: '6px 8px',
                                                borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4
                                            }}>
                                                {syncStatus.keys.map(k => (
                                                    <div key={k} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={k}>
                                                        • {k}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : syncStatus.lastSync ? (
                                    <><CheckCircle2 size={12} style={{ color: '#22c55e' }} /> {text('上次同步', 'Last sync', 'Последняя синхронизация')}: {new Date(syncStatus.lastSync).toLocaleTimeString()}</>
                                ) : (
                                    <><Cloud size={12} style={{ color: 'var(--accent)' }} /> {text('云同步已开启', 'Cloud sync enabled', 'Облачная синхронизация включена')}</>
                                )}
                            </div>
                        )}

                        <div className="cloud-sync-menu-divider" />

                        <button
                            className="cloud-sync-menu-item"
                            onClick={openSyncMethod}
                        >
                            <Settings size={14} /> {text('同步方式', 'Sync Method', 'Способ синхронизации')}
                        </button>
                        <button
                            className="cloud-sync-menu-item"
                            onClick={() => { setShowAccountModal(true); setMenuOpen(false); }}
                        >
                            <User size={14} /> {text('账户设置', 'Account Settings', 'Настройки аккаунта')}
                        </button>
                        <button
                            className="cloud-sync-menu-item"
                            onClick={() => { setShowAccountModal(true, true); setMenuOpen(false); }}
                        >
                            <ArrowRightLeft size={14} /> {text('切换账号', 'Switch Account', 'Сменить аккаунт')}
                        </button>
                        <button
                            className="cloud-sync-menu-item cloud-sync-menu-logout"
                            onClick={handleSignOut}
                        >
                            <LogOut size={14} /> {text('退出登录', 'Sign Out', 'Выйти')}
                        </button>
                    </div>
                </>,
                document.body
            )}
        </>
    );
}
