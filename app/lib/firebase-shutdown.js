/**
 * 旧版（Firebase）云同步停服 —— 日期、倒计时阶段与受影响判断集中在这里。
 *
 * 北京时间 2026-08-15 00:00 起旧版云端彻底关停：届时登录与云端拉取均失效，
 * 云端数据不再可取回。本地写作数据存于 IndexedDB，不受影响；
 * WebDAV / 局域网同步同样不受影响。
 */

// 改这个日期时，三语文案里写死的日期也要一起改：
// locales/*.json 的 fbShutdown.title、migration.deadline、migration.deadlineEnded
export const FIREBASE_SHUTDOWN_DATE = '2026-08-15';

/** 停服倒计时的三个阶段：'soon'(>3 天) → 'final'(≤3 天) → 'ended'(已停服)。 */
export function getFirebaseShutdownInfo(now = new Date()) {
    const deadline = new Date(`${FIREBASE_SHUTDOWN_DATE}T00:00:00+08:00`);
    const msLeft = deadline.getTime() - now.getTime();
    // 向上取整：停服前的任何时刻都至少显示"还剩 1 天"，不会出现"还剩 0 天但仍可用"
    const daysLeft = Math.ceil(msLeft / 86400000);
    const stage = msLeft <= 0 ? 'ended' : (daysLeft <= 3 ? 'final' : 'soon');
    return { stage, daysLeft: Math.max(0, daysLeft), date: FIREBASE_SHUTDOWN_DATE };
}

/**
 * 是否受停服影响 = 云端可能还有数据的人：
 *   - Firebase 当前已登录（还在往旧版同步）；或
 *   - 曾登录过旧版、且尚未启用自建账号（云端有数据但人可能已经忘了）。
 * 已完成迁移（自建已登录且旧版已登出）与从未用过云同步的用户返回 false，完全不打扰。
 */
export async function isAffectedByFirebaseShutdown() {
    if (typeof window === 'undefined') return false;
    try {
        const [auth, custom] = await Promise.all([import('./auth'), import('./custom-auth')]);
        const history = auth.getAccountHistory?.() || [];
        if (auth.isSignedIn?.()) return true;
        return history.length > 0 && !custom.isCustomSignedIn?.();
    } catch {
        return false; // 检测失败不打扰
    }
}
