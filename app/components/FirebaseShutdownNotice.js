'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { getFirebaseShutdownInfo, isAffectedByFirebaseShutdown } from '../lib/firebase-shutdown';

const ACK_KEY = 'author-firebase-shutdown-ack';            // 已确认到哪个阶段(阶段升级会再弹一次)
const COLLAPSE_KEY = 'author-firebase-shutdown-collapsed'; // 横幅收起,仅本次会话

/**
 * 旧版（Firebase）云同步停服公告 —— 两级触达：
 *   弹窗：受影响用户启动时弹出，必须选"立即迁移"或"我知道了"；确认后本阶段不再打扰，
 *         进入下一阶段（剩 ≤3 天 / 已停服）会再弹一次，保证关键节点一定看得到。
 *   横幅：常驻顶部带倒计时，只能收起到本次会话，重启后回来，直到用户启用自建账号为止。
 *
 * 受影响 = 云端可能还有数据的人：Firebase 当前已登录，或曾登录过且尚未启用自建账号。
 * 已完成迁移（自建已登录且旧版已登出）与从未用过云同步的用户完全不打扰。
 */
export default function FirebaseShutdownNotice() {
    const { t } = useI18n();
    const setShowMigrationWizard = useAppStore(state => state.setShowMigrationWizard);

    const [info] = useState(() => getFirebaseShutdownInfo());
    const [atRisk, setAtRisk] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        try { return sessionStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
    });

    // 订阅两套登录态：任一变化都重算是否受影响（迁移完成会登出旧版 → 公告自动消失）
    useEffect(() => {
        let mounted = true;
        let unsubFb = () => {};
        let unsubCustom = () => {};

        const recompute = async () => {
            const affected = await isAffectedByFirebaseShutdown();
            if (mounted) setAtRisk(affected);
        };

        (async () => {
            try {
                const auth = await import('../lib/auth');
                unsubFb = auth.onAuthChange?.(() => recompute()) || (() => {});
            } catch { /* ignore */ }
            try {
                const custom = await import('../lib/custom-auth');
                unsubCustom = custom.onCustomAuthChange?.(() => recompute()) || (() => {});
            } catch { /* ignore */ }
            recompute();
        })();

        return () => {
            mounted = false;
            try { unsubFb(); } catch { /* ignore */ }
            try { unsubCustom(); } catch { /* ignore */ }
        };
    }, []);

    // 受影响且本阶段还没确认过 → 弹窗
    useEffect(() => {
        if (!atRisk) return;
        try {
            if (localStorage.getItem(ACK_KEY) === info.stage) return;
        } catch { /* 读不到就当没确认过,宁可多提醒一次 */ }
        setModalOpen(true);
    }, [atRisk, info.stage]);

    const ack = useCallback(() => {
        try { localStorage.setItem(ACK_KEY, info.stage); } catch { /* ignore */ }
        setModalOpen(false);
    }, [info.stage]);

    const goMigrate = useCallback(() => {
        ack();
        setShowMigrationWizard(true);
    }, [ack, setShowMigrationWizard]);

    const collapse = useCallback(() => {
        try { sessionStorage.setItem(COLLAPSE_KEY, '1'); } catch { /* ignore */ }
        setCollapsed(true);
    }, []);

    if (!atRisk) return null;

    const ended = info.stage === 'ended';
    const countdown = ended ? t('fbShutdown.endedTag') : t('fbShutdown.countdown', { days: info.daysLeft });

    return (
        <>
            {modalOpen && (
                <div className="login-modal-overlay fb-shutdown-overlay">
                    <div className="login-modal fb-shutdown-modal" role="alertdialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                        <div className="login-modal-header">
                            <div className="login-modal-icon fb-shutdown-icon"><AlertTriangle size={22} /></div>
                            <h2 className="login-modal-title">{ended ? t('fbShutdown.titleEnded') : t('fbShutdown.title')}</h2>
                            <p className="login-modal-desc">{ended ? t('fbShutdown.leadEnded') : t('fbShutdown.lead')}</p>
                        </div>

                        <div className={`fb-shutdown-countdown${ended ? ' is-ended' : ''}`}>
                            <b>{countdown}</b>
                            <span>{t('fbShutdown.deadlineLabel', { date: info.date })}</span>
                        </div>

                        <ul className="fb-shutdown-points">
                            <li className="is-warn">{ended ? t('fbShutdown.pointLostEnded') : t('fbShutdown.pointLost')}</li>
                            <li className="is-safe">{t('fbShutdown.pointSafe')}</li>
                            <li>{ended ? t('fbShutdown.pointHowEnded') : t('fbShutdown.pointHow')}</li>
                        </ul>

                        <button className="login-modal-submit-btn" onClick={goMigrate}>
                            {ended ? t('fbShutdown.migrateBtnEnded') : t('fbShutdown.migrateBtn')} <ArrowRight size={15} />
                        </button>
                        <button className="fb-shutdown-ack-btn" onClick={ack}>{t('fbShutdown.ackBtn')}</button>
                    </div>
                </div>
            )}

            {!modalOpen && !collapsed && (
                <div className="sync-notice-banner fb-shutdown-banner" role="status">
                    <AlertTriangle size={14} className="sync-notice-icon" />
                    <span className="sync-notice-text">
                        <b>{ended ? t('fbShutdown.bannerTitleEnded') : t('fbShutdown.bannerTitle')}</b>
                        {ended ? t('fbShutdown.bannerBodyEnded') : t('fbShutdown.bannerBody', { days: info.daysLeft })}
                    </span>
                    <button className="sync-notice-go" onClick={() => setShowMigrationWizard(true)}>
                        {t('fbShutdown.bannerGo')}
                    </button>
                    <button className="sync-notice-dismiss" onClick={collapse} aria-label={t('fbShutdown.collapse')} title={t('fbShutdown.collapse')}>
                        <X size={13} />
                    </button>
                </div>
            )}
        </>
    );
}
