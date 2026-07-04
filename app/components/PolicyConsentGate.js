'use client';

import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useI18n } from '../lib/useI18n';
import { apiPath } from '../lib/api-base';
import { legalDocPath, POLICY_VERSION, getAgreedPolicyVersion, setAgreedPolicyVersion } from '../lib/constants';

/**
 * 政策更新同意闸 —— 已登录用户在《服务条款》/《隐私政策》实质更新后，必须重新阅读并同意
 * 才能继续使用登录账号与云同步；不同意则登出（自建 + 旧版 Firebase 一并登出）。
 * 未登录 / 开源未配置服务器的用户不受影响。
 *
 * 自包含：订阅两套登录态，命中"已登录且已同意版本 ≠ 当前 POLICY_VERSION"即弹出；
 * 弹窗不可点背景关闭，必须"同意并继续"或"不同意，退出登录"二选一。
 */
export default function PolicyConsentGate() {
    const { t, language } = useI18n();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let mounted = true;
        let unsubCustom = () => {};
        let unsubFb = () => {};
        const check = (hasUser) => {
            if (!mounted) return;
            if (hasUser && getAgreedPolicyVersion() !== POLICY_VERSION) setOpen(true);
            else if (!hasUser) setOpen(false);
        };
        (async () => {
            try {
                const custom = await import('../lib/custom-auth');
                unsubCustom = custom.onCustomAuthChange?.((u) => check(!!u)) || (() => {});
            } catch { /* ignore */ }
            try {
                const auth = await import('../lib/auth');
                unsubFb = auth.onAuthChange?.((u) => check(!!u)) || (() => {});
            } catch { /* ignore */ }
        })();
        return () => {
            mounted = false;
            try { unsubCustom(); } catch { /* ignore */ }
            try { unsubFb(); } catch { /* ignore */ }
        };
    }, []);

    const agree = useCallback(() => {
        setAgreedPolicyVersion(POLICY_VERSION);
        setOpen(false);
    }, []);

    const disagree = useCallback(async () => {
        setBusy(true);
        try { const custom = await import('../lib/custom-auth'); await custom.signOutCustom?.(); } catch { /* ignore */ }
        try { const auth = await import('../lib/auth'); await auth.signOut?.(); } catch { /* ignore */ }
        setBusy(false);
        setOpen(false);
    }, []);

    if (!open) return null;

    return (
        <div className="login-modal-overlay policy-consent-overlay">
            <div className="login-modal policy-consent-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                <div className="login-modal-header">
                    <div className="login-modal-icon"><ShieldCheck size={22} /></div>
                    <h2 className="login-modal-title">{t('policyConsent.title')}</h2>
                    <p className="login-modal-desc">{t('policyConsent.desc')}</p>
                </div>

                <p className="login-modal-terms policy-consent-links">
                    {t('policyConsent.readPrompt')}
                    <a href={apiPath(legalDocPath('TERMS', language))} target="_blank" rel="noopener noreferrer">{t('registerModal.termsOfService')}</a>
                    {t('registerModal.and')}
                    <a href={apiPath(legalDocPath('PRIVACY', language))} target="_blank" rel="noopener noreferrer">{t('registerModal.privacyPolicy')}</a>
                </p>

                <button className="login-modal-submit-btn" onClick={agree} disabled={busy}>
                    {t('policyConsent.agree')}
                </button>
                <button className="login-modal-alt-entry" onClick={disagree} disabled={busy}>
                    {busy ? t('policyConsent.signingOut') : t('policyConsent.disagree')}
                </button>
            </div>
        </div>
    );
}
