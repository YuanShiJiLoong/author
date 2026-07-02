// ==================== Author Cloud 同步·纯逻辑核心 ====================
// 零外部依赖的纯函数：内容指纹、key 拆分/重组、条目对账与合并。
// 抽出来是为了能脱离 UI/网络单元测试（数据安全铁律最吃紧的部分）。
// custom-server-sync.js 负责把这些函数接上定时器 / 网络 / localStorage 状态。
//
// 铁律（契约第 8 节）在本文件的落实点：
//   - 本地为真相：merge 只在内存产出新值，由调用方决定是否写本地；
//   - 谁新听谁：章节用内容指纹判断"本地是否改过"，设定/记忆组用自带 updatedAt；
//   - 删除必须明确 tombstone：只有云端 deleted=true 才删本地；
//   - 拿不准保本地：本地自上次同步改过的条目，pull 时不被云端覆盖。

// 内容指纹：同步、非密码学，仅用于"变没变"判断（cyrb53 变体）
export function fingerprint(value) {
    const str = JSON.stringify(value ?? null);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// 存储键 → { kind, workId }
export function parseKey(key) {
    if (key === 'author-works-index') return { kind: 'works_index', workId: '_index' };
    if (key.startsWith('author-chapters-')) return { kind: 'chapter', workId: key.slice(16) };
    if (key.startsWith('author-settings-nodes-')) return { kind: 'settings_node', workId: key.slice(22) };
    if (key.startsWith('author-chapter-memory-groups-')) return { kind: 'memory_group', workId: key.slice(29) };
    return null;
}

// 云端条目 → 存储键
export function itemToKey(it) {
    switch (it.kind) {
        case 'works_index': return 'author-works-index';
        case 'chapter': return `author-chapters-${it.workId}`;
        case 'settings_node': return `author-settings-nodes-${it.workId}`;
        case 'memory_group': return `author-chapter-memory-groups-${it.workId}`;
        default: return null;
    }
}

// 拆分：一个 key 的当前 value → 待推条目（只含变化/新增/删除）
// prevItemState: 上次同步该 key 的 { itemId: { hash } | { deleted:true } }
// 返回 { items, nextItemState }（nextItemState 供"推成功后"保存）
export function diffKeyToItems(key, value, now, prevItemState = {}) {
    const meta = parseKey(key);
    if (!meta) return { items: [], nextItemState: {} };
    const { kind, workId } = meta;
    const prev = prevItemState || {};
    const items = [];
    const next = {};

    // works_index：整传一条，指纹判断变没变
    if (kind === 'works_index') {
        const hash = fingerprint(value);
        if (!prev._index || prev._index.hash !== hash) {
            items.push({ workId, kind, itemId: '_index', value, contentHash: hash, clientUpdatedAt: now });
        }
        next._index = { hash };
        return { items, nextItemState: next };
    }

    // 数组类：chapter / settings_node / memory_group
    const arr = Array.isArray(value) ? value : [];
    const seen = new Set();
    for (const item of arr) {
        if (!item || item.id == null) continue;
        const itemId = String(item.id);
        seen.add(itemId);
        const hash = fingerprint(item);
        const prevOne = prev[itemId];
        if (prevOne && !prevOne.deleted && prevOne.hash === hash) {
            next[itemId] = { hash }; // 未变，不推
            continue;
        }
        // 变了（或新增）：章节用检测时间，设定/记忆组用自带 updatedAt
        const clientUpdatedAt = (kind === 'chapter')
            ? now
            : (item.updatedAt ? new Date(item.updatedAt).toISOString() : now);
        items.push({ workId, kind, itemId, value: item, contentHash: hash, clientUpdatedAt });
        next[itemId] = { hash };
    }

    // 删除检测（tombstone）：上次同步过、这次没了 → 明确删除
    for (const itemId of Object.keys(prev)) {
        if (prev[itemId]?.deleted) {
            next[itemId] = { deleted: true }; // 保留已有 tombstone 记录
        } else if (!seen.has(itemId)) {
            items.push({ workId, kind, itemId, deleted: true, clientUpdatedAt: now });
            next[itemId] = { deleted: true };
        }
    }

    return { items, nextItemState: next };
}

// 合并：云端条目 → 本地值。返回 { changed, value }。
// prevItemState: 上次同步该 key 的指纹表，用于判断"本地是否改过"（改过则保本地）。
export function mergeItemsIntoLocal(kind, localValue, items, prevItemState = {}) {
    const prev = prevItemState || {};

    // works_index：整条替换（取 server_seq 最大的一条）
    if (kind === 'works_index') {
        const latest = items.reduce((a, b) => ((b.serverSeq || 0) >= (a ? (a.serverSeq || 0) : -1) ? b : a), null);
        if (!latest || latest.deleted) return { changed: false, value: localValue };
        const localHash = fingerprint(localValue);
        // 本地自上次同步改过 → 保本地（拿不准保本地）
        if (prev._index?.hash && prev._index.hash !== localHash) return { changed: false, value: localValue };
        if (fingerprint(latest.value) === localHash) return { changed: false, value: localValue };
        return { changed: true, value: latest.value };
    }

    // 数组类：按 id 合并，保留本地顺序，新增追加末尾
    const local = Array.isArray(localValue) ? localValue : [];
    const map = new Map();
    for (const it of local) { if (it && it.id != null) map.set(String(it.id), it); }
    let changed = false;

    const sorted = [...items].sort((a, b) => (a.serverSeq || 0) - (b.serverSeq || 0));
    for (const cloud of sorted) {
        const id = String(cloud.itemId);
        const localItem = map.get(id);
        // 本地是否自上次同步改动过这条（prev 有指纹且和当前本地不一致 → 改过；prev 没记 → 视作改过，保本地）
        const localChanged = localItem
            ? (prev[id]?.hash ? prev[id].hash !== fingerprint(localItem) : true)
            : false;

        if (cloud.deleted) {
            // 明确 tombstone：本地没改过才删；本地改过则保本地（冲突时保数据）
            if (localItem && !localChanged) { map.delete(id); changed = true; }
            continue;
        }
        if (!localItem) { map.set(id, cloud.value); changed = true; continue; }
        // 本地改过 → 保本地（等 push）；本地没改且内容不同 → 用云端
        if (!localChanged && fingerprint(localItem) !== fingerprint(cloud.value)) {
            map.set(id, cloud.value);
            changed = true;
        }
    }
    if (!changed) return { changed: false, value: localValue };

    // 重建：保留本地原顺序，替换/删除；新增（本地原本没有的）追加末尾
    const result = [];
    const used = new Set();
    for (const it of local) {
        const id = it && it.id != null ? String(it.id) : null;
        if (id == null) { result.push(it); continue; }
        if (map.has(id)) { result.push(map.get(id)); used.add(id); }
        // 不在 map = 被删，跳过
    }
    for (const [id, it] of map) { if (!used.has(id)) result.push(it); }
    return { changed: true, value: result };
}
