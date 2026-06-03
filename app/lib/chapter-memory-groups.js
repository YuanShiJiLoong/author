import { persistGet, persistSet } from './persistence';
import {
    CHAPTER_SYNOPSIS_SCHEMA_VERSION,
    buildChapterSynopsisText,
    hasChapterSynopsis,
    normalizeChapterSynopsis,
} from './chapter-synopsis';

export const CHAPTER_MEMORY_GROUP_SCHEMA_VERSION = 1;

function getGroupsKey(workId) {
    return `author-chapter-memory-groups-${workId || 'work-default'}`;
}

function makeId() {
    return `memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
        .filter(value => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean)));
}

export function normalizeChapterMemoryGroup(value) {
    const data = value && typeof value === 'object' ? value : {};
    const synopsis = normalizeChapterSynopsis(data);
    const now = new Date().toISOString();
    return {
        ...synopsis,
        schemaVersion: Number(data.schemaVersion) || CHAPTER_MEMORY_GROUP_SCHEMA_VERSION,
        synopsisSchemaVersion: Number(data.synopsisSchemaVersion) || CHAPTER_SYNOPSIS_SCHEMA_VERSION,
        id: cleanString(data.id) || makeId(),
        name: cleanString(data.name),
        chapterIds: uniqueStrings(data.chapterIds),
        sourceGroupIds: uniqueStrings(data.sourceGroupIds),
        sourceType: cleanString(data.sourceType) || 'custom',
        locked: !!data.locked,
        source: cleanString(data.source) || 'manual',
        generatedAt: cleanString(data.generatedAt),
        updatedAt: cleanString(data.updatedAt) || now,
    };
}

export function hasChapterMemoryGroup(value) {
    const group = normalizeChapterMemoryGroup(value);
    return !!(
        group.summary ||
        group.beats.length ||
        group.events.length ||
        group.entityDeltas.length ||
        group.foreshadowing.length ||
        group.timelineRefs.length
    );
}

export async function getChapterMemoryGroups(workId) {
    if (typeof window === 'undefined') return [];
    try {
        const groups = await persistGet(getGroupsKey(workId));
        return Array.isArray(groups)
            ? groups.map(normalizeChapterMemoryGroup).filter(group => group.id)
            : [];
    } catch {
        return [];
    }
}

export async function saveChapterMemoryGroups(groups, workId) {
    if (typeof window === 'undefined') return;
    const normalized = (Array.isArray(groups) ? groups : [])
        .map(normalizeChapterMemoryGroup)
        .filter(group => group.id);
    await persistSet(getGroupsKey(workId), normalized);
}

export function buildChapterMemoryGroupText(group, chapters = []) {
    const normalized = normalizeChapterMemoryGroup(group);
    let ordinal = 0;
    const chapterMap = new Map((chapters || []).map((chapter, index) => {
        if ((chapter.type || 'chapter') !== 'volume') ordinal += 1;
        return [chapter.id, { chapter, index, ordinal }];
    }));
    const chapterLabels = normalized.chapterIds
        .map(id => chapterMap.get(id))
        .filter(Boolean)
        .map(({ chapter, ordinal: chapterOrdinal, index }) => {
            const displayOrdinal = chapterOrdinal || index + 1;
            return `第${displayOrdinal}章「${chapter.title}」`;
        });

    const sections = [
        `${normalized.name || '未命名记忆组'}${chapterLabels.length ? `（${chapterLabels.join('、')}）` : ''}`,
    ];
    const synopsisText = buildChapterSynopsisText(normalized);
    if (synopsisText) sections.push(synopsisText);
    return sections.join('\n\n').trim();
}

export function buildChapterMemoryGroupBriefText(group, chapters = []) {
    const text = buildChapterMemoryGroupText(group, chapters);
    return text.replace(/\n{3,}/g, '\n\n').trim();
}

export function buildChapterSourceText(chapter, chapterNumber) {
    if (!chapter) return '';
    const title = `第${chapterNumber}章「${chapter.title || '未命名章节'}」`;
    if (hasChapterSynopsis(chapter)) {
        return `${title}（章节概要）：\n${buildChapterSynopsisText(chapter)}`;
    }
    const rawText = String(chapter.content || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return `${title}（尚无章节概要，使用正文）：\n${rawText || '暂无正文。'}`;
}
