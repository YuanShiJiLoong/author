'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '../lib/useI18n';

export default function UpdateBanner() {
    const { t } = useI18n();
    const [updateInfo, setUpdateInfo] = useState(null);
    const [dismissed, setDismissed] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [updateResult, setUpdateResult] = useState(null); // { success, message, logs }
    const [downloadProgress, setDownloadProgress] = useState(null); // { progress, downloaded, total }

    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

    useEffect(() => {
        const checkUpdate = async () => {
            try {
                const res = await fetch('/api/check-update', { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();

                if (data.hasUpdate && data.latest) {
                    const dismissedVersion = sessionStorage.getItem('author-update-dismissed');
                    if (dismissedVersion === data.latest) return;
                    setUpdateInfo(data);
                }
            } catch {
                // 网络失败静默跳过
            }
        };

        const timer = setTimeout(checkUpdate, 3000);
        return () => clearTimeout(timer);
    }, []);

    // 监听 Electron 下载进度
    useEffect(() => {
        if (isElectron && window.electronAPI?.onUpdateProgress) {
            window.electronAPI.onUpdateProgress((data) => {
                setDownloadProgress(data);
            });
        }
    }, [isElectron]);

    const handleDismiss = () => {
        setDismissed(true);
        if (updateInfo?.latest) {
            sessionStorage.setItem('author-update-dismissed', updateInfo.latest);
        }
    };

    // Electron 客户端：自动下载安装
    const handleElectronUpdate = async () => {
        setUpdating(true);
        setUpdateResult(null);
        setDownloadProgress({ progress: 0, downloaded: 0, total: 0 });
        try {
            const result = await window.electronAPI.downloadAndInstallUpdate();
            if (!result.success) {
                setUpdateResult({ success: false, message: t('update.updateFailed') + ': ' + (result.error || '') });
                setDownloadProgress(null);
            }
            // 成功时 app 会自动退出，不需要处理
        } catch (err) {
            setUpdateResult({ success: false, message: t('update.updateFailed') + ': ' + err.message });
            setDownloadProgress(null);
        } finally {
            setUpdating(false);
        }
    };

    // 源码部署：git pull + build
    const handleSourceUpdate = async () => {
        setUpdating(true);
        setUpdateResult(null);
        try {
            const res = await fetch('/api/update-source', { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                if (data.alreadyUpToDate) {
                    setUpdateResult({ success: true, message: t('update.alreadyLatest'), logs: data.logs });
                } else {
                    setUpdateResult({ success: true, message: t('update.updateSuccess'), logs: data.logs });
                }
            } else {
                setUpdateResult({ success: false, message: t('update.updateFailed') + ': ' + (data.error || ''), logs: data.logs });
            }
        } catch (err) {
            setUpdateResult({ success: false, message: t('update.updateFailed') + ': ' + err.message, logs: [] });
        } finally {
            setUpdating(false);
        }
    };

    const handleUpdate = () => {
        if (isElectron) {
            handleElectronUpdate();
        } else if (updateInfo?.isSourceDeploy) {
            handleSourceUpdate();
        }
    };

    if (!updateInfo || dismissed) return null;

    const versionText = t('update.newVersion').replace('{version}', `v${updateInfo.latest}`);
    const canAutoUpdate = isElectron || updateInfo.isSourceDeploy;

    return (
        <div className="update-banner">
            <div className="update-banner-content">
                <span className="update-banner-icon">🔔</span>
                <span className="update-banner-text">{versionText}</span>

                {/* 一键更新（Electron 或 源码部署） */}
                {canAutoUpdate && !updateResult && (
                    <button
                        className="update-banner-link"
                        onClick={handleUpdate}
                        disabled={updating}
                        style={{
                            background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
                            borderRadius: 6, padding: '3px 12px', cursor: updating ? 'wait' : 'pointer',
                            fontWeight: 700, transition: 'all 0.15s',
                        }}
                    >
                        {updating
                            ? (downloadProgress
                                ? `⬇️ ${downloadProgress.progress}%`
                                : t('update.updating'))
                            : t('update.updateNow')
                        }
                    </button>
                )}

                {/* 下载进度条（Electron） */}
                {updating && downloadProgress && downloadProgress.total > 0 && (
                    <div style={{
                        width: 120, height: 6, background: 'rgba(255,255,255,0.2)',
                        borderRadius: 3, overflow: 'hidden', flexShrink: 0,
                    }}>
                        <div style={{
                            width: `${downloadProgress.progress}%`, height: '100%',
                            background: '#a7f3d0', borderRadius: 3,
                            transition: 'width 0.3s ease',
                        }} />
                    </div>
                )}

                {/* 更新结果提示 */}
                {updateResult && (
                    <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: updateResult.success ? '#a7f3d0' : '#fca5a5',
                    }}>
                        {updateResult.message}
                        {updateResult.success && !updateResult.message.includes(t('update.alreadyLatest')) && (
                            <button
                                onClick={() => window.location.reload()}
                                style={{
                                    marginLeft: 8, background: 'rgba(255,255,255,0.25)',
                                    border: '1px solid rgba(255,255,255,0.4)', borderRadius: 6,
                                    padding: '2px 10px', cursor: 'pointer', color: 'inherit',
                                    fontWeight: 700, fontSize: 12,
                                }}
                            >
                                {t('update.refreshNow')}
                            </button>
                        )}
                    </span>
                )}

                {/* 不支持自动更新时：显示下载链接 */}
                {!canAutoUpdate && (
                    <>
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
                    </>
                )}

                <button
                    className="update-banner-dismiss"
                    onClick={handleDismiss}
                    title={t('update.dismiss')}
                >
                    ✕
                </button>
            </div>

            {/* 更新日志（源码部署） */}
            {updateResult?.logs && updateResult.logs.length > 0 && (
                <div style={{
                    background: 'rgba(0,0,0,0.3)', padding: '8px 20px',
                    fontSize: 11, fontFamily: 'var(--font-mono, monospace)',
                    color: 'rgba(255,255,255,0.85)', maxHeight: 120, overflowY: 'auto',
                    lineHeight: 1.6,
                }}>
                    {updateResult.logs.map((l, i) => (
                        <div key={i}>{l.msg}</div>
                    ))}
                </div>
            )}
        </div>
    );
}
