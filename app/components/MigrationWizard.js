'use client';

import { useState, useCallback, useEffect } from 'react';
import { X, Mail, Lock, ShieldCheck, XCircle, CheckCircle2, ArrowLeft, Globe } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { apiPath, OFFICIAL_APP_URL } from '../lib/api-base';
import { isCustomServerConfigured } from '../lib/custom-auth';
import { legalDocPath, setAgreedPolicyVersion } from '../lib/constants';
import { getFirebaseShutdownInfo } from '../lib/firebase-shutdown';
import GoogleIcon from './icons/GoogleIcon';

/**
 * 迁移向导 — 老用户从旧版 Firebase 同步迁移到自建账号。
 *
 * 步骤:
 *   intro   — 说明。确保旧版(Firebase)已登录(或用户确认数据已在本地)。
 *   account — 注册 / 登录自建账号。
 *   upload  — 把本地数据整批上传到自建。
 *   done    — 完成。
 *
 * 数据安全:先从 Firebase 把最新数据拉回本地,再上传到自建;自建新账号云端为空,
 * pull 不会删本地,整个过程只增不删。上传成功后才登出旧版,避免双后端同步打架。
 */
export default function MigrationWizard() {
    const { showMigrationWizard, setShowMigrationWizard } = useAppStore();
    const { t, language } = useI18n();

    const [step, setStep] = useState('intro'); // 'intro' | 'account' | 'upload' | 'done'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fbUser, setFbUser] = useState(null); // 旧版(Firebase)当前用户
    // 是否已配置同步服务器：官方 /app（NEXT_PUBLIC_AUTHOR_CLOUD_URL）恒 true；
    // 开源 / 桌面版未配置 → 不提供就地注册上传（会失败），改为引导去官方网页版完成迁移。
    const [serverConfigured] = useState(() => {
        if (typeof window === 'undefined') return false;
        try { return isCustomServerConfigured(); } catch { return false; }
    });

    // 旧版是否已停服：停服后登录与云端拉取必定失败，intro 要跳过整个旧版环节
    const [fbEnded] = useState(() => getFirebaseShutdownInfo().stage === 'ended');

    // 自建账号表单
    const [isRegister, setIsRegister] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [sendingCode, setSendingCode] = useState(false);
    const [codeCountdown, setCodeCountdown] = useState(0);
    const [codeNotice, setCodeNotice] = useState(null);
    const [agreeChecked, setAgreeChecked] = useState(false); // 勾选同意条款后才允许注册/登录上传

    // 打开时重置 + 检测旧版登录态
    useEffect(() => {
        if (!showMigrationWizard) return;
        setStep('intro'); setLoading(false); setError('');
        setIsRegister(true); setEmail(''); setPassword(''); setCode('');
        setSendingCode(false); setCodeCountdown(0); setCodeNotice(null); setAgreeChecked(false);
        (async () => {
            try {
                const auth = await import('../lib/auth');
                setFbUser(auth.getCurrentUser?.() || null);
            } catch { setFbUser(null); }
        })();
    }, [showMigrationWizard]);

    useEffect(() => {
        if (codeCountdown <= 0) return undefined;
        const timer = setTimeout(() => setCodeCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [codeCountdown]);

    // 挂载时自动检测老用户:用过旧版(Firebase 有账号历史)、还没建自建账号、且没忽略过 → 自动弹一次
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (typeof window === 'undefined') return;
                if (localStorage.getItem('author-migration-dismissed')) return;
                const auth = await import('../lib/auth');
                const custom = await import('../lib/custom-auth');
                const fbHistory = auth.getAccountHistory?.() || [];
                const customHistory = custom.getCustomAccountHistory?.() || [];
                if (!cancelled && fbHistory.length > 0 && customHistory.length === 0 && !custom.isCustomSignedIn?.()) {
                    setShowMigrationWizard(true);
                }
            } catch { /* 检测失败静默,不影响正常使用 */ }
        })();
        return () => { cancelled = true; };
    }, [setShowMigrationWizard]);

    const close = useCallback(() => {
        // 用户主动关闭 = 暂不迁移,记住别再自动弹(手动入口仍可再进)
        try { localStorage.setItem('author-migration-dismissed', '1'); } catch { /* ignore */ }
        setShowMigrationWizard(false);
    }, [setShowMigrationWizard]);

    if (!showMigrationWizard) return null;

    // ── 旧版(Firebase)登录:老用户当前没登录时先登录才能取回数据 ──
    const fbEmailLogin = () => runFb(async (auth) => auth.signInWithEmail(email, password));
    const fbGoogleLogin = () => runFb(async (auth) => auth.signInWithGoogle());
    const runFb = async (fn) => {
        setError(''); setLoading(true);
        try {
            const auth = await import('../lib/auth');
            await fn(auth);
            setFbUser(auth.getCurrentUser?.() || null);
        } catch (e) {
            setError(e?.message || t('migration.firebaseLoginFailed'));
        } finally { setLoading(false); }
    };

    // intro → 从旧版取回最新数据到本地 → account
    const startMigration = async ({ skipPull = false } = {}) => {
        setError(''); setLoading(true);
        try {
            if (!skipPull) {
                const persistence = await import('../lib/persistence');
                const auth = await import('../lib/auth');
                if (auth.isSignedIn?.()) {
                    await persistence.syncFromCloud(); // Firebase pull 最新到本地
                }
            }
            setEmail(''); setPassword(''); setCode(''); setError('');
            setStep('account');
        } catch (e) {
            setError(e?.message || t('migration.pullFailed'));
        } finally { setLoading(false); }
    };

    // 发送自建注册验证码
    const sendCode = async () => {
        if (!email || sendingCode || codeCountdown > 0) return;
        setError(''); setCodeNotice(null); setSendingCode(true);
        try {
            const m = await import('../lib/custom-auth');
            const { retryAfter } = await m.sendEmailCode(email);
            setCodeCountdown(retryAfter || 60);
            setCodeNotice({ type: 'ok', text: t('migration.codeSent') });
        } catch (e) {
            if (e?.retryAfter) setCodeCountdown(e.retryAfter);
            setCodeNotice({ type: 'err', text: e?.message || t('migration.codeSendFailed') });
        } finally { setSendingCode(false); }
    };

    // account:注册 / 登录自建账号 → upload → 整批上传
    const submitAccount = async () => {
        setError(''); setLoading(true);
        try {
            const m = await import('../lib/custom-auth');
            if (isRegister) {
                await m.signUpWithCustomServer(email, password, undefined, code);
            } else {
                await m.signInWithCustomServer(email, password);
            }
            setAgreedPolicyVersion(); // 勾选同意后注册/登录 → 记录已同意当前版本政策
            setStep('upload');
            await doUpload();
        } catch (e) {
            setError(e?.message || t('migration.accountFailed'));
            setLoading(false);
        }
    };

    // upload:整批上传本地数据到自建 → done
    const doUpload = async () => {
        setLoading(true);
        try {
            const persistence = await import('../lib/persistence');
            await persistence.syncToCloud(); // 自建登录态 → pushAllToCloud
            // 迁移成功后登出旧版,避免两个后端同时同步
            try {
                const auth = await import('../lib/auth');
                if (auth.isSignedIn?.()) await auth.signOut();
            } catch { /* 登出失败不影响迁移结果 */ }
            setStep('done');
        } catch (e) {
            setError(e?.message || t('migration.uploadFailed'));
            setStep('account'); // 已登录自建,退回可重试上传
        } finally { setLoading(false); }
    };

    const canSubmitAccount = email && password && (!isRegister || code.length === 6) && !loading && agreeChecked;
    const canSendCode = Boolean(email) && !sendingCode && codeCountdown <= 0 && !loading;

    const emailPasswordFields = (onEnter) => (
        <div className="login-modal-form">
            <div className="login-modal-input-wrap">
                <Mail size={15} className="login-modal-input-icon" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder={t('loginModal.emailPlaceholder')} autoComplete="email" className="login-modal-input" />
            </div>
            <div className="login-modal-input-wrap">
                <Lock size={15} className="login-modal-input-icon" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={t('loginModal.passwordPlaceholder')}
                    onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(); }}
                    className="login-modal-input" />
            </div>
        </div>
    );

    return (
        <div className="login-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
            <div className="login-modal" onClick={e => e.stopPropagation()}>
                <button className="login-modal-close" onClick={close}><X size={18} /></button>

                {/* ==================== 步骤 1:说明 + 旧版登录 ==================== */}
                {step === 'intro' && (
                    <>
                        <div className="login-modal-header">
                            <div className="login-modal-icon">
                                <img src={apiPath('/author-logo.png')} alt="Author" className="login-modal-logo-img" />
                            </div>
                            <h2 className="login-modal-title">{t('migration.title')}</h2>
                            <p className="login-modal-desc">{serverConfigured ? t('migration.introDesc') : t('migration.webOnlyIntro')}</p>
                        </div>

                        <div className="migration-deadline">{fbEnded ? t('migration.deadlineEnded') : t('migration.deadline')}</div>

                        {!serverConfigured ? (
                            /* 开源 / 桌面版：官方服务器未内置，就地注册上传会失败 → 引导去官方网页版完成迁移 */
                            <>
                                <button
                                    className="login-modal-submit-btn login-modal-official-btn"
                                    onClick={() => window.open(OFFICIAL_APP_URL, '_blank', 'noopener,noreferrer')}
                                >
                                    <Globe size={15} /> {t('migration.goWebMigrate')}
                                </button>
                                <div className="login-modal-official-url">{OFFICIAL_APP_URL.replace(/^https?:\/\//, '')}</div>
                                <p className="login-modal-hint">{t('migration.webOnlyHint')}</p>
                            </>
                        ) : (
                            <>
                                {!fbEnded && (
                                    <div className="migration-steps">
                                        <div className="migration-step"><span className="migration-step-num">1</span><span>{t('migration.stepPull')}</span></div>
                                        <div className="migration-step"><span className="migration-step-num">2</span><span>{t('migration.stepAccount')}</span></div>
                                        <div className="migration-step"><span className="migration-step-num">3</span><span>{t('migration.stepUpload')}</span></div>
                                    </div>
                                )}

                                {error && <div className="login-modal-error"><XCircle size={13} /> {error}</div>}

                                {fbEnded ? (
                                    /* 旧版已停服：登录与云端拉取必定失败，直接注册新账号上传本机数据 */
                                    <>
                                        <p className="migration-hint">{t('migration.endedHint')}</p>
                                        <button className="login-modal-submit-btn" onClick={() => startMigration({ skipPull: true })} disabled={loading}>
                                            {t('migration.skipPull')}
                                        </button>
                                    </>
                                ) : fbUser ? (
                                    <>
                                        <div className="migration-fbuser">
                                            <ShieldCheck size={14} />
                                            {t('migration.currentOldAccount')}<b>{fbUser.email || fbUser.displayName || fbUser.uid}</b>
                                        </div>
                                        <button className="login-modal-submit-btn" onClick={() => startMigration()} disabled={loading}>
                                            {loading ? t('migration.pulling') : t('migration.startBtn')}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <p className="migration-hint">{t('migration.needFirebaseLogin')}</p>
                                        {emailPasswordFields(fbEmailLogin)}
                                        <button className="login-modal-submit-btn" onClick={fbEmailLogin} disabled={!email || !password || loading}>
                                            {loading ? t('migration.loggingIn') : t('migration.oldLoginBtn')}
                                        </button>
                                        <button className="login-modal-google-btn" onClick={fbGoogleLogin} disabled={loading}>
                                            <GoogleIcon />{t('loginModal.googleLogin')}
                                        </button>
                                        <button className="login-modal-alt-entry" onClick={() => startMigration({ skipPull: true })} disabled={loading}>
                                            {t('migration.skipPull')}
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* ==================== 步骤 2:自建账号 ==================== */}
                {step === 'account' && (
                    <>
                        <div className="login-modal-header">
                            <div className="login-modal-icon">
                                <img src={apiPath('/author-logo.png')} alt="Author" className="login-modal-logo-img" />
                            </div>
                            <h2 className="login-modal-title">{t('migration.accountTitle')}</h2>
                            <p className="login-modal-desc">{t('migration.accountDesc')}</p>
                        </div>

                        <div className="login-modal-tabs">
                            <button className={`login-modal-tab ${isRegister ? 'active' : ''}`}
                                onClick={() => { setIsRegister(true); setError(''); }}>{t('loginModal.registerTab')}</button>
                            <button className={`login-modal-tab ${!isRegister ? 'active' : ''}`}
                                onClick={() => { setIsRegister(false); setError(''); }}>{t('loginModal.loginTab')}</button>
                        </div>

                        {emailPasswordFields(canSubmitAccount ? submitAccount : undefined)}

                        {isRegister && (
                            <div className="login-modal-code-row">
                                <div className="login-modal-input-wrap login-modal-code-input">
                                    <ShieldCheck size={15} className="login-modal-input-icon" />
                                    <input type="text" inputMode="numeric" maxLength={6} value={code}
                                        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder={t('loginModal.codePlaceholder')} className="login-modal-input" />
                                </div>
                                <button className="login-modal-code-btn" onClick={sendCode} disabled={!canSendCode}>
                                    {codeCountdown > 0 ? `${codeCountdown}s` : sendingCode ? t('loginModal.codeSending') : t('loginModal.sendCode')}
                                </button>
                            </div>
                        )}
                        {isRegister && codeNotice && (
                            <div className={`login-modal-code-notice${codeNotice.type === 'err' ? ' is-error' : ''}`}>{codeNotice.text}</div>
                        )}

                        {error && <div className="login-modal-error"><XCircle size={13} /> {error}</div>}

                        <button className="login-modal-submit-btn" onClick={submitAccount} disabled={!canSubmitAccount}>
                            {loading ? t('migration.working') : (isRegister ? t('migration.registerAndUpload') : t('migration.loginAndUpload'))}
                        </button>

                        <label className="login-modal-agree-row">
                            <input type="checkbox" checked={agreeChecked} onChange={e => setAgreeChecked(e.target.checked)} />
                            <span>
                                {t('policyConsent.checkLabel')}
                                <a href={apiPath(legalDocPath('TERMS', language))} target="_blank" rel="noopener noreferrer">{t('registerModal.termsOfService')}</a>
                                {t('registerModal.and')}
                                <a href={apiPath(legalDocPath('PRIVACY', language))} target="_blank" rel="noopener noreferrer">{t('registerModal.privacyPolicy')}</a>
                            </span>
                        </label>
                        <button className="login-modal-alt-entry" onClick={() => { setStep('intro'); setError(''); }} disabled={loading}>
                            <ArrowLeft size={13} style={{ verticalAlign: 'middle' }} /> {t('migration.back')}
                        </button>
                    </>
                )}

                {/* ==================== 步骤 3:上传中 ==================== */}
                {step === 'upload' && (
                    <div className="migration-progress">
                        <div className="migration-spinner" />
                        <h2 className="login-modal-title">{t('migration.uploadingTitle')}</h2>
                        <p className="login-modal-desc">{t('migration.uploadingDesc')}</p>
                    </div>
                )}

                {/* ==================== 步骤 4:完成 ==================== */}
                {step === 'done' && (
                    <div className="migration-done">
                        <CheckCircle2 size={48} className="migration-done-icon" />
                        <h2 className="login-modal-title">{t('migration.doneTitle')}</h2>
                        <p className="login-modal-desc">{t('migration.doneDesc')}</p>
                        <button className="login-modal-submit-btn" onClick={close}>{t('migration.doneBtn')}</button>
                    </div>
                )}
            </div>
        </div>
    );
}
