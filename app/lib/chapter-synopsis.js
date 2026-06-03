export const CHAPTER_SYNOPSIS_SCHEMA_VERSION = 1;

const DEFAULT_SYNOPSIS = {
    schemaVersion: CHAPTER_SYNOPSIS_SCHEMA_VERSION,
    summary: '',
    beats: [],
    events: [],
    endingState: '',
    continuityNotes: [],
    openThreads: [],
    entityDeltas: [],
    foreshadowing: [],
    timelineRefs: [],
    spoilerLevel: 'chapter',
    locked: false,
    source: 'manual',
    generatedAt: '',
    updatedAt: '',
};

function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function cleanStringArray(value) {
    if (Array.isArray(value)) {
        return value
            .map(item => {
                if (typeof item === 'string') return item.trim();
                if (item && typeof item === 'object') {
                    const text = item.text || item.name || item.description || item.summary || '';
                    return typeof text === 'string' ? text.trim() : '';
                }
                return '';
            })
            .filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(/\n+/)
            .map(line => line.replace(/^[-*\u2022\d.、\s]+/, '').trim())
            .filter(Boolean);
    }
    return [];
}

export function stripChapterHtml(html) {
    if (!html) return '';
    return String(html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function normalizeChapterSynopsis(value) {
    if (!value) return { ...DEFAULT_SYNOPSIS };
    if (typeof value === 'string') {
        return { ...DEFAULT_SYNOPSIS, summary: value.trim() };
    }

    const data = value && typeof value === 'object' ? value : {};
    return {
        ...DEFAULT_SYNOPSIS,
        ...data,
        schemaVersion: Number(data.schemaVersion) || CHAPTER_SYNOPSIS_SCHEMA_VERSION,
        summary: cleanString(data.summary || data.synopsis || data.text),
        beats: cleanStringArray(data.beats),
        events: cleanStringArray(data.events),
        endingState: cleanString(data.endingState || data.ending || data.finalState),
        continuityNotes: cleanStringArray(data.continuityNotes || data.continuity || data.nextChapterNotes),
        openThreads: cleanStringArray(data.openThreads || data.openQuestions || data.unresolved || data.pendingThreads),
        entityDeltas: cleanStringArray(data.entityDeltas || data.entities || data.characterChanges),
        foreshadowing: cleanStringArray(data.foreshadowing),
        timelineRefs: cleanStringArray(data.timelineRefs || data.timeline),
        spoilerLevel: cleanString(data.spoilerLevel) || 'chapter',
        locked: !!data.locked,
        source: cleanString(data.source) || 'manual',
        generatedAt: cleanString(data.generatedAt),
        updatedAt: cleanString(data.updatedAt),
    };
}

function getSynopsisValue(value) {
    if (!value || typeof value !== 'object') return value;
    if (value.synopsis || value.chapterSynopsis) return value.synopsis || value.chapterSynopsis;
    if (value.id || value.title || value.content != null || value.type) return value.summary;
    return value;
}

export function getChapterSynopsis(chapter) {
    return normalizeChapterSynopsis(getSynopsisValue(chapter));
}

export function hasChapterSynopsis(chapterOrSynopsis) {
    const synopsis = normalizeChapterSynopsis(getSynopsisValue(chapterOrSynopsis));
    return !!(
        synopsis.summary ||
        synopsis.beats.length ||
        synopsis.events.length ||
        synopsis.endingState ||
        synopsis.continuityNotes.length ||
        synopsis.openThreads.length ||
        synopsis.entityDeltas.length ||
        synopsis.foreshadowing.length ||
        synopsis.timelineRefs.length
    );
}

export function buildChapterSynopsisText(chapterOrSynopsis) {
    const synopsis = normalizeChapterSynopsis(getSynopsisValue(chapterOrSynopsis));
    const beats = synopsis.beats.length ? synopsis.beats : synopsis.events;
    const continuityNotes = synopsis.continuityNotes.length ? synopsis.continuityNotes : synopsis.entityDeltas;
    const openThreads = synopsis.openThreads.length ? synopsis.openThreads : synopsis.foreshadowing;
    const sections = [];
    if (synopsis.summary) sections.push(synopsis.summary);
    if (beats.length) sections.push(`关键情节：\n${beats.map(item => `- ${item}`).join('\n')}`);
    if (synopsis.endingState) sections.push(`结尾状态：${synopsis.endingState}`);
    if (continuityNotes.length) sections.push(`续写注意：\n${continuityNotes.map(item => `- ${item}`).join('\n')}`);
    if (openThreads.length) sections.push(`待回收信息：\n${openThreads.map(item => `- ${item}`).join('\n')}`);
    if (!synopsis.continuityNotes.length && synopsis.timelineRefs.length) {
        sections.push(`时间/顺序线索：\n${synopsis.timelineRefs.map(item => `- ${item}`).join('\n')}`);
    }
    return sections.join('\n\n').trim();
}

export function buildChapterSynopsisBriefText(chapterOrSynopsis) {
    const synopsis = normalizeChapterSynopsis(getSynopsisValue(chapterOrSynopsis));
    const beats = synopsis.beats.length ? synopsis.beats : synopsis.events;
    const continuityNotes = synopsis.continuityNotes.length ? synopsis.continuityNotes : synopsis.entityDeltas;
    const openThreads = synopsis.openThreads.length ? synopsis.openThreads : synopsis.foreshadowing;
    const sections = [];
    if (synopsis.summary) sections.push(synopsis.summary);
    if (beats.length) sections.push(`情节：${beats.join('；')}`);
    if (synopsis.endingState) sections.push(`结尾：${synopsis.endingState}`);
    if (continuityNotes.length) sections.push(`续写注意：${continuityNotes.join('；')}`);
    if (openThreads.length) sections.push(`待回收：${openThreads.join('；')}`);
    return sections.join('\n').trim();
}

export function parseGeneratedSynopsis(text) {
    const raw = String(text || '').trim();
    if (!raw) return normalizeChapterSynopsis();

    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (jsonMatch ? jsonMatch[1] : raw).trim();

    try {
        return normalizeChapterSynopsis(JSON.parse(candidate));
    } catch {
        const firstJson = candidate.indexOf('{');
        const lastJson = candidate.lastIndexOf('}');
        if (firstJson !== -1 && lastJson > firstJson) {
            try {
                return normalizeChapterSynopsis(JSON.parse(candidate.slice(firstJson, lastJson + 1)));
            } catch {
                // Fall through to plain-text summary.
            }
        }
    }

    return normalizeChapterSynopsis({ summary: raw });
}
