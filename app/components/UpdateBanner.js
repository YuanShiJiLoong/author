'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '../lib/useI18n';

export default function UpdateBanner() {
    const { t } = useI18n();
    const [updateInfo, setUpdateInfo] = useState(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const checkUpdate = async () => {
            try {
                const res = await fetch('/api/check-update', { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();

                if (data.hasUpdate && data.latest) {
                    // 检查用户是否已经忽略过该版本
                    const dismissedVersion = localStorage.getItem('author-update-dismissed');
                    if (dismissedVersion === data.latest) return;

                    setUpdateInfo(data);
                }
            } catch {
                // 网络失败静默跳过
            }
        };

        // 延迟 3 秒检查，避免影响首屏加载
        const timer = setTimeout(checkUpdate, 3000);
        return () => clearTimeout(timer);
    }, []);

    const handleDismiss = () => {
        setDismissed(true);
        if (updateInfo?.latest) {
            localStorage.setItem('author-update-dismissed', updateInfo.latest);
        }
    };

    if (!updateInfo || dismissed) return null;

    const versionText = t('update.newVersion').replace('{version}', `v${updateInfo.latest}`);

    return (
        <div className="update-banner">
            <div className="update-banner-content">
                <span className="update-banner-icon">🔔</span>
                <span className="update-banner-text">{versionText}</span>
                <a
                    href="https://github.com/YuanShiJiLoong/author"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="update-banner-link"
                >
                    {t('update.viewSource')}
                </a>
                <a
                    href="https://github.com/YuanShiJiLoong/author/releases/latest"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="update-banner-link"
                >
                    {t('update.downloadClient')}
                </a>
                <button
                    className="update-banner-dismiss"
                    onClick={handleDismiss}
                    title={t('update.dismiss')}
                >
                    ✕
                </button>
            </div>
        </div>
    );
}
