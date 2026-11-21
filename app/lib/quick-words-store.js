'use client';

import { persistGet, persistSet } from './persistence';
import { normalizeQuickWordStore } from './quick-words';

export const QUICK_WORDS_CHANGED_EVENT = 'author-quick-words-changed';
const ENABLED_KEY = 'author-quick-words-enabled';

function getStoreKey(workId) {
    return `author-quick-words-${workId || 'work-default'}`;
}

function notifyChanged(workId) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(QUICK_WORDS_CHANGED_EVENT, { detail: { workId: workId || 'work-default' } }));
}

export async function getQuickWordStore(workId) {
    if (typeof window === 'undefined') return normalizeQuickWordStore(null);
    try {
        return normalizeQuickWordStore(await persistGet(getStoreKey(workId)));
    } catch {
        return normalizeQuickWordStore(null);
    }
}

export async function saveQuickWordStore(store, workId) {
    const normalized = normalizeQuickWordStore(store);
    await persistSet(getStoreKey(workId), normalized);
    notifyChanged(workId);
    return normalized;
}

export function isQuickWordsEnabled() {
    if (typeof window === 'undefined') return true;
    try {
        return localStorage.getItem(ENABLED_KEY) !== 'false';
    } catch {
        return true;
    }
}

export function setQuickWordsEnabled(enabled) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
    } catch { /* ignore */ }
    notifyChanged(null);
}
