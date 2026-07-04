'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Mail, Lock, CheckCircle2, XCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { useAuthAction } from '../lib/useAuthAction';
import { apiPath } from '../lib/api-base';
import { legalDocPath, setAgreedPolicyVersion } from '../lib/constants';
import BeianNotice from './BeianNotice';
import GoogleIcon from './icons/GoogleIcon';

/**
 * 独立注册弹窗
 * 支持邮箱密码注册 + Google 注册
 */
export default function RegisterModal() {
    const { showRegisterModal, setShowRegisterModal, setShowLoginModal } = useAppStore();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const { t, language } = useI18n();

    const closeModal = useCallback(() => setShowRegisterModal(false), [setShowRegisterModal]);
    const { loading, error, run, resetError } = useAuthAction(closeModal, t('registerModal.registerFailed'));

    // 注册有额外的前置校验，需要手动管理 error
    const [localError, setLocalError] = useState('');
    const displayError = localError || error;

    useEffect(() => {
        if (showRegisterModal) {
            setEmail('');
            setPassword('');
            setConfirmPassword('');
            setLocalError('');
        }
    }, [showRegisterModal]);

    const [agreeChecked, setAgreeChecked] = useState(false); // 勾选同意条款后才允许注册
    useEffect(() => { if (showRegisterModal) setAgreeChecked(false); }, [showRegisterModal]);

    if (!showRegisterModal) return null;

    const handleEmailRegister = () => {
        // 前置校验（这部分是 Register 独有的，不属于通用 auth 流程）
        if (password !== confirmPassword) {
            setLocalError(t('registerModal.passwordMismatch'));
            return;
        }
        if (password.length < 6) {
            setLocalError(t('registerModal.passwordTooShort'));
            return;
        }
        setLocalError('');
        run(async () => {
            const auth = await import('../lib/auth');
            await auth.signUpWithEmail(email, password);
            setAgreedPolicyVersion(); // 注册即同意当前版本政策
        });
    };

    const handleGoogleRegister = () => run(async () => {
        const auth = await import('../lib/auth');
        await auth.signInWithGoogle();
        setAgreedPolicyVersion(); // Google 注册即同意当前版本政策
    });

    const switchToLogin = () => {
        setShowRegisterModal(false);
        setTimeout(() => setShowLoginModal(true), 150);
    };

    // 密码强度指示
    const pwStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;
    const pwColors = ['', '#ef4444', '#f59e0b', '#22c55e'];
    const pwLabels = ['', t('registerModal.pwStrengthWeak'), t('registerModal.pwStrengthMedium'), t('registerModal.pwStrengthStrong')];

    // 法律文档 — 应用内置的本地页面(构建时由根目录 md 生成),点击直接打开,不依赖外部站点
    const termsUrl = apiPath(legalDocPath('TERMS', language));
    const privacyUrl = apiPath(legalDocPath('PRIVACY', language));

    return (
        <div className="login-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowRegisterModal(false); }}>
            <div className="login-modal register-modal" onClick={e => e.stopPropagation()}>
                <button className="login-modal-close" onClick={() => setShowRegisterModal(false)}>
                    <X size={18} />
                </button>

                {/* 头部 */}
                <div className="login-modal-header">
                    <div className="login-modal-icon">
                        <img src={apiPath('/author-logo.png')} alt="Author" className="login-modal-logo-img" />
                    </div>
                    <h2 className="login-modal-title">{t('registerModal.title')}</h2>
                    <p className="login-modal-desc">{t('registerModal.desc')}</p>
                </div>

                {/* 邮箱注册表单 — 放在上面 */}
                <div className="login-modal-form">
                    <div className="login-modal-input-wrap">
                        <Mail size={15} className="login-modal-input-icon" />
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder={t('registerModal.emailPlaceholder')}
                            autoComplete="email"
                            className="login-modal-input"
                        />
                    </div>
                    <div className="login-modal-input-wrap">
                        <Lock size={15} className="login-modal-input-icon" />
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder={t('registerModal.passwordPlaceholder')}
                            autoComplete="new-password"
                            className="login-modal-input"
                        />
                    </div>
                    {/* 密码强度条 */}
                    {password.length > 0 && (
                        <div className="register-pw-strength">
                            <div className="register-pw-bar">
                                <div className="register-pw-fill" style={{ width: `${(pwStrength / 3) * 100}%`, background: pwColors[pwStrength] }} />
                            </div>
                            <span style={{ color: pwColors[pwStrength], fontSize: 11 }}>{pwLabels[pwStrength]}</span>
                        </div>
                    )}
                    <div className="login-modal-input-wrap">
                        <CheckCircle2 size={15} className="login-modal-input-icon" />
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder={t('registerModal.confirmPasswordPlaceholder')}
                            autoComplete="new-password"
                            onKeyDown={e => { if (e.key === 'Enter' && email && password && confirmPassword && agreeChecked) handleEmailRegister(); }}
                            className="login-modal-input"
                        />
                    </div>
                </div>

                {displayError && (
                    <div className="login-modal-error">
                        <XCircle size={13} /> {displayError}
                    </div>
                )}

                <button
                    className="login-modal-submit-btn"
                    onClick={handleEmailRegister}
                    disabled={loading || !email || !password || !confirmPassword || !agreeChecked}
                >
                    {loading ? t('registerModal.registering') : t('registerModal.registerBtn')}
                </button>

                {/* 分隔线 + Google 注册 — 放在下面 */}
                <div className="login-modal-divider"><span>{t('registerModal.or')}</span></div>

                <button
                    className="login-modal-google-btn"
                    onClick={handleGoogleRegister}
                    disabled={loading || !agreeChecked}
                >
                    <GoogleIcon />
                    {t('registerModal.googleRegister')}
                </button>

                <label className="login-modal-agree-row">
                    <input type="checkbox" checked={agreeChecked} onChange={e => setAgreeChecked(e.target.checked)} />
                    <span>
                        {t('policyConsent.checkLabel')}
                        <a href={termsUrl} target="_blank" rel="noopener noreferrer">{t('registerModal.termsOfService')}</a>
                        {t('registerModal.and')}
                        <a href={privacyUrl} target="_blank" rel="noopener noreferrer">{t('registerModal.privacyPolicy')}</a>
                    </span>
                </label>

                <div className="login-modal-switch">
                    {t('registerModal.hasAccount')}<button onClick={switchToLogin}>{t('registerModal.backToLogin')}</button>
                </div>
                <BeianNotice className="login-modal-beian" />
            </div>
        </div>
    );
}
