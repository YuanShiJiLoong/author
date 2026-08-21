'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useI18n } from '../lib/useI18n';
import {
    getLocalSaveServerSnapshot,
    getLocalSaveSnapshot,
    hasBlockingLocalSave,
    subscribeLocalSaveStatus,
} from '../lib/local-save-status';
import { useAppStore } from '../store/useAppStore';

export default function LocalSaveIndicator() {
    const { text } = useI18n();
    const saveState = useSyncExternalStore(
        subscribeLocalSaveStatus,
        getLocalSaveSnapshot,
        getLocalSaveServerSnapshot,
    );

    useEffect(() => {
        const flushPendingLocalSave = () => Promise.resolve(
            useAppStore.getState().flushPendingLocalSave?.(),
        ).catch(() => {});

        const handleBeforeUnload = (event) => {
            if (!hasBlockingLocalSave()) return;
            void flushPendingLocalSave();
            event.preventDefault();
            event.returnValue = '';
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden' && hasBlockingLocalSave()) {
                void flushPendingLocalSave();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const isSaving = saveState.status === 'saving';
    const isError = saveState.status === 'error';
    const label = isError
        ? text('保存失败', 'Save failed', 'Ошибка сохранения')
        : isSaving
            ? text('保存中...', 'Saving...', 'Сохранение...')
            : text('已保存到本地', 'Saved locally', 'Сохранено локально');
    const title = isError
        ? text('本地保存失败，请继续编辑或重试后再退出', 'Local save failed. Retry before exiting.', 'Локальное сохранение не удалось. Повторите перед выходом.')
        : label;
    const Icon = isError ? TriangleAlert : isSaving ? LoaderCircle : CheckCircle2;

    return (
        <div
            className={`local-save-indicator local-save-${saveState.status}`}
            role="status"
            aria-live="polite"
            title={title}
        >
            <Icon size={14} className={isSaving ? 'spin' : undefined} aria-hidden="true" />
            <span>{label}</span>
        </div>
    );
}
