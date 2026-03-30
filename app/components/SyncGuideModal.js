'use client';

import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';
import { Download, ExternalLink, Settings, Monitor, X, Cloud } from 'lucide-react';

export default function SyncGuideModal() {
    const { showSyncGuideModal, setShowSyncGuideModal } = useAppStore();
    const { t } = useI18n();

    if (!showSyncGuideModal) return null;

    return (
        <div className="login-modal-overlay" onMouseDown={() => setShowSyncGuideModal(false)} style={{ zIndex: 9999 }}>
            <div className="login-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, padding: '32px', cursor: 'default' }}>
                <button className="login-modal-close" onClick={() => setShowSyncGuideModal(false)}>
                    <X size={18} />
                </button>

                {/* Header */}
                <div className="login-modal-header" style={{ marginBottom: 24, padding: 0 }}>
                    <div className="login-modal-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', width: 48, height: 48, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Cloud size={24} />
                    </div>
                    <h2 className="login-modal-title" style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-main)' }}>
                        {t('cloudSync.guideTitle') || '开启云同步'}
                    </h2>
                    <p className="login-modal-desc" style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                        {t('cloudSync.guideDesc') || '云同步可以在多设备间无缝同步你的作品和设定。'}
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Option 1: Desktop Client */}
                    <div style={{ 
                        padding: '20px', 
                        background: 'var(--bg-secondary)', 
                        borderRadius: '12px', 
                        border: '1px solid var(--border-color)', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '12px' 
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Monitor size={18} style={{ color: '#3b82f6' }}/>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-main)' }}>
                                方式一：{t('cloudSync.downloadClient') || '下载桌面客户端（推荐）'}
                            </h3>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            {t('cloudSync.downloadClientDesc') || '自带官方内置云同步功能，零配置开箱即用，支持离线创作。'}
                        </p>
                        <div style={{ display: 'flex', gap: '12px', marginTop: 8 }}>
                            <a 
                                href="https://github.com/YuanShiJiLoong/author/releases/latest/download/Author-Setup.exe" 
                                className="login-modal-submit-btn" 
                                style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', fontSize: '13px', textDecoration: 'none', padding: '10px 0', height: '40px' }}
                                onClick={() => setShowSyncGuideModal(false)}
                            >
                                <Download size={15} />{t('cloudSync.quickDownload') || '快速下载 (Windows)'}
                            </a>
                            <a 
                                href="https://github.com/YuanShiJiLoong/author/releases/latest" 
                                target="_blank" rel="noreferrer"
                                className="login-modal-google-btn" 
                                style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', fontSize: '13px', textDecoration: 'none', padding: '10px 0', margin: 0, height: '40px' }}
                                onClick={() => setShowSyncGuideModal(false)}
                            >
                                <ExternalLink size={15} />{t('cloudSync.goToRelease') || '前往 Release 页面'}
                            </a>
                        </div>
                    </div>

                    {/* Option 2: Self Deploy */}
                    <div style={{ 
                        padding: '20px', 
                        background: 'transparent', 
                        borderRadius: '12px', 
                        border: '1px solid var(--border-color)', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '12px' 
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Settings size={18} style={{ color: 'var(--text-secondary)' }}/>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-main)' }}>
                                方式二：{t('cloudSync.configFirebase') || '自行配置 Firebase'}
                            </h3>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            {t('cloudSync.configFirebaseDesc') || '适合通过源码或 Vercel 进行私有化部署的极客用户。'}
                        </p>
                        <a 
                            href="https://github.com/YuanShiJiLoong/author#%E4%BA%91%E5%90%8C%E6%AD%A5%E9%85%8D%E7%BD%AE%E8%87%AA%E9%83%A8%E7%BD%B2%E7%94%A8%E6%88%B7" 
                            target="_blank" rel="noreferrer"
                            className="login-modal-google-btn" 
                            style={{ margin: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '13px', textDecoration: 'none', padding: '10px 0', marginTop: 8, height: '40px' }}
                            onClick={() => setShowSyncGuideModal(false)}
                        >
                            <ExternalLink size={15} />{t('cloudSync.viewGuide') || '查看配置指南'}
                        </a>
                    </div>

                </div>

                <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', marginTop: '24px' }}>
                    💬 {t('cloudSync.qqGroup') || '遇到问题？加入 QQ 群 1087016949'}
                </div>
            </div>
        </div>
    );
}
