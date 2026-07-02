'use client';

import { useState, useEffect, useRef } from 'react';
import {
    X, Cloud, LogOut, Shield, Mail, User as UserIcon, RefreshCw,
    CheckCircle2, Clock, HardDrive, Edit3, Save, ArrowRightLeft,
    Plus, Trash2, Camera
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';

/**
 * 账户管理弹窗
 * 显示用户信息、编辑个人资料、同步状态、切换账号、退出登录
 */
export default function AccountModal() {
    const { showAccountModal, accountModalSwitcher, setShowAccountModal, setShowLoginModal } = useAppStore();
    const { text } = useI18n();
    const [firebaseUser, setFirebaseUser] = useState(null);
    const [customUser, setCustomUser] = useState(null);
    const [syncStatus, setSyncStatus] = useState(null);
    const [signingOut, setSigningOut] = useState(false);

    // 编辑状态
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');

    // 切换账号面板
    const [showSwitcher, setShowSwitcher] = useState(false);
    const [accountHistory, setAccountHistory] = useState([]);
    const avatarInputRef = useRef(null);

    // Firebase 登录态（老账号）
    useEffect(() => {
        let unmounted = false;
        (async () => {
            try {
                const { isFirebaseConfigured } = await import('../lib/firebase');
                if (!isFirebaseConfigured || unmounted) return;
                const { onAuthChange } = await import('../lib/auth');
                const { onSyncStatusChange } = await import('../lib/firestore-sync');
                onAuthChange(user => { if (!unmounted) setFirebaseUser(user); });
                onSyncStatusChange(status => { if (!unmounted) setSyncStatus(status); });
            } catch { }
        })();
        return () => { unmounted = true; };
    }, []);

    // 自建服务器登录态（邮箱账号）
    useEffect(() => {
        let unmounted = false;
        let unsub = null;
        (async () => {
            try {
                const { onCustomAuthChange, getCustomUserProfile, isCustomServerConfigured } = await import('../lib/custom-auth');
                if (unmounted || !isCustomServerConfigured()) return;
                unsub = onCustomAuthChange(() => { if (!unmounted) setCustomUser(getCustomUserProfile()); });
            } catch { }
        })();
        return () => { unmounted = true; if (unsub) unsub(); };
    }, []);

    // 载入对应后端的账号历史（切换账号用）
    useEffect(() => {
        if (!showAccountModal) return;
        let unmounted = false;
        (async () => {
            try {
                if (firebaseUser) {
                    const { getAccountHistory } = await import('../lib/auth');
                    if (!unmounted) setAccountHistory(getAccountHistory());
                } else if (customUser) {
                    const { getCustomAccountHistory } = await import('../lib/custom-auth');
                    if (!unmounted) setAccountHistory(getCustomAccountHistory());
                }
            } catch { }
        })();
        return () => { unmounted = true; };
    }, [showAccountModal, firebaseUser, customUser]);

    // 昵称输入框跟随当前账号（非编辑态）
    useEffect(() => {
        if (editing) return;
        setEditName(firebaseUser?.displayName || customUser?.displayName || '');
    }, [firebaseUser, customUser, editing]);

    // 重置状态 & 初始化 switcher
    useEffect(() => {
        if (!showAccountModal) {
            setEditing(false);
            setSaveMsg('');
            setShowSwitcher(false);
        } else if (accountModalSwitcher) {
            setShowSwitcher(true);
        }
    }, [showAccountModal, accountModalSwitcher]);

    // 统一登录态：Firebase 优先，其次自建服务器。渲染层沿用 authUser 的字段
    // （email/displayName/photoURL/metadata/providerData）；自建账号无 metadata/providerData，
    // 注册时间/Google 判断会自动落空、登录方式回退为「邮箱密码」，无需分支处理。
    const authUser = firebaseUser || customUser || null;
    const isCustomAccount = !firebaseUser && !!customUser;
    const canEdit = !!firebaseUser; // 改昵称/头像走 Firebase 接口；自建后端暂无对应端点，先隐藏入口

    if (!showAccountModal || !authUser) return null;

    const handleSaveProfile = async () => {
        if (!editName.trim()) return;
        setSaving(true);
        setSaveMsg('');
        try {
            const { updateUserProfile } = await import('../lib/auth');
            await updateUserProfile({ displayName: editName.trim() });
            setSaveMsg(text('已保存', 'Saved', 'Сохранено'));
            setEditing(false);
            setTimeout(() => setSaveMsg(''), 2000);
        } catch (err) {
            setSaveMsg(`${text('保存失败', 'Save failed', 'Ошибка сохранения')}: ${err.message || text('未知错误', 'Unknown error', 'Неизвестная ошибка')}`);
        } finally {
            setSaving(false);
        }
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // 压缩为 200x200 的 data URL
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const img = new Image();
            img.onload = async () => {
                const canvas = document.createElement('canvas');
                const size = 200;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                // 居中裁剪
                const min = Math.min(img.width, img.height);
                const sx = (img.width - min) / 2;
                const sy = (img.height - min) / 2;
                ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                try {
                    const { updateUserProfile } = await import('../lib/auth');
                    await updateUserProfile({ photoURL: dataUrl });
                    setSaveMsg(text('头像已更新', 'Avatar updated', 'Аватар обновлён'));
                    setTimeout(() => setSaveMsg(''), 2000);
                } catch (err) {
                    setSaveMsg(text('上传失败', 'Upload failed', 'Ошибка загрузки'));
                }
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // 重置以允许再次选择同一文件
    };

    const handleSignOut = async () => {
        setSigningOut(true);
        try {
            await useAppStore.getState().flushPendingEditorSave();
            const { stopCloudSync } = await import('../lib/persistence');
            await stopCloudSync();
            if (isCustomAccount) {
                const { signOutCustom } = await import('../lib/custom-auth');
                await signOutCustom();
            } else {
                const auth = await import('../lib/auth');
                await auth.signOut();
            }
            setShowAccountModal(false);
        } catch (err) {
            console.error('Sign out error:', err);
            setSaveMsg(text('退出前同步失败，请稍后重试', 'Sync failed before signing out. Please try again later.', 'Синхронизация перед выходом не удалась. Попробуйте позже.'));
        } finally {
            setSigningOut(false);
        }
    };

    const handleSwitchToAccount = async (account) => {
        // 先退出当前账号
        try {
            await useAppStore.getState().flushPendingEditorSave();
            const { stopCloudSync } = await import('../lib/persistence');
            await stopCloudSync();
            if (isCustomAccount) {
                const { signOutCustom } = await import('../lib/custom-auth');
                await signOutCustom();
            } else {
                const auth = await import('../lib/auth');
                await auth.signOut();
            }
        } catch (err) {
            console.error('Switch account sync error:', err);
            setSaveMsg(text('切换账号前同步失败，请稍后重试', 'Sync failed before switching accounts. Please try again later.', 'Синхронизация перед сменой аккаунта не удалась. Попробуйте позже.'));
            return;
        }
        setShowAccountModal(false);
        // 延时打开登录弹窗（用户需要重新认证）
        setTimeout(() => setShowLoginModal(true), 300);
    };

    const handleAddNewAccount = () => {
        // 不退出当前账号，直接打开登录窗
        // 如果用户成功登录新账号，Firebase 会自动切换
        // 如果用户取消，原账号状态保持不变
        setShowAccountModal(false);
        setTimeout(() => setShowLoginModal(true), 300);
    };

    const handleRemoveFromHistory = async (uid) => {
        if (isCustomAccount) {
            const { removeCustomAccountFromHistory, getCustomAccountHistory } = await import('../lib/custom-auth');
            removeCustomAccountFromHistory(uid);
            setAccountHistory(getCustomAccountHistory());
        } else {
            const { removeAccountFromHistory, getAccountHistory } = await import('../lib/auth');
            removeAccountFromHistory(uid);
            setAccountHistory(getAccountHistory());
        }
    };

    const handleManualSync = async () => {
        try {
            setSaveMsg('');
            await useAppStore.getState().flushPendingEditorSave();
            const { syncToCloud } = await import('../lib/persistence');
            await syncToCloud();
            setSaveMsg(text('已保存并同步到云端', 'Saved and synced to cloud', 'Сохранено и синхронизировано с облаком'));
            setTimeout(() => setSaveMsg(''), 2000);
        } catch (err) {
            setSaveMsg(`${text('同步失败', 'Sync failed', 'Ошибка синхронизации')}: ${err.message || text('未知错误', 'Unknown error', 'Неизвестная ошибка')}`);
        }
    };

    const initial = (authUser.displayName || authUser.email || '?')[0].toUpperCase();
    const createdAt = authUser.metadata?.creationTime
        ? new Date(authUser.metadata.creationTime).toLocaleDateString()
        : null;
    const lastSignIn = authUser.metadata?.lastSignInTime
        ? new Date(authUser.metadata.lastSignInTime).toLocaleDateString()
        : null;
    const providerName = authUser.providerData?.[0]?.providerId === 'google.com' ? 'Google' : text('邮箱密码', 'Email/password', 'Email/пароль');

    // 其他历史账号（排除当前）
    const otherAccounts = accountHistory.filter(a => a.uid !== authUser.uid);

    // 同步状态指示
    const syncInfo = (() => {
        if (!syncStatus) return { icon: <Cloud size={16} />, text: text('云同步已开启', 'Cloud sync enabled', 'Облачная синхронизация включена'), color: 'var(--accent)' };
        if (syncStatus.syncing) return { icon: <RefreshCw size={16} className="spin" />, text: text('正在同步...', 'Syncing...', 'Синхронизация...'), color: 'var(--accent)' };
        if (syncStatus.pending > 0) return { icon: <Clock size={16} />, text: text(`${syncStatus.pending} 项待同步`, `${syncStatus.pending} pending`, `Ожидает синхронизации: ${syncStatus.pending}`), color: '#f59e0b' };
        if (syncStatus.idle) return { icon: <Cloud size={16} />, text: text('自动同步已暂停', 'Auto sync paused', 'Автосинхронизация приостановлена'), color: '#94a3b8' };
        if (syncStatus.lastSync) return { icon: <CheckCircle2 size={16} />, text: text(`已同步 · ${new Date(syncStatus.lastSync).toLocaleTimeString()}`, `Synced · ${new Date(syncStatus.lastSync).toLocaleTimeString()}`, `Синхронизировано · ${new Date(syncStatus.lastSync).toLocaleTimeString()}`), color: '#22c55e' };
        return { icon: <Cloud size={16} />, text: text('云同步已开启', 'Cloud sync enabled', 'Облачная синхронизация включена'), color: 'var(--accent)' };
    })();

    return (
        <div className="login-modal-overlay" onClick={() => setShowAccountModal(false)}>
            <div className="account-modal" onClick={e => e.stopPropagation()}>
                {/* 关闭按钮 */}
                <button className="login-modal-close" onClick={() => setShowAccountModal(false)}>
                    <X size={18} />
                </button>

                {/* === 切换账号面板 === */}
                {showSwitcher ? (
                    <div style={{ padding: '4px 0' }}>
                        <h3 style={{ fontSize: 17, fontWeight: 700, textAlign: 'center', marginBottom: 16, color: 'var(--text-primary)' }}>{text('切换账号', 'Switch Account', 'Сменить аккаунт')}</h3>

                        {/* 当前账号 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--accent-light)' }}>
                            <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                                {authUser.photoURL ? (
                                    <img src={authUser.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span>{initial}</span>
                                )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{authUser.displayName || text('用户', 'User', 'Пользователь')}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{authUser.email}</div>
                            </div>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontWeight: 600, flexShrink: 0 }}>{text('当前', 'Current', 'Текущий')}</span>
                        </div>

                        {/* 历史账号 */}
                        {otherAccounts.map(acc => (
                            <div key={acc.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }} className="account-switcher-item" onClick={() => handleSwitchToAccount(acc)}>
                                <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                                    {acc.photoURL ? (
                                        <img src={acc.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <span>{(acc.displayName || acc.email || '?')[0].toUpperCase()}</span>
                                    )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{acc.displayName || text('用户', 'User', 'Пользователь')}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{acc.email}</div>
                                </div>
                                <button
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: '50%', display: 'flex', alignItems: 'center' }}
                                    onClick={(e) => { e.stopPropagation(); handleRemoveFromHistory(acc.uid); }}
                                    title={text('移除记录', 'Remove record', 'Удалить запись')}
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}

                        {/* 添加新账号 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }} className="account-switcher-item" onClick={handleAddNewAccount}>
                            <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '2px dashed var(--border-medium)' }}>
                                <Plus size={20} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{text('添加其他账号', 'Add another account', 'Добавить другой аккаунт')}</div>
                            </div>
                        </div>

                        <button style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '14px 0 4px', fontFamily: 'var(--font-ui)' }} onClick={() => setShowSwitcher(false)}>
                            {text('← 返回账户详情', '← Back to Account Details', '← Назад к аккаунту')}
                        </button>
                    </div>
                ) : (
                    /* === 账户详情面板 === */
                    <>
                        {/* 用户头部 */}
                        <div className="account-modal-profile">
                            <div className="account-modal-avatar-wrap" onClick={canEdit ? () => avatarInputRef.current?.click() : undefined} style={{ cursor: canEdit ? 'pointer' : 'default' }} title={canEdit ? text('点击更换头像', 'Click to change avatar', 'Нажмите, чтобы сменить аватар') : undefined}>
                                {authUser.photoURL ? (
                                    <img src={authUser.photoURL} alt="" className="account-modal-avatar" />
                                ) : (
                                    <div className="account-modal-avatar-letter">{initial}</div>
                                )}
                                {canEdit && (
                                    <div className="account-modal-avatar-overlay">
                                        <Camera size={18} />
                                    </div>
                                )}
                                <span className="account-modal-status-dot" style={{ background: syncInfo.color }} />
                            </div>
                            {canEdit && <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />}

                            {/* 昵称 — 可编辑 */}
                            {editing ? (
                                <div className="account-modal-edit-name">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        placeholder={text('输入昵称', 'Enter nickname', 'Введите имя')}
                                        className="account-modal-name-input"
                                        autoFocus
                                        onKeyDown={e => { if (e.key === 'Enter') handleSaveProfile(); if (e.key === 'Escape') setEditing(false); }}
                                    />
                                    <button
                                        className="account-modal-save-btn"
                                        onClick={handleSaveProfile}
                                        disabled={saving || !editName.trim()}
                                    >
                                        <Save size={14} />
                                    </button>
                                </div>
                            ) : (
                                <div className="account-modal-name-row">
                                    <h2 className="account-modal-name">{authUser.displayName || text('用户', 'User', 'Пользователь')}</h2>
                                    {canEdit && (
                                        <button className="account-modal-edit-btn" onClick={() => setEditing(true)} title={text('编辑昵称', 'Edit nickname', 'Редактировать имя')}>
                                            <Edit3 size={13} />
                                        </button>
                                    )}
                                </div>
                            )}
                            {saveMsg && <p className="account-modal-save-msg">{saveMsg}</p>}
                            <p className="account-modal-email">{authUser.email}</p>
                        </div>

                        {/* 同步状态卡片 */}
                        <div className="account-modal-sync-card" onClick={handleManualSync} title={text('点击立即同步', 'Click to sync now', 'Нажмите, чтобы синхронизировать')}>
                            <div className="account-modal-sync-icon" style={{ color: syncInfo.color }}>
                                {syncInfo.icon}
                            </div>
                            <div className="account-modal-sync-info">
                                <div className="account-modal-sync-label">{text('云同步状态', 'Cloud Sync Status', 'Статус облачной синхронизации')}</div>
                                <div className="account-modal-sync-value" style={{ color: syncInfo.color }}>
                                    {syncInfo.text}
                                </div>
                            </div>
                        </div>

                        {/* 账户信息 */}
                        <div className="account-modal-details">
                            <div className="account-modal-detail-row">
                                <Mail size={14} />
                                <span className="account-modal-detail-label">{text('邮箱', 'Email', 'Email')}</span>
                                <span className="account-modal-detail-value">{authUser.email}</span>
                            </div>
                            <div className="account-modal-detail-row">
                                <Shield size={14} />
                                <span className="account-modal-detail-label">{text('登录方式', 'Sign-in Method', 'Способ входа')}</span>
                                <span className="account-modal-detail-value">{providerName}</span>
                            </div>
                            {createdAt && (
                                <div className="account-modal-detail-row">
                                    <UserIcon size={14} />
                                    <span className="account-modal-detail-label">{text('注册时间', 'Joined', 'Дата регистрации')}</span>
                                    <span className="account-modal-detail-value">{createdAt}</span>
                                </div>
                            )}
                            {lastSignIn && (
                                <div className="account-modal-detail-row">
                                    <Clock size={14} />
                                    <span className="account-modal-detail-label">{text('上次登录', 'Last Sign-in', 'Последний вход')}</span>
                                    <span className="account-modal-detail-value">{lastSignIn}</span>
                                </div>
                            )}
                            <div className="account-modal-detail-row">
                                <HardDrive size={14} />
                                <span className="account-modal-detail-label">{text('数据存储', 'Data Storage', 'Хранение данных')}</span>
                                <span className="account-modal-detail-value">{text('本地 + 云端', 'Local + Cloud', 'Локально + облако')}</span>
                            </div>
                        </div>

                        {/* 操作按钮组 */}
                        <div className="account-modal-actions">
                            <button
                                className="account-modal-action-btn account-modal-switch-btn"
                                onClick={() => setShowSwitcher(true)}
                            >
                                <ArrowRightLeft size={15} />
                                {text('切换账号', 'Switch Account', 'Сменить аккаунт')}
                            </button>
                            <button
                                className="account-modal-action-btn account-modal-logout-btn"
                                onClick={handleSignOut}
                                disabled={signingOut}
                            >
                                <LogOut size={15} />
                                {signingOut ? text('退出中...', 'Signing out...', 'Выход...') : text('退出登录', 'Sign Out', 'Выйти')}
                            </button>
                        </div>

                        <p className="account-modal-footer">
                            {text('退出后将停止云同步；AI 对话记录仍只保存在本机，不会参与云同步。', 'Cloud sync stops after signing out. AI chat history remains on this device and is not synced.', 'После выхода облачная синхронизация остановится. История чатов ИИ остаётся на этом устройстве и не синхронизируется.')}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
