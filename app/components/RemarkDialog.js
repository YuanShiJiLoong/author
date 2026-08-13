'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquareText } from 'lucide-react';
import { useI18n } from '../lib/useI18n';

export default function RemarkDialog({ draft, onClose, onSave }) {
    const { text } = useI18n();
    const [value, setValue] = useState(draft?.initialText || '');
    const inputRef = useRef(null);

    useEffect(() => {
        const frame = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!draft || typeof document === 'undefined') return null;

    const isReady = draft.status === 'ready';
    const title = isReady && draft.isActive
        ? text('编辑批注', 'Edit comment', 'Редактировать заметку')
        : text('添加批注', 'Add comment', 'Добавить заметку');

    return createPortal(
        <div
            className="modal-overlay remark-dialog-overlay"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="modal remark-dialog" role="dialog" aria-modal="true" aria-labelledby="remark-dialog-title">
                <div className="remark-dialog-title-row">
                    <MessageSquareText size={20} />
                    <h2 id="remark-dialog-title">{title}</h2>
                </div>

                {!isReady ? (
                    <>
                        <p className="remark-dialog-hint">
                            {text(
                                '请先选中要添加批注的文字。',
                                'Select the text you want to annotate first.',
                                'Сначала выделите текст для заметки.',
                            )}
                        </p>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
                                {text('知道了', 'OK', 'Понятно')}
                            </button>
                        </div>
                    </>
                ) : (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (value.trim() || draft.isActive) onSave(value);
                        }}
                    >
                        {draft.selectedText && (
                            <div className="remark-dialog-selection" title={draft.selectedText}>
                                “{draft.selectedText}”
                            </div>
                        )}
                        <textarea
                            ref={inputRef}
                            className="modal-input remark-dialog-input"
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                            placeholder={text('输入批注内容…', 'Write a comment…', 'Введите текст заметки…')}
                            rows={5}
                        />
                        <div className="modal-actions remark-dialog-actions">
                            {draft.isActive && (
                                <button type="button" className="btn btn-secondary remark-dialog-delete" onClick={() => onSave('')}>
                                    {text('删除批注', 'Delete comment', 'Удалить заметку')}
                                </button>
                            )}
                            <span className="remark-dialog-actions-spacer" />
                            <button type="button" className="btn btn-secondary" onClick={onClose}>
                                {text('取消', 'Cancel', 'Отмена')}
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={!draft.isActive && !value.trim()}>
                                {text('保存', 'Save', 'Сохранить')}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>,
        document.body,
    );
}
