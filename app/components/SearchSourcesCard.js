'use client';

// 回复末尾的"来源"：只列标题，网址在鼠标悬停时以小气泡显示；先显示前几条，其余可展开。

import { useState } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';

const VISIBLE = 4;

export default function SearchSourcesCard({ sources, tx }) {
    const [expanded, setExpanded] = useState(false);
    if (!sources?.length) return null;
    const shown = expanded ? sources : sources.slice(0, VISIBLE);
    const hidden = sources.length - VISIBLE;

    return (
        <div className="search-sources">
            <div className="search-sources-header">
                <span className="search-sources-label">
                    {tx('来源', 'Sources', 'Источники')}
                    <span className="search-sources-count">{sources.length}</span>
                </span>
                {hidden > 0 && (
                    <button type="button" className={`search-sources-more${expanded ? ' open' : ''}`} onClick={() => setExpanded(v => !v)}>
                        <span>{expanded ? tx('收起', 'Less', 'Свернуть') : tx('全部', 'All', 'Все')}</span>
                        <ChevronDown size={12} className="search-sources-more-chevron" aria-hidden="true" />
                    </button>
                )}
            </div>
            <ul className="search-sources-list">
                {shown.map(src => (
                    <li key={src.uri}>
                        <a href={src.uri} target="_blank" rel="noopener noreferrer" aria-label={`${src.title || src.site} (${src.uri})`}>
                            <span className="search-sources-title">{src.title || src.site || src.uri}</span>
                            <ArrowUpRight size={11} className="search-sources-arrow" aria-hidden="true" />
                            <span className="search-sources-tip" aria-hidden="true">
                                {src.site && <span className="search-sources-tip-site">{src.site}</span>}
                                <span className="search-sources-tip-url">{src.uri}</span>
                            </span>
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}
