'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';

const ONBOARDING_KEY = 'author-onboarding-done';

export default function TourOverlay({ onOpenHelp }) {
    const { startTour, setStartTour, language, visualTheme } = useAppStore();
    const { t } = useI18n();
    const [status, setStatus] = useState('hidden'); // hidden, intro, tour
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [targetRect, setTargetRect] = useState(null);
    const [windowSize, setWindowSize] = useState({ w: 0, h: 0 });

    // 根据当前语言动态生成 TOUR_STEPS
    const TOUR_STEPS = useMemo(() => [
        {
            targetId: 'tour-new-chapter',
            title: t('tour.step1Title'),
            content: t('tour.step1Content'),
            placement: 'right'
        },
        {
            targetId: 'tour-editor',
            title: t('tour.step2Title'),
            content: t('tour.step2Content'),
            placement: 'center'
        },
        {
            targetId: 'tour-ai-btn',
            title: t('tour.step3Title'),
            content: t('tour.step3Content'),
            placement: 'left'
        },
        {
            targetId: 'tour-settings',
            title: t('tour.step4Title'),
            content: t('tour.step4Content'),
            placement: 'top'
        },
        {
            targetId: 'tour-help',
            title: t('tour.step5Title'),
            content: t('tour.step5Content'),
            placement: 'left'
        }
    ], [t]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isDone = localStorage.getItem(ONBOARDING_KEY);
            if (!isDone) {
                if (language && visualTheme) {
                    setStatus('intro');
                }
            }
            setWindowSize({ w: window.innerWidth, h: window.innerHeight });
        }
    }, [language, visualTheme]);

    const updateRect = useCallback((index) => {
        const step = TOUR_STEPS[index];
        if (!step) return;

        let el = document.getElementById(step.targetId);
        if (!el && step.targetId === 'tour-editor') {
            el = document.querySelector('.editor-container');
        }

        if (el) {
            const rect = el.getBoundingClientRect();
            setTargetRect({
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
            });
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        } else {
            setTimeout(() => {
                const retryEl = document.getElementById(step.targetId) || document.querySelector('.editor-container');
                if (retryEl) {
                    const r = retryEl.getBoundingClientRect();
                    setTargetRect({ x: r.x, y: r.y, width: r.width, height: r.height });
                }
            }, 300);
        }
    }, [TOUR_STEPS]);

    const finishTour = () => {
        localStorage.setItem(ONBOARDING_KEY, 'true');
        setStatus('hidden');
    };

    const skipToHelp = () => {
        setStatus('tour');
        setCurrentStepIndex(TOUR_STEPS.length - 1);
        updateRect(TOUR_STEPS.length - 1);
    };

    const beginTour = useCallback(() => {
        setStatus('tour');
        setCurrentStepIndex(0);
        updateRect(0);
    }, [updateRect]);

    useEffect(() => {
        if (startTour) {
            beginTour();
            setStartTour(false);
        }
    }, [startTour, beginTour, setStartTour]);

    // 监听窗口缩放和滚动
    useEffect(() => {
        if (status !== 'tour') return;

        const handleResize = () => {
            setWindowSize({ w: window.innerWidth, h: window.innerHeight });
            updateRect(currentStepIndex);
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', handleResize, true);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', handleResize, true);
        };
    }, [status, currentStepIndex, updateRect]);

    const nextStep = () => {
        if (currentStepIndex === TOUR_STEPS.length - 1) {
            finishTour();
        } else {
            setCurrentStepIndex(i => i + 1);
            updateRect(currentStepIndex + 1);
        }
    };

    const prevStep = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(i => i - 1);
            updateRect(currentStepIndex - 1);
        }
    };

    if (status === 'hidden') return null;

    // ================= Intro 弹窗 =================
    if (status === 'intro') {
        return (
            <div className="tour-overlay-bg">
                <div className="tour-intro-modal">
                    <div className="tour-intro-icon">✨</div>
                    <h2>{t('tour.introTitle')}</h2>
                    <p>{t('tour.introSubtitle')}</p>
                    <p className="tour-intro-sub">{t('tour.introHint')}</p>
                    <div className="tour-intro-actions">
                        <button className="tour-btn ghost" onClick={skipToHelp}>{t('tour.btnSkip')}</button>
                        <button className="tour-btn primary" onClick={beginTour}>{t('tour.btnStart')}</button>
                    </div>
                </div>
            </div>
        );
    }

    // ================= 具体步骤向导 (Tour) =================
    const step = TOUR_STEPS[currentStepIndex];
    if (!step) return null;

    const padding = 8;
    const rX = targetRect ? targetRect.x - padding : 0;
    const rY = targetRect ? targetRect.y - padding : 0;
    const rW = targetRect ? targetRect.width + padding * 2 : 0;
    const rH = targetRect ? targetRect.height + padding * 2 : 0;
    const radius = 8;

    let tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    if (targetRect) {
        if (step.placement === 'right') {
            tooltipStyle = { top: rY + rH / 2, left: rX + rW + 20, transform: 'translateY(-50%)' };
        } else if (step.placement === 'left') {
            tooltipStyle = { top: rY + rH / 2, right: windowSize.w - rX + 20, transform: 'translateY(-50%)' };
        } else if (step.placement === 'bottom') {
            tooltipStyle = { top: rY + rH + 20, left: rX + rW / 2, transform: 'translateX(-50%)' };
        } else if (step.placement === 'center') {
            tooltipStyle = { top: rY + rH / 2, left: rX + rW / 2, transform: 'translate(-50%, -50%)' };
        }
    }

    const tooltipHeightGuess = 200;

    if (tooltipStyle.top && typeof tooltipStyle.top === 'number') {
        if (tooltipStyle.top < tooltipHeightGuess / 2) {
            tooltipStyle.top = tooltipHeightGuess / 2;
        } else if (tooltipStyle.top > windowSize.h - tooltipHeightGuess / 2) {
            tooltipStyle.top = windowSize.h - tooltipHeightGuess / 2;
        }
    }

    if (tooltipStyle.bottom && typeof tooltipStyle.bottom === 'number') {
        if (tooltipStyle.bottom < 20) {
            tooltipStyle.bottom = 20;
        }
    }

    const validateStyle = { ...tooltipStyle };

    return (
        <div className="tour-portal">
            <svg
                width="100%"
                height="100%"
                className="tour-svg-mask"
                preserveAspectRatio="none"
            >
                <defs>
                    <mask id="tour-hole">
                        <rect width="100%" height="100%" fill="white" />
                        {targetRect && (
                            <rect
                                x={rX} y={rY} width={rW} height={rH}
                                rx={radius} ry={radius}
                                fill="black"
                            />
                        )}
                    </mask>
                </defs>
                <rect
                    width="100%" height="100%"
                    fill="var(--tour-overlay-color, rgba(0,0,0,0.6))"
                    mask="url(#tour-hole)"
                />

                {targetRect && (
                    <rect
                        x={rX} y={rY} width={rW} height={rH}
                        rx={radius} ry={radius}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="2"
                        className="tour-target-outline"
                    />
                )}
            </svg>

            {targetRect && (
                <div className="tour-tooltip" style={validateStyle}>
                    <div className="tour-tooltip-header">
                        <h3>{step.title}</h3>
                        <span className="tour-step-counter">{currentStepIndex + 1} / {TOUR_STEPS.length}</span>
                    </div>
                    <div className="tour-tooltip-content">
                        {step.content}
                    </div>
                    <div className="tour-tooltip-footer">
                        {currentStepIndex === TOUR_STEPS.length - 1 ? (
                            <div />
                        ) : (
                            <button className="tour-skip-text" onClick={skipToHelp}>{t('tour.btnEndTour')}</button>
                        )}
                        <div className="tour-footer-right" style={{ display: 'flex', gap: '8px' }}>
                            {currentStepIndex > 0 && (
                                <button className="tour-btn ghost" onClick={prevStep}>{t('tour.btnPrev')}</button>
                            )}
                            {currentStepIndex === TOUR_STEPS.length - 1 ? (
                                <button className="tour-btn primary" onClick={finishTour}>{t('tour.btnFinish')}</button>
                            ) : (
                                <button className="tour-btn primary" onClick={nextStep}>{t('tour.btnNext')}</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
