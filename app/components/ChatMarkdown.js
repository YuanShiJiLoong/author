'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo, useState, useCallback } from 'react';
import { copyTextToClipboard } from '../lib/clipboard';
import { stabilizeChatMarkdown } from '../lib/chat-markdown';
import { useI18n } from '../lib/useI18n';

function ChatMarkdownInner({ content }) {
    if (!content) return null;
    const stableContent = stabilizeChatMarkdown(content);

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                // react-markdown v10: 用 pre 组件处理代码块（```...```）
                // 代码块结构为 <pre><code className="language-xxx">...</code></pre>
                pre({ children, ...props }) {
                    // children 通常是单个 <code> 元素
                    const codeChild = Array.isArray(children) ? children[0] : children;
                    if (codeChild?.type === 'code' || codeChild?.props?.className) {
                        const className = codeChild?.props?.className || '';
                        const lang = className.replace('language-', '') || '';
                        const code = String(codeChild?.props?.children || '').replace(/\n$/, '');
                        return <CodeBlock lang={lang} code={code} />;
                    }
                    return <pre {...props}>{children}</pre>;
                },
                // 内联 code（`xxx`），react-markdown v10 里只走这里处理行内代码
                code({ children, ...props }) {
                    return <code className="chat-md-inline-code" {...props}>{children}</code>;
                },
                // 链接：新窗口打开
                a({ href, children, ...props }) {
                    return (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="chat-md-link" {...props}>
                            {children}
                        </a>
                    );
                },
                // 表格样式
                table({ children, ...props }) {
                    return (
                        <div className="chat-md-table-wrap">
                            <table className="chat-md-table" {...props}>{children}</table>
                        </div>
                    );
                },
                // 段落
                p({ children, ...props }) {
                    return <p className="chat-md-p" {...props}>{children}</p>;
                },
                // 列表
                ul({ children, ...props }) {
                    return <ul className="chat-md-ul" {...props}>{children}</ul>;
                },
                ol({ children, ...props }) {
                    return <ol className="chat-md-ol" {...props}>{children}</ol>;
                },
                // 引用
                blockquote({ children, ...props }) {
                    return <blockquote className="chat-md-blockquote" {...props}>{children}</blockquote>;
                },
                // 标题
                h1({ children, ...props }) { return <h3 className="chat-md-heading" {...props}>{children}</h3>; },
                h2({ children, ...props }) { return <h4 className="chat-md-heading" {...props}>{children}</h4>; },
                h3({ children, ...props }) { return <h5 className="chat-md-heading" {...props}>{children}</h5>; },
            }}
        >
            {stableContent}
        </ReactMarkdown>
    );
}

// 代码块子组件（带复制按钮）
function CodeBlock({ lang, code }) {
    const [copyState, setCopyState] = useState('idle');
    const { text } = useI18n();

    const handleCopy = useCallback(async () => {
        const ok = await copyTextToClipboard(code);
        setCopyState(ok ? 'copied' : 'failed');
        setTimeout(() => setCopyState('idle'), 2000);
    }, [code]);

    return (
        <div className="chat-md-code-block">
            <div className="chat-md-code-header">
                <span className="chat-md-code-lang">{lang || 'text'}</span>
                <button className="chat-md-copy-btn" onClick={handleCopy}>
                    {copyState === 'copied'
                        ? text('✓ 已复制', '✓ Copied', '✓ Скопировано')
                        : copyState === 'failed'
                            ? text('复制失败', 'Copy failed', 'Не удалось скопировать')
                            : text('📋 复制', '📋 Copy', '📋 Копировать')}
                </button>
            </div>
            <pre className="chat-md-pre"><code>{code}</code></pre>
        </div>
    );
}

const ChatMarkdown = memo(ChatMarkdownInner);
export default ChatMarkdown;
