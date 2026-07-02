'use client';

import { X, HardDrive } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import PortableSyncSettings from './PortableSyncSettings';

/** WebDAV 配置弹窗 — 复用 PortableSyncSettings 的 WebDAV 部分 */
export default function WebDavSyncModal() {
    const { showWebdavSyncModal, setShowWebdavSyncModal } = useAppStore();
    const { text } = useI18n();
    if (!showWebdavSyncModal) return null;
    const close = () => setShowWebdavSyncModal(false);
    return (
        <div className="login-modal-overlay" onClick={close}>
            <div className="sync-config-modal" onClick={e => e.stopPropagation()}>
                <button className="login-modal-close" onClick={close}><X size={18} /></button>
                <div className="sync-config-header">
                    <HardDrive size={18} style={{ color: 'var(--accent)' }} />
                    <h2 className="sync-config-title">{text('WebDAV 同步', 'WebDAV Sync', 'Синхронизация WebDAV')}</h2>
                </div>
                <PortableSyncSettings mode="webdav" />
            </div>
        </div>
    );
}
