export const DEFAULT_REMARK_NOTE_WIDTH = 196;

function clamp(value, min, max) {
    if (max < min) return min;
    return Math.min(max, Math.max(min, value));
}

export function getRemarkNotePlacement({
    anchorX,
    pageWidth,
    workspaceLeft,
    visibleLeft,
    visibleRight,
    preferredWidth = DEFAULT_REMARK_NOTE_WIDTH,
    gap = 22,
    padding = 8,
}) {
    const availableWidth = Math.max(120, visibleRight - visibleLeft - padding * 2);
    const noteWidth = Math.min(preferredWidth, availableWidth);
    const minLeft = visibleLeft - workspaceLeft + padding;
    const maxLeft = visibleRight - workspaceLeft - noteWidth - padding;
    const preferredLeft = pageWidth + gap;
    const noteLeft = clamp(preferredLeft, minLeft, maxLeft);
    const noteRight = noteLeft + noteWidth;

    let lineLeft = 0;
    let lineWidth = 0;
    let lineAnchor = null;
    if (noteLeft > anchorX + 12) {
        lineLeft = anchorX + 6;
        lineWidth = Math.max(0, noteLeft - lineLeft - 6);
        lineAnchor = 'left';
    } else if (noteRight < anchorX - 12) {
        lineLeft = noteRight + 6;
        lineWidth = Math.max(0, anchorX - lineLeft - 6);
        lineAnchor = 'right';
    }

    return {
        noteLeft,
        noteWidth,
        compact: noteLeft < pageWidth + 8,
        lineLeft,
        lineWidth,
        lineAnchor,
    };
}
