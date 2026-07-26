'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';

export default function WelcomeModal() {
    const { language, setLanguage, visualTheme, setVisualTheme, setShowLoginModal } = useAppStore();
    const { t, text } = useI18n();
    const [step, setStep] = useState(1);
    const [isVisible, setIsVisible] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (!language || !visualTheme) {
            setIsVisible(true);
            if (!language) {
                setStep(1);
            } else {
                setStep(2);
            }
        }
    }, [language, visualTheme]);

    if (!mounted || !isVisible) return null;

    const handleSelectLang = (lang) => {
        setLanguage(lang);
        setStep(2);
    };

    const handleSelectTheme = (theme) => {
        setVisualTheme(theme);
        document.documentElement.setAttribute('data-visual', theme);
    };

    const handleGoToStep3 = () => {
        if (!visualTheme) {
            handleSelectTheme('warm');
        }
        setStep(3);
    };

    const handleStart = () => {
        setIsVisible(false);
        if (!localStorage.getItem('author-onboarding-done')) {
            useAppStore.getState().setStartTour(true);
        }
    };

    const handleLoginNow = () => {
        setIsVisible(false);
        if (!localStorage.getItem('author-onboarding-done')) {
            useAppStore.getState().setStartTour(true);
        }
        setTimeout(() => setShowLoginModal(true), 300);
    };

    return (
        <div className="welcome-modal-overlay">
            <div className={`welcome-modal-container ${step === 2 ? 'step-2' : ''} ${step === 3 ? 'step-3' : ''}`}>
                {/* Step 1: Language */}
                {step === 1 && (
                    <div className="welcome-step fadeIn">
                        <h1 className="welcome-title">Welcome / 欢迎 / Добро пожаловать</h1>
                        <div className="welcome-lang-grid">
                            <button className="welcome-card" onClick={() => handleSelectLang('en')}>
                                <span className="welcome-icon">🇬🇧</span>
                                <span className="welcome-label">English</span>
                            </button>
                            <button className="welcome-card" onClick={() => handleSelectLang('zh')}>
                                <span className="welcome-icon">🇨🇳</span>
                                <span className="welcome-label">简体中文</span>
                            </button>
                            <button className="welcome-card" onClick={() => handleSelectLang('ru')}>
                                <span className="welcome-icon">🇷🇺</span>
                                <span className="welcome-label">Русский</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Theme */}
                {step === 2 && (
                    <div className="welcome-step fadeIn">
                        <h1 className="welcome-title" style={{ marginBottom: 8 }}>{t('welcome.title')}</h1>
                        <p className="welcome-subtitle" style={{ marginBottom: 32 }}>{t('welcome.subtitle')}</p>

                        <h3 className="welcome-section-title">{t('welcome.selectTheme')}</h3>
                        <div className="welcome-theme-grid">
                            <button
                                className={`welcome-card theme-card ${visualTheme === 'warm' ? 'active' : ''}`}
                                onClick={() => handleSelectTheme('warm')}
                            >
                                <div className="theme-preview warm-preview"></div>
                                <div className="theme-info">
                                    <h4>{t('welcome.themeWarm.name')}</h4>
                                    <p>{t('welcome.themeWarm.desc')}</p>
                                </div>
                            </button>

                            <button
                                className={`welcome-card theme-card ${visualTheme === 'modern' ? 'active' : ''}`}
                                onClick={() => handleSelectTheme('modern')}
                            >
                                <div className="theme-preview modern-preview"></div>
                                <div className="theme-info">
                                    <h4>{t('welcome.themeModern.name')}</h4>
                                    <p>{t('welcome.themeModern.desc')}</p>
                                </div>
                            </button>
                        </div>

                        <div className="welcome-actions">
                            <button
                                className="btn btn-primary btn-large welcome-start-btn"
                                onClick={handleGoToStep3}
                                disabled={!visualTheme}
                            >
                                {t('welcome.nextBtn') || '下一步'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Cloud Sync */}
                {step === 3 && (
                    <div className="welcome-step fadeIn">
                        <h1 className="welcome-title" style={{ marginBottom: 8 }}>
                            {text('☁️ 开启云同步', '☁️ Cloud Sync', '☁️ Облачная синхронизация')}
                        </h1>
                        <p className="welcome-subtitle" style={{ marginBottom: 28 }}>
                            {text(
                                '多设备无缝同步，创作永不丢失。',
                                'Sync your work across devices, never lose your creations.',
                                'Синхронизируйте работу на разных устройствах, чтобы не потерять рукописи.'
                            )}
                        </p>

                        <div className="welcome-cloud-features">
                            <div className="welcome-cloud-feature">
                                <div className="welcome-cloud-feature-icon">☁️</div>
                                <div>
                                    <h4>{text('自动备份', 'Auto Backup', 'Авто-резервирование')}</h4>
                                    <p>{text('可备份到账号云端或你自己的 WebDAV', 'Back up to your account or your own WebDAV', 'Резервирование в аккаунт или ваш WebDAV')}</p>
                                </div>
                            </div>

                            <div className="welcome-cloud-feature">
                                <div className="welcome-cloud-feature-icon">🔄</div>
                                <div>
                                    <h4>{text('多端同步', 'Multi-device Sync', 'Синхронизация устройств')}</h4>
                                    <p>{text('在任何设备上无缝接续创作', 'Seamlessly continue on any device', 'Продолжайте писать на любом устройстве')}</p>
                                </div>
                            </div>

                            <div className="welcome-cloud-feature">
                                <div className="welcome-cloud-feature-icon" style={{ background: 'rgba(34, 197, 94, 0.1)' }}>✅</div>
                                <div>
                                    <h4>{text('离线可用', 'Works Offline', 'Работает офлайн')}</h4>
                                    <p>{text('本地优先，联网时自动同步', 'Local-first, sync when online', 'Сначала локально, синхронизация при подключении')}</p>
                                </div>
                            </div>
                        </div>

                        <div className="welcome-actions" style={{ gap: 12 }}>
                            <button
                                className="btn btn-primary btn-large welcome-start-btn"
                                onClick={handleLoginNow}
                            >
                                {text('立即登录', 'Login / Register', 'Войти / зарегистрироваться')}
                            </button>
                            <button
                                className="btn btn-ghost welcome-skip-btn"
                                onClick={handleStart}
                                style={{ fontSize: 14, padding: '8px 24px' }}
                            >
                                {text('稍后再说', 'Skip for now', 'Пропустить')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
