'use client';

import { COPYRIGHT_NAME, ICP_BEIAN, ICP_BEIAN_URL, POLICE_BEIAN, POLICE_BEIAN_URL, apiPath } from '../lib/api-base';

/**
 * 备案信息角标 —— 仅在构建时设置了 NEXT_PUBLIC_ICP_BEIAN 时渲染（部署方填自己的备案号）。
 * 不设置则返回 null，页面无任何备案痕迹。
 * 中国大陆合规：备案号须可点击跳转工信部（beian.miit.gov.cn）。
 */
export default function BeianNotice({ className = '' }) {
    if (!ICP_BEIAN) return null;
    return (
        <div className={`beian-notice ${className}`.trim()}>
            {COPYRIGHT_NAME && (
                <span suppressHydrationWarning>© {new Date().getFullYear()} {COPYRIGHT_NAME}</span>
            )}
            <a href={ICP_BEIAN_URL} target="_blank" rel="noreferrer noopener">{ICP_BEIAN}</a>
            {POLICE_BEIAN && (
                POLICE_BEIAN_URL
                    ? (
                        <a href={POLICE_BEIAN_URL} target="_blank" rel="noreferrer noopener">
                            <img src={apiPath('/beian-gongan.png')} alt="" className="beian-gongan-icon" />
                            {POLICE_BEIAN}
                        </a>
                    )
                    : (
                        <span>
                            <img src={apiPath('/beian-gongan.png')} alt="" className="beian-gongan-icon" />
                            {POLICE_BEIAN}
                        </span>
                    )
            )}
        </div>
    );
}
