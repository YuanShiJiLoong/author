'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../lib/useI18n';
import { findRecoveryOptions, restoreRecoveryOption } from '../lib/work-recovery';
import { waitForLocalSaves } from '../lib/local-save-status';

function formatWhen(time, language, t) {
    if (!time) return t('recovery.timeUnknown');
    const date = new Date(time);
    const now = new Date();
    const clock = date.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hour12: false });
    const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
    if (days === 0) return t('recovery.today', { time: clock });
    if (days === 1) return t('recovery.yesterday', { time: clock });
    const sameYear = date.getFullYear() === now.getFullYear();
    const day = date.toLocaleDateString(language, sameYear ? { month: 'long', day: 'numeric' } : { year: 'numeric', month: 'long', day: 'numeric' });
    return `${day} ${clock}`;
}

function formatWords(words, language, t) {
    // 中文习惯“约 18.6 万字”；其他语言用千位分隔的数字。
    const count = language === 'zh' && words >= 10000
        ? `约${(words / 10000).toFixed(1)}万`
        : words.toLocaleString(language);
    return t('recovery.words', { count });
}

function OptionCard({ option, newest, highlighted, language, t, onClick }) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: onClick ? 'pointer' : 'default',
                padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)',
                border: highlighted ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                color: 'var(--text-primary)', font: 'inherit',
            }}
        >
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{formatWhen(option.time, language, t)}</span>
                {newest && (
                    <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-light)', color: 'var(--accent)' }}>
                        {t('recovery.newest')}
                    </span>
                )}
            </span>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                {t('recovery.chapters', { count: option.chapterCount })} · {formatWords(option.totalWords, language, t)} · {t(`recovery.source.${option.source}`)}
            </span>
        </Tag>
    );
}

/**
 * 作品打不开时显示：程序挑出最新的可恢复版本放在最前面，用户点一下就能恢复。
 * 其他版本收起来备选。
 */
export default function WorkRecoveryPanel({ workId }) {
    const { t, language } = useI18n();
    const [options, setOptions] = useState(null);
    const [selected, setSelected] = useState(0);
    const [showOthers, setShowOthers] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setOptions(null);
        setSelected(0);
        setError('');
        try {
            setOptions(await findRecoveryOptions(workId));
        } catch {
            setOptions([]);
        }
    }, [workId]);

    useEffect(() => {
        let cancelled = false;
        findRecoveryOptions(workId)
            .then(found => { if (!cancelled) setOptions(found); })
            .catch(() => { if (!cancelled) setOptions([]); });
        return () => { cancelled = true; };
    }, [workId]);

    const restore = async (option) => {
        setRestoring(true);
        setError('');
        try {
            await restoreRecoveryOption(workId, option);
            // 刷新前等本地保存写完，否则桌面版的离开保护会拦下刷新。
            await waitForLocalSaves();
            window.location.reload();
        } catch (e) {
            console.error('Work recovery failed:', e);
            setError(t('recovery.failed'));
            setRestoring(false);
        }
    };

    // 自带卡片底色和边框：带背景图的主题下，文字不能直接浮在图上。
    const box = {
        maxWidth: 440, width: 'calc(100% - 32px)', padding: 24, textAlign: 'left', color: 'var(--text-primary)', fontSize: 14,
        background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 16, boxShadow: 'var(--shadow-lg)',
    };
    const title = <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 6px' }}>{t('recovery.title')}</h2>;

    if (options === null) {
        return (
            <div role="status" style={box}>
                {title}
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{t('recovery.looking')}</p>
            </div>
        );
    }

    if (options.length === 0) {
        return (
            <div role="alert" style={box}>
                {title}
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>{t('recovery.nothingFound')}</p>
                <button className="btn btn-ghost" onClick={load}>{t('recovery.lookAgain')}</button>
            </div>
        );
    }

    const current = options[Math.min(selected, options.length - 1)];
    return (
        <div role="alert" style={box}>
            {title}
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>{t('recovery.intro')}</p>
            <OptionCard option={current} newest={current === options[0]} highlighted language={language} t={t} />
            <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
                disabled={restoring}
                onClick={() => restore(current)}
            >
                {restoring ? t('recovery.restoring') : t('recovery.restore')}
            </button>
            {error && <p style={{ color: 'var(--error)', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}
            <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '12px 0 0' }}>{t('recovery.keptNote')}</p>
            {options.length > 1 && (
                <>
                    <button
                        type="button"
                        onClick={() => setShowOthers(v => !v)}
                        style={{ background: 'none', border: 'none', padding: 0, marginTop: 12, color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}
                    >
                        {t('recovery.others', { count: options.length - 1 })} {showOthers ? '▴' : '▾'}
                    </button>
                    {showOthers && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                            {options.map((option, index) => index === selected ? null : (
                                <OptionCard
                                    key={`${option.source}-${option.snapshotId || index}`}
                                    option={option}
                                    newest={index === 0}
                                    highlighted={false}
                                    language={language}
                                    t={t}
                                    onClick={() => setSelected(index)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
