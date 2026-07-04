'use client';

import { useState, useEffect } from 'react';
import { Bell, RefreshCw, X, Download } from 'lucide-react';
import { useI18n } from '../lib/useI18n';
import { localizeApiError } from '../lib/api-error-i18n';
import { tt } from '../lib/runtime-i18n';
import { apiPath } from '../lib/api-base';

// 自动更新进度的步骤标签按 step 号本地化（服务端发的 label 为中文兜底）
export function stepLabel(sp) {
    const map = {
        1: tt('🔄 拉取最新代码', '🔄 Pulling latest code', '🔄 Получение последнего кода'),
        2: tt('📦 安装依赖', '📦 Installing dependencies', '📦 Установка зависимостей'),
        3: tt('🔨 构建项目', '🔨 Building project', '🔨 Сборка проекта'),
    };
    return map[sp.step] || sp.label || '';
}

export default function UpdateBanner() {
    const { t } = useI18n();
    const [updateInfo, setUpdateInfo] = useState(null);
    const [dismissed, setDismissed] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [updateResult, setUpdateResult] = useState(null); // { success, message }
    const [downloadProgress, setDownloadProgress] = useState(null); // { progress, downloaded, total }
    const [sourceProgress, setSourceProgress] = useState(null); // { step, total, label, status }
    const [downloaded, setDownloaded] = useState(false); // 下载完成，等待安装

    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

    // ===== Electron 模式：监听 electron-updater 事件 =====
    useEffect(() => {
        if (!isElectron) return;

        // 监听 update-available 事件（由 main 进程自动检查后推送）
        window.electronAPI.onUpdateAvailable?.((data) => {
            const dismissedVersion = sessionStorage.getItem('author-update-dismissed');
            if (dismissedVersion === data.version) return;
            setUpdateInfo({
                hasUpdate: true,
                latest: data.version,
                isElectronNative: true,
            });
        });

        // 监听下载进度
        window.electronAPI.onUpdateProgress?.((data) => {
            setDownloadProgress(data);
        });

        // 监听下载完成
        window.electronAPI.onUpdateDownloaded?.((data) => {
            setDownloaded(true);
            setUpdating(false);
            setDownloadProgress(null);
        });

        // 监听错误
        window.electronAPI.onUpdateError?.((data) => {
            setUpdateResult({ success: false, message: t('update.updateFailed') + ': ' + (data.error || '') });
            setUpdating(false);
            setDownloadProgress(null);
        });
    }, [isElectron, t]);

    // ===== Web 模式：API 检查更新 =====
    useEffect(() => {
        if (isElectron) return; // Electron 由 main 进程自动检查

        const checkUpdate = async () => {
            try {
                const res = await fetch(apiPath('/api/check-update'), { cache: 'no-store' });
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
    }, [isElectron]);

    const handleDismiss = () => {
        setDismissed(true);
        if (updateInfo?.latest) {
            sessionStorage.setItem('author-update-dismissed', updateInfo.latest);
        }
    };

    // Electron 客户端：通过 electron-updater 下载
    const handleElectronUpdate = async () => {
        setUpdating(true);
        setUpdateResult(null);
        setDownloadProgress({ progress: 0, downloaded: 0, total: 0 });
        try {
            const result = await window.electronAPI.downloadUpdate();
            if (!result.success) {
                setUpdateResult({ success: false, message: t('update.updateFailed') + ': ' + (result.error || '') });
                setDownloadProgress(null);
                setUpdating(false);
            }
            // 下载成功后由 onUpdateDownloaded 事件处理
        } catch (err) {
            setUpdateResult({ success: false, message: t('update.updateFailed') + ': ' + err.message });
            setDownloadProgress(null);
            setUpdating(false);
        }
    };

    // Electron 客户端：退出并安装
    const handleQuitAndInstall = () => {
        window.electronAPI.quitAndInstall();
    };

    // 源码部署：SSE 流式更新
    const handleSourceUpdate = async () => {
        setUpdating(true);
        setUpdateResult(null);
        setSourceProgress(null);
        try {
            const res = await fetch(apiPath('/api/update-source-stream'), { method: 'POST' });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const block of lines) {
                    const dataLine = block.split('\n').find(l => l.startsWith('data: '));
                    if (!dataLine) continue;
                    const data = JSON.parse(dataLine.slice(6));

                    if (data.done) {
                        if (data.success) {
                            if (data.needRestart) {
                                // 代码已更新或之前更新过但未重启
                                const ver = data.diskVersion ? ` v${data.diskVersion}` : '';
                                setUpdateResult({ success: true, message: `代码已更新到${ver}，请重启服务生效`, needRestart: true });
                            } else if (data.alreadyUpToDate) {
                                setUpdateResult({ success: true, message: t('update.alreadyLatest') });
                            } else {
                                setUpdateResult({ success: true, message: t('update.updateSuccess') });
                            }
                        } else {
                            setUpdateResult({ success: false, message: t('update.updateFailed') + ': ' + (localizeApiError(data, tt) || '') });
                        }
                        setSourceProgress(null);
                    } else {
                        setSourceProgress(data);
                    }
                }
            }
        } catch (err) {
            setUpdateResult({ success: false, message: t('update.updateFailed') + ': ' + err.message });
            setSourceProgress(null);
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
                <span className="update-banner-icon"><Bell size={15} /></span>
                <span className="update-banner-text">{versionText}</span>

                {/* 下载完成 → 显示重启按钮（仅 Electron） */}
                {downloaded && (
                    <button
                        className="update-banner-link"
                        onClick={handleQuitAndInstall}
                        style={{
                            background: 'rgba(167,243,208,0.3)', border: '1px solid rgba(167,243,208,0.6)',
                            borderRadius: 6, padding: '3px 12px', cursor: 'pointer',
                            fontWeight: 700, transition: 'all 0.15s', color: '#a7f3d0',
                        }}
                    >
                        <RefreshCw size={13} style={{ marginRight: 4 }} />{t('update.restartNow') || '立即重启安装'}
                    </button>
                )}

                {/* 一键更新（未下载完成时） */}
                {canAutoUpdate && !updateResult && !downloaded && (
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
                                ? `⬇ ${downloadProgress.progress}%`
                                : sourceProgress
                                    ? `${stepLabel(sourceProgress)} (${sourceProgress.step}/${sourceProgress.total})`
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

                {/* 源码更新进度条 */}
                {updating && sourceProgress && (
                    <div style={{
                        width: 120, height: 6, background: 'rgba(255,255,255,0.2)',
                        borderRadius: 3, overflow: 'hidden', flexShrink: 0,
                    }}>
                        <div style={{
                            width: `${(sourceProgress.step / sourceProgress.total) * 100}%`, height: '100%',
                            background: sourceProgress.status === 'error' ? '#fca5a5' : '#a7f3d0',
                            borderRadius: 3, transition: 'width 0.5s ease',
                        }} />
                    </div>
                )}

                {/* 更新结果提示 */}
                {updateResult && (
                    <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: updateResult.success ? (updateResult.needRestart ? '#fbbf24' : '#a7f3d0') : '#fca5a5',
                    }}>
                        {updateResult.needRestart ? '⚠️ ' : ''}{updateResult.message}
                        {updateResult.success && !updateResult.message.includes(t('update.alreadyLatest')) && !updateResult.needRestart && (
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
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
