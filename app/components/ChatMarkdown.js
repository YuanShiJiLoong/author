'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo, useState, useCallback } from 'react';

/**
 * 聊天消息 Markdown 渲染组件
 * 支持：GFM (表格/删除线/任务列表) + 数学公式 (KaTeX) + 代码块
 */
function ChatMarkdownInner({ content }) {
    if (!content) return null;

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                // 代码块：带复制按钮
                code({ inline, className, children, ...props }) {
                    const text = String(children).replace(/\n$/, '');
                    if (inline) {
                        return <code className="chat-md-inline-code" {...props}>{children}</code>;
                    }
                    const lang = className?.replace('language-', '') || '';
                    return <CodeBlock lang={lang} code={text} />;
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
            {content}
        </ReactMarkdown>
    );
}

// 代码块子组件（带复制按钮）
function CodeBlock({ lang, code }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [code]);

    return (
        <div className="chat-md-code-block">
            <div className="chat-md-code-header">
                <span className="chat-md-code-lang">{lang || 'text'}</span>
                <button className="chat-md-copy-btn" onClick={handleCopy}>
                    {copied ? '✓ 已复制' : '📋 复制'}
                </button>
            </div>
            <pre className="chat-md-pre"><code>{code}</code></pre>
        </div>
    );
}

const ChatMarkdown = memo(ChatMarkdownInner);
export default ChatMarkdown;
