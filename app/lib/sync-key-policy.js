'use client';

// Privacy-first cloud sync policy.
//
// New Author keys do not sync by default. Only the work graph that must move
// between devices is allowlisted: work index, chapters, and settings nodes.

const SYNCABLE_EXACT_KEYS = new Set([
    'author-works-index',
]);

const SYNCABLE_PREFIXES = [
    'author-chapters-',
    'author-chapter-memory-groups-',
    'author-settings-nodes-',
];

const LOCAL_ONLY_EXACT_KEYS = new Set([
    'author-account-history',
    'author-active-work',
    'author-ai-prompt-templates-v1',
    'author-ai-sessions',
    'author-api-config',
    'author-api-profiles',
    'author-chat-sessions',
    'author-context-selection',
    'author-debug',
    'author-delete-never-remind',
    'author-delete-skip-today',
    'author-lang',
    'author-lore-last-work-id',
    'author-onboarding-done',
    'author-pinned-categories',
    'author-pull-skip-today',
    'author-project-settings',
    'author-recent-works',
    'author-search-history',
    'author-snapshot-latest',
    'author-sync-settings',
    'author-theme',
    'author-token-stats',
    'author-tts-local-config-v1',
    'author-tts-rate',
    'author-update-dismissed',
    'author-visual',
    'author-writing-daily-goals',
]);

const LOCAL_ONLY_PREFIXES = [
    'author-ai-session-',
    'author-active-chapter-',
    'author-bookmarks-',
    'author-chapter-summary-',
    'author-editor-position-',
    'author-generation-archive-',
    'author-inspirations-',
    'author-revision-history-',
    'author-timeline-events-',
    'author-tts-session-secret-',
    'author-tts-voice-',
];

// 历史脏数据防线：workId 段被 JSON 引号包裹（如 author-chapters-"work-default"）。
// 早期版本曾误把序列化过一层的 workId 当原始值拼进存储键，产生这类畸形键。
// 合法 workId（work-default / work-xxx / 时间戳 id）绝不会以引号开头或结尾。
// 畸形键既不能上云、也不能被云端条目回灌到本地——否则会在本地↔云端之间循环复活。
function isMalformedWorkKey(key) {
    for (const prefix of SYNCABLE_PREFIXES) {
        if (key.startsWith(prefix)) {
            const workId = key.slice(prefix.length);
            if (workId.startsWith('"') || workId.endsWith('"')) return true;
        }
    }
    return false;
}

export function isSyncableKey(key) {
    if (!key || typeof key !== 'string') return false;
    if (isMalformedWorkKey(key)) return false;
    if (LOCAL_ONLY_EXACT_KEYS.has(key)) return false;
    if (LOCAL_ONLY_PREFIXES.some(prefix => key.startsWith(prefix))) return false;
    if (key.includes('backup')) return false;
    if (key.includes('snapshot')) return false;
    if (key.includes('debug')) return false;

    if (SYNCABLE_EXACT_KEYS.has(key)) return true;
    if (SYNCABLE_PREFIXES.some(prefix => key.startsWith(prefix))) return true;

    return false;
}
