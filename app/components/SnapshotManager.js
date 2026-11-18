'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Star } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { getSnapshots, createSnapshot, restoreSnapshot, deleteSnapshot, getPendingSnapshotRestore, getSnapshotChapters, CURRENT_UNREADABLE_CODE } from '../lib/snapshots';
import { exportWorkAsMarkdown } from '../lib/project-io';
import { promptInput } from '../lib/promptInput';
import { waitForLocalSaves } from '../lib/local-save-status';

export default function SnapshotManager({ onRestored }) {
    const { showSnapshots: open, setShowSnapshots } = useAppStore();
    const onClose = () => setShowSnapshots(false);
    const { t } = useI18n();

    const [snapshots, setSnapshots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const [isRestoring, setIsRestoring] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [pendingRestore, setPendingRestore] = useState(null);
    const [loadError, setLoadError] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [data, pending] = await Promise.all([getSnapshots(), getPendingSnapshotRestore()]);
            setSnapshots(data);
            setPendingRestore(pending);
            setLoadError('');
            setSelectedId(previous => data.some(snap => snap.id === previous) ? previous : data[0]?.id || null);
        } catch {
            setLoadError(t('snapshot.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        if (open) {
            loadData();
        }
    }, [open, loadData]);

    if (!open) return null;

    const handleCreateManual = async () => {
        const label = await promptInput(t('snapshot.promptLabel'), t('snapshot.promptDefault'));
        if (!label) return;
        setIsCreating(true);
        try {
            const snap = await createSnapshot(label, 'manual');
            await loadData();
            setSelectedId(snap.id);
        } catch (e) {
            alert(t('snapshot.createFailed') + e.message);
        } finally {
            setIsCreating(false);
        }
    };

    const handleRestore = async () => {
        if (!selectedId) return;
        const snap = snapshots.find(s => s.id === selectedId);
        if (!snap) return;

        const confirmMsg = t('snapshot.confirmRestore')
            .replace('{label}', snap.label)
            .replace('{date}', new Date(snap.timestamp).toLocaleString());
        if (!confirm(confirmMsg)) {
            return;
        }

        setIsRestoring(true);
        try {
            try {
                await restoreSnapshot(snap.id);
            } catch (e) {
                // 当前作品有读不出的内容，没法先备份它：问过用户再用快照替换。
                if (e?.code !== CURRENT_UNREADABLE_CODE) throw e;
                if (!confirm(t('snapshot.confirmReplaceUnreadable'))) return;
                await restoreSnapshot(snap.id, { replaceUnreadable: true });
            }
            // Restored conversations can schedule a local autosave. Finish it
            // before reloading, or Electron's unload guard cancels the refresh
            // and leaves the editor showing the pre-restore document.
            await waitForLocalSaves();
            alert(t('snapshot.restoreSuccess'));
            if (onRestored) onRestored();
            else window.location.reload();
        } catch (e) {
            alert(t('snapshot.restoreFailed') + e.message);
            await loadData();
        } finally {
            setIsRestoring(false);
        }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!confirm(t('snapshot.confirmDelete'))) return;
        try {
            const remaining = await deleteSnapshot(id);
            setSnapshots(remaining);
            if (selectedId === id) setSelectedId(remaining[0]?.id || null);
        } catch (err) {
            alert(t('snapshot.deleteFailed'));
        }
    };

    const selectedSnap = snapshots.find(s => s.id === selectedId);

    const exportSnapshotChapters = async () => {
        try {
            const chapters = await getSnapshotChapters(selectedId);
            await exportWorkAsMarkdown(chapters, selectedSnap.label);
        } catch (error) {
            alert(t('sidebar.projectExportFailed', { error: error.message }));
        }
    };

    const formatDate = (ts) => {
        const d = new Date(ts);
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="settings-panel-overlay" onMouseDown={e => { e.currentTarget._mouseDownTarget = e.target; }} onClick={e => { if (e.currentTarget._mouseDownTarget === e.currentTarget) onClose(); }} style={{ zIndex: 9999 }}>
            <div className="settings-panel-container" onClick={e => e.stopPropagation()} style={{ width: 800, maxWidth: '90vw', height: '80vh' }}>
                <div className="settings-header">
                    <h2>{t('snapshot.title')}
                        <span className="subtitle">— {t('snapshot.subtitle')}</span>
                    </h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
                </div>

                {loadError && <div role="alert" style={{ padding: 12, color: 'var(--error)' }}>{loadError}</div>}
                {pendingRestore && (
                    <div role="alert" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-primary)' }}>
                        <p style={{ margin: '0 0 8px', fontSize: 13 }}>{t('snapshot.interruptedRestore')}</p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost" disabled={isRestoring} onClick={() => setSelectedId(pendingRestore.backupId)}>{t('snapshot.selectRecoveryBackup')}</button>
                            <button className="btn btn-ghost" disabled={isRestoring} onClick={() => setSelectedId(pendingRestore.snapshotId)}>{t('snapshot.selectRestoreTarget')}</button>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* 左侧列表 */}
                    <div style={{ width: 300, borderRight: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
                        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: 10 }}>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCreateManual} disabled={isCreating || isRestoring || !!loadError}>
                                {isCreating ? t('snapshot.creating') : t('snapshot.createBtn')}
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                            {loading ? (
                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>{t('snapshot.loading')}</div>
                            ) : snapshots.length === 0 ? (
                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>{t('snapshot.empty')}</div>
                            ) : (
                                snapshots.map(s => (
                                    <div
                                        key={s.id}
                                        onClick={() => setSelectedId(s.id)}
                                        style={{
                                            padding: '12px 14px',
                                            marginBottom: 8,
                                            borderRadius: 'var(--radius-md)',
                                            border: s.id === selectedId ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                                            background: s.id === selectedId ? 'var(--accent-light)' : 'var(--bg-secondary)',
                                            cursor: 'pointer',
                                            position: 'relative',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <strong style={{ fontSize: 13, color: s.id === selectedId ? 'var(--accent)' : 'var(--text-primary)' }}>
                                                {s.type === 'manual' ? <><Star size={12} style={{ marginRight: 4 }} /></> : ''}{s.label}
                                            </strong>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(s.timestamp)}</span>
                                        </div>
                                        <div style={{ display: 'flex', fontSize: 11, color: 'var(--text-secondary)', gap: 12 }}>
                                            <span>{t('snapshot.countChapters').replace('{count}', s.stats?.chapterCount || 0)}</span>
                                            <span>{t('snapshot.countWords').replace('{count}', Math.round((s.stats?.totalWords || 0) / 1000))}</span>
                                            <span>{t('snapshot.countSettings').replace('{count}', s.stats?.settingCount || 0)}</span>
                                        </div>
                                        {/* 删除按钮 */}
                                        <button
                                            onClick={(e) => handleDelete(s.id, e)}
                                            disabled={isRestoring || isCreating || !!loadError || [pendingRestore?.snapshotId, pendingRestore?.backupId].includes(s.id)}
                                            style={{
                                                position: 'absolute', right: 10, bottom: 10,
                                                background: 'none', border: 'none', color: 'var(--error)',
                                                cursor: 'pointer', opacity: 0.5, fontSize: 12
                                            }}
                                            onMouseEnter={e => e.target.style.opacity = 1}
                                            onMouseLeave={e => e.target.style.opacity = 0.5}
                                        >
                                            {t('snapshot.deleteBtn')}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* 右侧详情 */}
                    <div style={{ flex: 1, padding: '30px', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', overflowY: 'auto' }}>
                        {selectedSnap ? (
                            <>
                                <h3 style={{ fontSize: 20, marginBottom: 8 }}>{selectedSnap.type === 'manual' ? <Star size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom', color: 'var(--accent)' }} /> : null}{selectedSnap.label}</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
                                    {t('snapshot.createdAt')} {new Date(selectedSnap.timestamp).toLocaleString()}
                                    {selectedSnap.type === 'auto' && ` ${t('snapshot.autoLabel')}`}
                                </p>

                                <div style={{ display: 'flex', gap: 16, marginBottom: 30 }}>
                                    <div style={{ flex: 1, background: 'var(--bg-primary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedSnap.stats?.chapterCount || 0}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('snapshot.chapterCount')}</div>
                                    </div>
                                    <div style={{ flex: 1, background: 'var(--bg-primary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{(selectedSnap.stats?.totalWords || 0).toLocaleString()}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('snapshot.totalWords')}</div>
                                    </div>
                                    <div style={{ flex: 1, background: 'var(--bg-primary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedSnap.stats?.settingCount || 0}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('snapshot.settingCount')}</div>
                                    </div>
                                </div>

                                <div style={{ marginBottom: 30 }}>
                                    <h4 style={{ fontSize: 14, marginBottom: 10, color: 'var(--text-secondary)' }}>{t('snapshot.includedChapters')}</h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {(selectedSnap.data?.chapters || []).slice(0, 10).map(ch => (
                                            <span key={ch.id} style={{ fontSize: 12, padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
                                                {ch.title}
                                            </span>
                                        ))}
                                        {(selectedSnap.data?.chapters || []).length > 10 && (
                                            <span style={{ fontSize: 12, padding: '4px 8px', color: 'var(--text-muted)' }}>{t('snapshot.andMore')}</span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid var(--border-light)', textAlign: 'right' }}>
                                    <button className="btn btn-ghost" onClick={exportSnapshotChapters} disabled={loading || !!loadError || !selectedSnap.data?.chapters?.length}>
                                        {t('snapshot.exportChapters')}
                                    </button>
                                    <button
                                        className="btn btn-primary"
                                        style={{ background: 'var(--error)', borderColor: 'var(--error)', padding: '10px 24px', fontSize: 14 }}
                                        onClick={handleRestore}
                                        disabled={isRestoring || isCreating || loading || !!loadError}
                                    >
                                        {isRestoring ? t('snapshot.restoring') : t('snapshot.restoreBtn')}
                                    </button>
                                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                                        {t('snapshot.restoreWarning')}
                                    </p>
                                </div>
                            </>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                                {t('snapshot.selectHint')}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
