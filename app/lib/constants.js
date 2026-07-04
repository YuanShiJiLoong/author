/**
 * 集中管理仓库地址和法律文档 URL 生成逻辑
 * 修改仓库名/镜像地址时只需改这一处
 */

export const REPO = {
    github: 'https://github.com/YuanShiJiLoong/author',
    gitee: 'https://gitee.com/yuanshijilong/author',
};

/** 支持的法律文档语言列表 */
export const LEGAL_LANGUAGES = [
    { code: 'zh', label: '🇨🇳 中文', privacy: '隐私政策', terms: '服务条款' },
    { code: 'en', label: '🇬🇧 English', privacy: 'Privacy Policy', terms: 'Terms of Service' },
    { code: 'ru', label: '🇷🇺 Русский', privacy: 'Политика конфиденциальности', terms: 'Условия использования' },
    { code: 'ar', label: '🇵🇸 العربية', privacy: 'سياسة الخصوصية', terms: 'شروط الخدمة' },
];

/**
 * 生成法律文档的完整 URL
 * @param {'github'|'gitee'} platform - 平台
 * @param {'PRIVACY'|'TERMS'} docType - 文档类型
 * @param {string} lang - 语言代码 (en/zh/ru/ar)
 * @returns {string} 完整 URL
 */
export function legalDocUrl(platform, docType, lang) {
    const suffix = lang === 'en' ? '' : `.${lang}`;
    return `${REPO[platform]}/blob/main/${docType}${suffix}.md`;
}

/**
 * 应用内置法律文档页面的路径(构建时由 scripts/sync-legal-docs.mjs 从根目录 md 生成)。
 * 直接可点开、随应用分发:桌面/自部署零外部依赖,官方网页版仅一次约 10KB 静态请求。
 * 使用时用 apiPath() 包一层以兼容子路径部署。
 * @param {'PRIVACY'|'TERMS'} docType - 文档类型
 * @param {string} lang - 语言代码 (en/zh/ru/ar)
 * @returns {string} 应用内路径,如 '/legal/TERMS.zh.html'
 */
export function legalDocPath(docType, lang) {
    const suffix = lang === 'en' ? '' : `.${lang}`;
    return `/legal/${docType}${suffix}.html`;
}

/**
 * 隐私政策 / 服务条款的当前版本号（发生实质更新时递增，取生效日期，人读友好）。
 * 用于"政策更新须重新同意"闸门：已登录用户的已同意版本 ≠ 此值时弹窗要求同意，
 * 不同意则登出。注册时的"注册即同意"会把已同意版本置为此值，避免新用户重复弹窗。
 */
export const POLICY_VERSION = '2026-07-05';

const AGREED_POLICY_KEY = 'author-policy-agreed-version';

/** 读取本设备上用户最后同意的政策版本（从未同意返回空串）。 */
export function getAgreedPolicyVersion() {
    if (typeof window === 'undefined') return '';
    try { return localStorage.getItem(AGREED_POLICY_KEY) || ''; } catch { return ''; }
}

/** 记录用户已同意的政策版本（同意弹窗或注册成功时调用）。 */
export function setAgreedPolicyVersion(version = POLICY_VERSION) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(AGREED_POLICY_KEY, String(version || '')); } catch {}
}
