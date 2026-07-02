'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Mail, Lock, XCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { useAuthAction } from '../lib/useAuthAction';
import GoogleIcon from './icons/GoogleIcon';
import WechatIcon from './icons/WechatIcon';
import QQIcon from './icons/QQIcon';
import PhoneIcon from './icons/PhoneIcon';

/**
 * 登录弹窗 — 两层结构：
 *   主区（mode='login' / 'register'）：自建服务器账号（邮箱 + 密码），登录/注册二合一，默认。
 *   次入口（mode='firebase'）：旧版 Firebase 登录（邮箱 + 密码 + Google），供老用户迁移，可返回。
 * 登录后由 useAuthAction → syncFromCloud() 自动按当前登录的后端同步（persistence 分流）。
 */
export default function LoginModal() {
    const { showLoginModal, setShowLoginModal, setShowRegisterModal } = useAppStore();
    const [mode, setMode] = useState('login'); // 'login' | 'register' | 'firebase'
    const [authEmail, setAuthEmail] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [authCode, setAuthCode] = useState('');
    const [sendingCode, setSendingCode] = useState(false);
    const [codeCountdown, setCodeCountdown] = useState(0);
    const [codeNotice, setCodeNotice] = useState(null); // { type: 'ok' | 'err', text }
    const { t } = useI18n();

    const closeModal = useCallback(() => setShowLoginModal(false), [setShowLoginModal]);
    const { loading, error, run, resetError } = useAuthAction(closeModal, t('loginModal.loginFailed'));

    useEffect(() => {
        if (showLoginModal) {
            setAuthEmail('');
            setAuthPassword('');
            setAuthCode('');
            setSendingCode(false);
            setCodeCountdown(0);
            setCodeNotice(null);
            setMode('login');
            resetError?.();
        }
    }, [showLoginModal, resetError]);

    // 验证码发送后的倒计时（防频繁点）
    useEffect(() => {
        if (codeCountdown <= 0) return undefined;
        const timer = setTimeout(() => setCodeCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [codeCountdown]);

    const switchMode = useCallback((next) => { resetError?.(); setMode(next); }, [resetError]);

    if (!showLoginModal) return null;

    // 自建服务器：登录 / 注册
    const handleCustomLogin = () => run(async () => {
        const m = await import('../lib/custom-auth');
        await m.signInWithCustomServer(authEmail, authPassword);
    });
    const handleCustomRegister = () => run(async () => {
        const m = await import('../lib/custom-auth');
        await m.signUpWithCustomServer(authEmail, authPassword, undefined, authCode);
    });
    // 发送邮箱验证码（注册用）。成功启动倒计时；命中限流也按服务端 retryAfter 起倒计时。
    const handleSendCode = async () => {
        if (!authEmail || sendingCode || codeCountdown > 0) return;
        resetError?.();
        setCodeNotice(null);
        setSendingCode(true);
        try {
            const m = await import('../lib/custom-auth');
            const { retryAfter } = await m.sendEmailCode(authEmail);
            setCodeCountdown(retryAfter || 60);
            setCodeNotice({ type: 'ok', text: t('loginModal.codeSent') });
        } catch (err) {
            if (err?.retryAfter) setCodeCountdown(err.retryAfter);
            setCodeNotice({ type: 'err', text: err?.message || t('loginModal.codeSendFailed') });
        } finally {
            setSendingCode(false);
        }
    };
    // Firebase（次入口）：邮箱登录 / Google
    const handleFirebaseLogin = () => run(async () => {
        const auth = await import('../lib/auth');
        await auth.signInWithEmail(authEmail, authPassword);
    });
    const handleGoogleLogin = () => run(async () => {
        const auth = await import('../lib/auth');
        await auth.signInWithGoogle();
    });
    const switchToFirebaseRegister = () => {
        setShowLoginModal(false);
        setTimeout(() => setShowRegisterModal(true), 150);
    };

    const isFirebase = mode === 'firebase';
    const isRegister = mode === 'register';
    const canSubmit = authEmail && authPassword && (!isRegister || authCode.length === 6) && !loading;
    const canSendCode = Boolean(authEmail) && !sendingCode && codeCountdown <= 0 && !loading;
    const primarySubmit = isRegister ? handleCustomRegister : handleCustomLogin;

    const emailPasswordFields = (onEnterSubmit) => (
        <div className="login-modal-form">
            <div className="login-modal-input-wrap">
                <Mail size={15} className="login-modal-input-icon" />
                <input
                    type="email"
                    value={authEmail}
                    onChange={e => setAuthEmail(e.target.value)}
                    placeholder={t('loginModal.emailPlaceholder')}
                    autoComplete="email"
                    className="login-modal-input"
                />
            </div>
            <div className="login-modal-input-wrap">
                <Lock size={15} className="login-modal-input-icon" />
                <input
                    type="password"
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    placeholder={t('loginModal.passwordPlaceholder')}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    onKeyDown={e => { if (e.key === 'Enter' && canSubmit) onEnterSubmit(); }}
                    className="login-modal-input"
                />
            </div>
        </div>
    );

    return (
        <div className="login-modal-overlay" onClick={() => setShowLoginModal(false)}>
            <div className="login-modal" onClick={e => e.stopPropagation()}>
                <button className="login-modal-close" onClick={() => setShowLoginModal(false)}>
                    <X size={18} />
                </button>

                {isFirebase ? (
                    // ==================== Firebase 次入口 ====================
                    <>
                        <button className="login-modal-back" onClick={() => switchMode('login')}>
                            <ArrowLeft size={15} /> {t('loginModal.back')}
                        </button>

                        <div className="login-modal-header">
                            <h2 className="login-modal-title">{t('loginModal.firebaseTitle')}</h2>
                            <p className="login-modal-desc">{t('loginModal.firebaseDesc')}</p>
                        </div>

                        {emailPasswordFields(handleFirebaseLogin)}

                        {error && <div className="login-modal-error"><XCircle size={13} /> {error}</div>}

                        <button className="login-modal-submit-btn" onClick={handleFirebaseLogin} disabled={!canSubmit}>
                            {loading ? t('loginModal.loggingIn') : t('loginModal.loginBtn')}
                        </button>

                        <div className="login-modal-divider"><span>{t('loginModal.or')}</span></div>

                        <button className="login-modal-google-btn" onClick={handleGoogleLogin} disabled={loading}>
                            <GoogleIcon />
                            {t('loginModal.googleLogin')}
                        </button>

                        <div className="login-modal-switch">
                            {t('loginModal.noAccount')}<button onClick={switchToFirebaseRegister}>{t('loginModal.registerNow')}</button>
                        </div>
                    </>
                ) : (
                    // ==================== 主区：自建服务器账号 ====================
                    <>
                        <div className="login-modal-header">
                            <div className="login-modal-icon">
                                <img src="/author-logo.png" alt="Author" className="login-modal-logo-img" />
                            </div>
                            <h2 className="login-modal-title">{t('loginModal.title')}</h2>
                            <p className="login-modal-desc">{t('loginModal.desc')}</p>
                        </div>

                        <div className="login-modal-tabs">
                            <button
                                className={`login-modal-tab ${!isRegister ? 'active' : ''}`}
                                onClick={() => switchMode('login')}
                            >{t('loginModal.loginTab')}</button>
                            <button
                                className={`login-modal-tab ${isRegister ? 'active' : ''}`}
                                onClick={() => switchMode('register')}
                            >{t('loginModal.registerTab')}</button>
                        </div>

                        {emailPasswordFields(primarySubmit)}

                        {isRegister && (
                            <div className="login-modal-code-row">
                                <div className="login-modal-input-wrap login-modal-code-input">
                                    <ShieldCheck size={15} className="login-modal-input-icon" />
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        value={authCode}
                                        onChange={e => setAuthCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder={t('loginModal.codePlaceholder')}
                                        onKeyDown={e => { if (e.key === 'Enter' && canSubmit) primarySubmit(); }}
                                        className="login-modal-input"
                                    />
                                </div>
                                <button className="login-modal-code-btn" onClick={handleSendCode} disabled={!canSendCode}>
                                    {codeCountdown > 0
                                        ? `${codeCountdown}s`
                                        : sendingCode ? t('loginModal.codeSending') : t('loginModal.sendCode')}
                                </button>
                            </div>
                        )}

                        {isRegister && codeNotice && (
                            <div className={`login-modal-code-notice${codeNotice.type === 'err' ? ' is-error' : ''}`}>
                                {codeNotice.text}
                            </div>
                        )}

                        {error && <div className="login-modal-error"><XCircle size={13} /> {error}</div>}

                        <button className="login-modal-submit-btn" onClick={primarySubmit} disabled={!canSubmit}>
                            {loading
                                ? (isRegister ? t('loginModal.registering') : t('loginModal.loggingIn'))
                                : (isRegister ? t('loginModal.registerBtn') : t('loginModal.loginBtn'))}
                        </button>

                        {/* 其他登录方式（占位，即将推出：需短信/第三方 OAuth 后端） */}
                        <div className="login-modal-soon">
                            <div className="login-modal-soon-label">{t('loginModal.otherMethods')} · {t('loginModal.comingSoon')}</div>
                            <div className="login-modal-soon-row">
                                <button className="login-modal-soon-btn" disabled title={t('loginModal.comingSoon')}>
                                    <PhoneIcon size={15} /> {t('loginModal.phone')}
                                </button>
                                <button className="login-modal-soon-btn" disabled title={t('loginModal.comingSoon')}>
                                    <WechatIcon size={15} /> {t('loginModal.wechat')}
                                </button>
                                <button className="login-modal-soon-btn" disabled title={t('loginModal.comingSoon')}>
                                    <QQIcon size={15} /> QQ
                                </button>
                            </div>
                        </div>

                        <button className="login-modal-alt-entry" onClick={() => switchMode('firebase')}>
                            {t('loginModal.useFirebaseEntry')}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
