function isEscaped(source, index) {
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
        backslashes += 1;
    }
    return backslashes % 2 === 1;
}

function escapeUnpairedBackticks(line) {
    const pendingByLength = new Map();
    const runPattern = /`+/g;
    let match;

    while ((match = runPattern.exec(line)) !== null) {
        if (isEscaped(line, match.index)) continue;
        const length = match[0].length;
        if (pendingByLength.has(length)) {
            pendingByLength.delete(length);
        } else {
            pendingByLength.set(length, match.index);
        }
    }

    const unmatched = [...pendingByLength.values()].sort((a, b) => b - a);
    let result = line;
    for (const index of unmatched) {
        result = `${result.slice(0, index)}\\${result.slice(index)}`;
    }
    return result;
}

/**
 * Prevent CommonMark from pairing stray backticks across separate chat lines.
 * Valid inline code on one line and fenced code blocks remain untouched.
 */
export function stabilizeChatMarkdown(content = '') {
    const source = String(content);
    if (!source.includes('`')) return source;

    let fence = null;
    return source.split('\n').map(line => {
        if (fence) {
            const closingPattern = new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`);
            if (closingPattern.test(line)) fence = null;
            return line;
        }

        const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
        if (opening) {
            fence = { char: opening[1][0], length: opening[1].length };
            return line;
        }

        return escapeUnpairedBackticks(line);
    }).join('\n');
}
