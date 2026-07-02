'use client';

import { X, Wifi } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import PortableSyncSettings from './PortableSyncSettings';

/** 局域网配置弹窗 — 复用 PortableSyncSettings 的局域网部分 */
export default function LanSyncModal() {
    const { showLanSyncModal, setShowLanSyncModal } = useAppStore();
    const { text } = useI18n();
    if (!showLanSyncModal) return null;
    const close = () => setShowLanSyncModal(false);
    return (
        <div className="login-modal-overlay" onClick={close}>
            <div className="sync-config-modal" onClick={e => e.stopPropagation()}>
                <button className="login-modal-close" onClick={close}><X size={18} /></button>
                <div className="sync-config-header">
                    <Wifi size={18} style={{ color: 'var(--accent)' }} />
                    <h2 className="sync-config-title">{text('局域网同步', 'LAN Sync', 'LAN-синхронизация')}</h2>
                </div>
                <PortableSyncSettings mode="lan" />
            </div>
        </div>
    );
}
