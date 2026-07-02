'use client';

import { useState, useEffect } from 'react';
import { X, Cloud, HardDrive, Wifi, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';

/**
 * 同步方式选择弹窗 — 右上角"同步方式"入口。
 * 三个方式各跳一个去处：
 *   账号同步 → 登录弹窗（未登录）/ 账户弹窗（已登录）
 *   WebDAV   → WebDAV 配置弹窗
 *   局域网    → 局域网配置弹窗
 */
export default function SyncMethodModal() {
    const {
        showSyncMethodModal, setShowSyncMethodModal,
        setShowLoginModal, setShowAccountModal,
        setShowWebdavSyncModal, setShowLanSyncModal,
    } = useAppStore();
    const { text } = useI18n();
    const [signedIn, setSignedIn] = useState(false);

    // 账号同步的去向取决于是否已登录（自建账号）
    useEffect(() => {
        if (!showSyncMethodModal) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const { isCustomSignedIn } = await import('../lib/custom-auth');
                if (!cancelled) setSignedIn(isCustomSignedIn());
            } catch { /* 未配置自建服务器 */ }
        })();
        return () => { cancelled = true; };
    }, [showSyncMethodModal]);

    // 预加载切换目标弹窗的代码块，避免首次点击时懒加载的空档造成闪白
    useEffect(() => {
        if (!showSyncMethodModal) return;
        import('./LoginModal');
        import('./AccountModal');
        import('./WebDavSyncModal');
        import('./LanSyncModal');
    }, [showSyncMethodModal]);

    if (!showSyncMethodModal) return null;

    const close = () => setShowSyncMethodModal(false);
    const openAccount = () => { close(); if (signedIn) setShowAccountModal(true); else setShowLoginModal(true); };
    const openWebdav = () => { close(); setShowWebdavSyncModal(true); };
    const openLan = () => { close(); setShowLanSyncModal(true); };

    const methods = [
        {
            key: 'account', icon: <Cloud size={20} />,
            title: text('账号同步', 'Account Sync', 'Синхронизация аккаунта'),
            desc: text('登录账号，作品自动同步到云端，多设备通用', 'Sign in to auto-sync works to the cloud across devices', 'Войдите — произведения синхронизируются с облаком на всех устройствах'),
            onClick: openAccount,
        },
        {
            key: 'webdav', icon: <HardDrive size={20} />,
            title: text('WebDAV', 'WebDAV', 'WebDAV'),
            desc: text('坚果云、123 云盘或自建 NAS / Nextcloud', 'Jianguoyun, 123 Cloud, or your own NAS / Nextcloud', 'Jianguoyun, 123 Cloud или свой NAS / Nextcloud'),
            onClick: openWebdav,
        },
        {
            key: 'lan', icon: <Wifi size={20} />,
            title: text('局域网', 'LAN', 'Локальная сеть'),
            desc: text('同一 Wi-Fi 下临时分享，无需联网', 'Share temporarily over the same Wi-Fi, no internet needed', 'Временный обмен в одной Wi-Fi сети, без интернета'),
            onClick: openLan,
        },
    ];

    return (
        <div className="login-modal-overlay" onClick={close}>
            <div className="sync-method-modal" onClick={e => e.stopPropagation()}>
                <button className="login-modal-close" onClick={close}><X size={18} /></button>
                <div className="sync-method-header">
                    <h2 className="sync-method-title">{text('选择同步方式', 'Choose a Sync Method', 'Способ синхронизации')}</h2>
                    <p className="sync-method-desc">{text('作品数据始终先保存在本机，同步是可选的。', 'Your data is always saved locally first; syncing is optional.', 'Данные всегда сначала сохраняются локально; синхронизация — по желанию.')}</p>
                </div>
                <div className="sync-method-list">
                    {methods.map(m => (
                        <button key={m.key} className="sync-method-item" onClick={m.onClick}>
                            <div className="sync-method-item-icon">{m.icon}</div>
                            <div className="sync-method-item-body">
                                <div className="sync-method-item-title">{m.title}</div>
                                <div className="sync-method-item-desc">{m.desc}</div>
                            </div>
                            <ChevronRight size={16} className="sync-method-item-arrow" />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
