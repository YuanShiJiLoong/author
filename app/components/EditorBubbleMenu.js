'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Bold, Italic, Underline as UnderlineIcon, Strikethrough,
    Heading1, Heading2, Heading3,
    Highlighter, RemoveFormatting, Sparkles, MessageSquareText
} from 'lucide-react';
import { promptForRemark } from './RemarkMark';

/**
 * 气泡菜单 — 选中文字时在选区上方浮现的格式工具栏
 * 手动实现（不依赖 @tiptap/extension-bubble-menu）
 */
export default function EditorBubbleMenu({ editor }) {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const menuRef = useRef(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const updatePosition = useCallback(() => {
        if (!editor) return;
        const { from, to, empty } = editor.state.selection;
        
        if (empty || from === to) {
            setVisible(false);
            return;
        }

        // 检查是否是真正的文字选区（非节点选区等）
        const text = editor.state.doc.textBetween(from, to, ' ');
        if (!text.trim()) {
            setVisible(false);
            return;
        }

        try {
            const startCoords = editor.view.coordsAtPos(from);
            const endCoords = editor.view.coordsAtPos(to);
            // 菜单居中于选区上方
            const x = (startCoords.left + endCoords.right) / 2;
            const y = startCoords.top - 8;
            setPos({ x, y });
            setVisible(true);
        } catch {
            setVisible(false);
        }
    }, [editor]);

    useEffect(() => {
        if (!editor) return;

        const onSelectionUpdate = () => {
            // 延迟一帧确保 DOM 已更新
            requestAnimationFrame(updatePosition);
        };

        // 点击工具栏时隐藏气泡菜单，避免遮挡下拉菜单
        const onToolbarClick = (e) => {
            if (e.target.closest('.editor-toolbar')) {
                setVisible(false);
            }
        };

        editor.on('selectionUpdate', onSelectionUpdate);
        editor.on('blur', () => setVisible(false));
        document.addEventListener('mousedown', onToolbarClick);

        return () => {
            editor.off('selectionUpdate', onSelectionUpdate);
            editor.off('blur', () => setVisible(false));
            document.removeEventListener('mousedown', onToolbarClick);
        };
    }, [editor, updatePosition]);

    // 精确定位（考虑菜单自身尺寸）
    useEffect(() => {
        if (!visible || !menuRef.current) return;
        const menu = menuRef.current;
        const rect = menu.getBoundingClientRect();
        const vw = window.innerWidth;

        let left = pos.x - rect.width / 2;
        let top = pos.y - rect.height;

        // 边界修正
        if (left < 4) left = 4;
        if (left + rect.width > vw - 4) left = vw - rect.width - 4;
        if (top < 4) top = pos.y + 28; // 如果上面放不下，放到下面

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        menu.style.opacity = '1';
    }, [visible, pos]);

    if (!editor || !mounted || !visible) return null;

    const btnClass = (active) => `bubble-btn${active ? ' active' : ''}`;

    const execCmd = (fn) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
        // 保持选区不变
        editor.commands.focus();
    };

    return createPortal(
        <div
            ref={menuRef}
            className="bubble-menu"
            style={{ position: 'fixed', opacity: 0, zIndex: 9980 }}
            onMouseDown={e => e.preventDefault()}
        >
            {/* 格式按钮组 */}
            <div className="bubble-group">
                <button className={btnClass(editor.isActive('bold'))} onClick={execCmd(() => editor.chain().focus().toggleBold().run())} title="加粗 (Ctrl+B)">
                    <Bold size={15} />
                </button>
                <button className={btnClass(editor.isActive('italic'))} onClick={execCmd(() => editor.chain().focus().toggleItalic().run())} title="斜体 (Ctrl+I)">
                    <Italic size={15} />
                </button>
                <button className={btnClass(editor.isActive('underline'))} onClick={execCmd(() => editor.chain().focus().toggleUnderline().run())} title="下划线 (Ctrl+U)">
                    <UnderlineIcon size={15} />
                </button>
                <button className={btnClass(editor.isActive('strike'))} onClick={execCmd(() => editor.chain().focus().toggleStrike().run())} title="删除线">
                    <Strikethrough size={15} />
                </button>
                <button className={btnClass(editor.isActive('highlight'))} onClick={execCmd(() => editor.chain().focus().toggleHighlight().run())} title="高亮">
                    <Highlighter size={15} />
                </button>
                <button className={btnClass(editor.isActive('remark'))} onClick={execCmd(() => promptForRemark(editor))} title="备注 / 批注">
                    <MessageSquareText size={15} />
                </button>
            </div>

            <div className="bubble-divider" />

            {/* 标题组 */}
            <div className="bubble-group">
                <button className={btnClass(editor.isActive('heading', { level: 1 }))} onClick={execCmd(() => editor.chain().focus().toggleHeading({ level: 1 }).run())} title="一级标题">
                    <Heading1 size={15} />
                </button>
                <button className={btnClass(editor.isActive('heading', { level: 2 }))} onClick={execCmd(() => editor.chain().focus().toggleHeading({ level: 2 }).run())} title="二级标题">
                    <Heading2 size={15} />
                </button>
                <button className={btnClass(editor.isActive('heading', { level: 3 }))} onClick={execCmd(() => editor.chain().focus().toggleHeading({ level: 3 }).run())} title="三级标题">
                    <Heading3 size={15} />
                </button>
            </div>

            <div className="bubble-divider" />

            {/* 清除格式 */}
            <button className="bubble-btn" onClick={execCmd(() => editor.chain().focus().clearNodes().unsetAllMarks().run())} title="清除格式">
                <RemoveFormatting size={15} />
            </button>

            <div className="bubble-divider" />

            {/* AI 助手 */}
            <button
                className="bubble-btn bubble-btn-ai"
                title="AI 助手 (Ctrl+J)"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // 派发 Ctrl+J 键盘事件唤出 InlineAI
                    document.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'j', code: 'KeyJ', ctrlKey: true, bubbles: true
                    }));
                    setVisible(false);
                }}
            >
                <Sparkles size={15} />
            </button>
        </div>,
        document.body
    );
}
