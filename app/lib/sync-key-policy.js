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
    'author-update-dismissed',
    'author-visual',
    'author-writing-daily-goals',
]);

const LOCAL_ONLY_PREFIXES = [
    'author-ai-session-',
    'author-bookmarks-',
    'author-chapter-summary-',
    'author-inspirations-',
    'author-revision-history-',
    'author-timeline-events-',
];

export function isSyncableKey(key) {
    if (!key || typeof key !== 'string') return false;
    if (LOCAL_ONLY_EXACT_KEYS.has(key)) return false;
    if (LOCAL_ONLY_PREFIXES.some(prefix => key.startsWith(prefix))) return false;
    if (key.includes('backup')) return false;
    if (key.includes('snapshot')) return false;
    if (key.includes('debug')) return false;

    if (SYNCABLE_EXACT_KEYS.has(key)) return true;
    if (SYNCABLE_PREFIXES.some(prefix => key.startsWith(prefix))) return true;

    return false;
}
