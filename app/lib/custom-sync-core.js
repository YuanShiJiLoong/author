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

// UTF-8 字节数：后端按字节限制请求体，中文一个字占 3 字节，按字符数估会低估约 3 倍。
export function utf8ByteLength(str) {
    let bytes = 0;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code < 0x80) bytes += 1;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff && (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { bytes += 4; i++; }
        else bytes += 3;
    }
    return bytes;
}

const PUSH_BODY_OVERHEAD = utf8ByteLength(JSON.stringify({ items: [] }));

// 推送切批：同时限制条数和请求体字节数（请求体即 JSON.stringify({ items: batch })）。
// 只按条数切的话，章节一长整批就可能超过服务端的请求体上限，重试时还是同一批，永远推不上去。
// 单条就放不进一个请求的条目放进 oversized，不发送，由调用方明确报错。
export function splitPushBatches(items, { maxItems, maxBytes }) {
    const batches = [];
    const oversized = [];
    let batch = [];
    let bytes = PUSH_BODY_OVERHEAD;
    for (const item of items) {
        const itemBytes = utf8ByteLength(JSON.stringify(item));
        if (PUSH_BODY_OVERHEAD + itemBytes > maxBytes) {
            oversized.push({ item, bytes: PUSH_BODY_OVERHEAD + itemBytes });
            continue;
        }
        if (batch.length > 0 && (batch.length >= maxItems || bytes + 1 + itemBytes > maxBytes)) {
            batches.push(batch);
            batch = [];
            bytes = PUSH_BODY_OVERHEAD;
        }
        bytes += (batch.length > 0 ? 1 : 0) + itemBytes; // 1 = 条目之间的逗号
        batch.push(item);
    }
    if (batch.length > 0) batches.push(batch);
    return { batches, oversized };
}

// 存储键 → { kind, workId }
// 章节 / 设定 / 记忆组的值必须是数组；“没有”（null/undefined）是合法的空。
// 既不是数组也不是“没有”，说明本地记录已经损坏，同步层必须原样跳过。
export function isDamagedItemArray(kind, value) {
    return !!kind && kind !== 'works_index' && value != null && !Array.isArray(value);
}

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
// options.freshClientUpdatedAt：true 表示整个 key、Set 表示其中指定条目，强制用 now
// 作为版本，不用条目自带的 updatedAt。两个用途：
//   1. 从备份 / WebDAV 恢复——条目带的是原设备的旧时间，按原值推会被判 stale；
//      恢复是用户明确的"以这份为准"，它就该是最新版。
//   2. 被判 stale 后的重推——重推的语义就是"我这份才是要保留的"。不换版本戳的话，
//      服务器每次都会给出同样的 stale 结论，重试永远出不去（章节因为一直用 now
//      所以没这个问题，只有设定和记忆组会卡死）。
export function diffKeyToItems(key, value, now, prevItemState = {}, pendingItemState = {}, options = {}) {
    const meta = parseKey(key);
    if (!meta) return { items: [], nextItemState: {} };
    const { kind, workId } = meta;
    const prev = prevItemState || {};
    const items = [];
    const next = {};

    // works_index：整传一条，指纹判断变没变
    if (kind === 'works_index') {
        const hash = fingerprint(value);
        if (pendingItemState._index || !prev._index || prev._index.hash !== hash) {
            items.push({ workId, kind, itemId: '_index', value, contentHash: hash, clientUpdatedAt: now });
        }
        next._index = { hash };
        return { items, nextItemState: next };
    }

    // 本地记录已损坏：不能当成空数组，否则每一条都会被当成“已删除”推给其他设备。
    // 保留上次的同步状态，什么也不推，等记录被恢复后再照常比较。
    if (isDamagedItemArray(kind, value)) {
        return { items: [], nextItemState: { ...prev }, damagedLocalValue: true };
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
        if (!pendingItemState[itemId] && prevOne && !prevOne.deleted && prevOne.hash === hash) {
            next[itemId] = { hash }; // 未变，不推
            continue;
        }
        // 变了（或新增）：章节用检测时间，设定/记忆组用自带 updatedAt；
        // 恢复场景下一律用 now，否则外来的旧时间戳会被云端判为过期。
        const fresh = options.freshClientUpdatedAt;
        const useNow = kind === 'chapter' || fresh === true || fresh?.has?.(itemId) === true;
        const clientUpdatedAt = useNow
            ? now
            : (item.updatedAt ? new Date(item.updatedAt).toISOString() : now);
        items.push({ workId, kind, itemId, value: item, contentHash: hash, clientUpdatedAt });
        next[itemId] = { hash };
    }

    // 删除检测（tombstone）：上次同步过、这次没了 → 明确删除
    for (const itemId of new Set([...Object.keys(prev), ...Object.keys(pendingItemState)])) {
        if (seen.has(itemId)) continue;
        if (prev[itemId]?.deleted && !pendingItemState[itemId]) {
            next[itemId] = { deleted: true }; // 保留已有 tombstone 记录
        } else {
            // A missing acknowledgement may hide a successful create. A later
            // local deletion must still send a tombstone for that attempt.
            items.push({ workId, kind, itemId, deleted: true, clientUpdatedAt: now });
            next[itemId] = { deleted: true };
        }
    }

    return { items, nextItemState: next };
}

// Match acknowledgements within this single-key batch. Legacy servers may use
// a complete, ordered result array; a shortened array cannot be mapped by index.
export function matchPushResults(batch, data) {
    if (!data || data.ok === false || !Array.isArray(data.results)) return batch.map(() => null);
    const results = data.results;
    const hasIdentities = results.some(result => result?.itemId != null);
    if (!hasIdentities) {
        return batch.map((item, index) => {
            const result = results.length === batch.length ? results[index] : null;
            if (result?.kind != null && result.kind !== item.kind) return null;
            if (result?.workId != null && String(result.workId) !== String(item.workId)) return null;
            return result;
        });
    }
    return batch.map(item => {
        const matches = results.filter(result => result?.itemId != null && String(result.itemId) === String(item.itemId));
        if (matches.length !== 1) return null;
        const result = matches[0];
        if (result.kind != null && result.kind !== item.kind) return null;
        if (result.workId != null && String(result.workId) !== String(item.workId)) return null;
        return result;
    });
}

// Pull pages may repeat an item or arrive out of sequence. Use the same final
// revision for both the stored value and its confirmed fingerprint.
export function latestItemsById(items) {
    const latest = new Map();
    const sorted = [...items].sort((a, b) => (Number(a.serverSeq) || 0) - (Number(b.serverSeq) || 0));
    for (const item of sorted) latest.set(String(item.itemId), item);
    return [...latest.values()];
}

// Compare with the original local array, before applying any remote revision.
// An absent item with a live baseline is a local deletion, including on restart.
export function locallyChangedItemIds(localValue, prevItemState = {}) {
    const local = new Map((Array.isArray(localValue) ? localValue : [])
        .filter(item => item?.id != null).map(item => [String(item.id), item]));
    const changed = new Set();
    for (const [id, item] of local) {
        if (!prevItemState[id]?.hash || prevItemState[id].hash !== fingerprint(item)) changed.add(id);
    }
    for (const [id, previous] of Object.entries(prevItemState)) {
        if (!local.has(id) && previous?.hash && !previous.deleted) changed.add(id);
    }
    return changed;
}

// 合并：云端条目 → 本地值。返回 { changed, value }。
// prevItemState: 上次同步该 key 的指纹表，用于判断"本地是否改过"（改过则保本地）。
export function mergeItemsIntoLocal(kind, localValue, items, prevItemState = {}) {
    const prev = prevItemState || {};

    // works_index：完全覆盖——云端整份直接盖掉本地（“以最后上传的设备为准”，不合并、不保本地）。
    // 用户要的是把最后上传那台的完整作品列表镜像下来：删掉的就该消失、不复活。
    if (kind === 'works_index') {
        const latest = items.reduce((a, b) => ((Number(b.serverSeq) || 0) >= (a ? (Number(a.serverSeq) || 0) : -1) ? b : a), null);
        if (!latest || latest.deleted) return { changed: false, value: localValue };
        if (fingerprint(latest.value) === fingerprint(localValue)) return { changed: false, value: localValue };
        return { changed: true, value: latest.value };
    }

    // 本地记录已损坏：增量拉取只带部分条目，合并进去会得到残缺的列表。保持原样。
    if (isDamagedItemArray(kind, localValue)) return { changed: false, value: localValue, damagedLocalValue: true };

    // 数组类：按 id 合并，保留本地顺序，新增追加末尾
    const local = Array.isArray(localValue) ? localValue : [];
    const map = new Map();
    for (const it of local) { if (it && it.id != null) map.set(String(it.id), it); }
    let changed = false;
    const localChanges = locallyChangedItemIds(local, prev);

    for (const cloud of latestItemsById(items)) {
        const id = String(cloud.itemId);
        if (localChanges.has(id)) continue;
        const localItem = map.get(id);

        if (cloud.deleted) {
            if (localItem) { map.delete(id); changed = true; }
            continue;
        }
        if (!localItem) { map.set(id, cloud.value); changed = true; continue; }
        // 本地改过 → 保本地（等 push）；本地没改且内容不同 → 用云端
        if (fingerprint(localItem) !== fingerprint(cloud.value)) {
            map.set(id, cloud.value);
            changed = true;
        }
    }
    if (!changed) return { changed: false, value: localValue === undefined && items.length > 0 ? local : localValue };

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
