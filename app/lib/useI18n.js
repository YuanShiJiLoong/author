'use client';

import { useAppStore } from '../store/useAppStore';
import en from '../locales/en.json';
import zh from '../locales/zh.json';
import ru from '../locales/ru.json';

const translations = { en, zh, ru };

export function useI18n() {
    // Default to 'zh' if language is null initially
    const language = useAppStore(state => state.language) || 'zh';

    const t = (path) => {
        const keys = path.split('.');
        let current = translations[language] || translations['zh'];

        for (const key of keys) {
            if (current === undefined || current[key] === undefined) {
                console.warn(`Translation missing for key: ${path} in lang: ${language}`);
                // Fallback to Chinese
                if (language !== 'zh' && translations['zh']) {
                    let fallback = translations['zh'];
                    for (const k of keys) {
                        if (fallback[k] === undefined) return path;
                        fallback = fallback[k];
                    }
                    return fallback;
                }
                return path;
            }
            current = current[key];
        }
        return current;
    };

    return { t, language };
}
