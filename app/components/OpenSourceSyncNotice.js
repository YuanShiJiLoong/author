'use client';

import { useEffect, useState } from 'react';
import { Globe, X } from 'lucide-react';
import { useI18n } from '../lib/useI18n';
import { OFFICIAL_APP_URL } from '../lib/api-base';

const DISMISS_KEY = 'author-domestic-sync-notice-dismissed';

/**
 * 开源 / 桌面版通告条：国内账号云同步已上线官方网页版（/app），本版本不内置国内服务器。
 * 仅在未配置同步服务器时显示（官方 /app 内置了地址、自部署用户填过地址 → 均自动隐藏）；
 * 用户点"知道了"后不再出现。
 */
export default function OpenSourceSyncNotice() {
    const { t } = useI18n();
    const [show, setShow] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                if (localStorage.getItem(DISMISS_KEY)) return;
                const { isCustomServerConfigured } = await import('../lib/custom-auth');
                if (isCustomServerConfigured()) return;
                setShow(true);
            } catch { /* 检测失败不打扰 */ }
        })();
    }, []);

    if (!show) return null;

    const dismiss = () => {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
        setShow(false);
    };

    return (
        <div className="sync-notice-banner" role="status">
            <Globe size={14} className="sync-notice-icon" />
            <span className="sync-notice-text">
                <b>{t('syncNotice.title')}</b>{t('syncNotice.body')}
            </span>
            <button className="sync-notice-go" onClick={() => window.open(OFFICIAL_APP_URL, '_blank', 'noopener,noreferrer')}>
                {t('syncNotice.go')}
            </button>
            <button className="sync-notice-dismiss" onClick={dismiss} aria-label={t('syncNotice.dismiss')} title={t('syncNotice.dismiss')}>
                <X size={13} />
            </button>
        </div>
    );
}
