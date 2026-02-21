'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { getSnapshots, createSnapshot, restoreSnapshot, deleteSnapshot } from '../lib/snapshots';

export default function SnapshotManager({ onRestored }) {
    const { showSnapshots: open, setShowSnapshots } = useAppStore();
    const onClose = () => setShowSnapshots(false);
    const { t } = useI18n();

    const [snapshots, setSnapshots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const [isRestoring, setIsRestoring] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const loadData = async () => {
        setLoading(true);
        const data = await getSnapshots();
        setSnapshots(data);
        if (data.length > 0 && !selectedId) {
            setSelectedId(data[0].id);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (open) {
            loadData();
        }
    }, [open]);

    if (!open) return null;

    const handleCreateManual = async () => {
        const label = prompt(t('snapshot.promptLabel'), t('snapshot.promptDefault'));
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
            await restoreSnapshot(snap.id);
            alert(t('snapshot.restoreSuccess'));
            if (onRestored) onRestored();
            else window.location.reload();
        } catch (e) {
            alert(t('snapshot.restoreFailed') + e.message);
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

    const formatDate = (ts) => {
        const d = new Date(ts);
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="settings-panel-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="settings-panel-container" onClick={e => e.stopPropagation()} style={{ width: 800, maxWidth: '90vw', height: '80vh' }}>
                <div className="settings-header">
                    <h2>{t('snapshot.title')}
                        <span className="subtitle">— {t('snapshot.subtitle')}</span>
                    </h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
                </div>

                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* 左侧列表 */}
                    <div style={{ width: 300, borderRight: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
                        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: 10 }}>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCreateManual} disabled={isCreating}>
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
                                                {s.type === 'manual' ? '⭐ ' : ''}{s.label}
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
                                <h3 style={{ fontSize: 20, marginBottom: 8 }}>{selectedSnap.type === 'manual' ? '⭐ ' : ''}{selectedSnap.label}</h3>
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
                                    <button
                                        className="btn btn-primary"
                                        style={{ background: 'var(--error)', borderColor: 'var(--error)', padding: '10px 24px', fontSize: 14 }}
                                        onClick={handleRestore}
                                        disabled={isRestoring}
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
