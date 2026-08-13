import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { stabilizeChatMarkdown } from '../app/lib/chat-markdown.js';

function render(content) {
    return renderToStaticMarkup(
        React.createElement(
            ReactMarkdown,
            { remarkPlugins: [remarkGfm] },
            stabilizeChatMarkdown(content),
        ),
    );
}

test('stray backticks on separate lines remain literal text', () => {
    const html = render('first ` stray\ncontinued with **bold** text\nlast ` stray');

    assert.doesNotMatch(html, /<code>/);
    assert.match(html, /first ` stray/);
    assert.match(html, /<strong>bold<\/strong>/);
    assert.match(html, /last ` stray/);
});

test('a single unmatched backtick remains visible and does not create code', () => {
    const html = render('Use ` when describing the delimiter.');

    assert.doesNotMatch(html, /<code>/);
    assert.match(html, /Use ` when describing/);
});

test('valid same-line inline code remains inline code', () => {
    const html = render('Use `const value = 1` here.');

    assert.match(html, /<code>const value = 1<\/code>/);
});

test('fenced code blocks remain code blocks', () => {
    const source = ['```js', 'const value = `safe`;', '```', '', 'After **code**.'].join('\n');
    const html = render(source);

    assert.match(html, /<pre><code class="language-js">/);
    assert.match(html, /const value = `safe`;/);
    assert.match(html, /<strong>code<\/strong>/);
});
