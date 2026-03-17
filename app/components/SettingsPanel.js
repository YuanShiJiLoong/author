'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Library, KeyRound, Settings, BookOpen, User, MapPin, Globe, Gem,
    ClipboardList, Ruler, Upload, Download, Trash2, X, Maximize2, Minimize2,
    FileText, Sparkles, Search, Coins, Plug, Radio, RefreshCw, CheckCircle2,
    XCircle, AlertTriangle, Globe2, Shuffle, Eye, EyeOff, Ban, Pencil, FolderOpen,
    Bell, RotateCcw, Monitor, CircleDot, Smartphone, Clapperboard,
    Heart, Star, Shield, Zap, Feather, Compass, Flag, Tag, Layers,
    Bookmark, Crown, Flame, Lightbulb, Music, Palette, Sword, Target,
    Moon, Sun, Cloud, TreePine, Mountain, Waves, Building, Car,
    Plus
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
    getProjectSettings,
    saveProjectSettings,
    getSettingsNodes,
    addSettingsNode,
    updateSettingsNode,
    deleteSettingsNode,
    WRITING_MODES,
    getWritingMode,
    setWritingMode,
    saveSettingsNodes,
    getActiveWorkId,
    setActiveWorkId,
    getAllWorks,
    addWork,
    removeWork,
    rebuildAllEmbeddings,
} from '../lib/settings';
import SettingsTree from './SettingsTree';
import { useI18n } from '../lib/useI18n';
import SettingsItemEditor from './SettingsItemEditor';
import { getModeRolePrompt } from '../lib/context-engine';
import { downloadFile, downloadBlob } from '../lib/project-io';
import {
    detectCategory, parseTextToFields, mapFieldsToContent,
    parseMultipleEntries, isStructuredText, parseStructuredText,
    preprocessPdfText,
    exportNodesToTxt, exportNodesToMarkdown,
    exportNodesToDocx, exportSettingsAsPdf, parseDocxToText, parsePdfToText,
    parsePmpxFile,
} from '../lib/settings-io';
import SettingsConflictModal from './SettingsConflictModal';

// 分类图标映射（Lucide）
const CAT_ICONS = {
    work: BookOpen,
    character: User,
    location: MapPin,
    world: Globe,
    object: Gem,
    plot: ClipboardList,
    rules: Ruler,
};
function CatIcon({ category, size = 14, ...props }) {
    const Icon = CAT_ICONS[category] || FileText;
    return <Icon size={size} {...props} />;
}

const CAT_STYLES = {
    work: { color: 'var(--cat-work)', bg: 'var(--cat-work-bg)' },
    character: { color: 'var(--cat-character)', bg: 'var(--cat-character-bg)' },
    location: { color: 'var(--cat-location)', bg: 'var(--cat-location-bg)' },
    world: { color: 'var(--cat-world)', bg: 'var(--cat-world-bg)' },
    object: { color: 'var(--cat-object)', bg: 'var(--cat-object-bg)' },
    plot: { color: 'var(--cat-plot)', bg: 'var(--cat-plot-bg)' },
    rules: { color: 'var(--cat-rules)', bg: 'var(--cat-rules-bg)' },
};

// 图标映射（与 CategorySettingsModal 共用同一套图标）
const ICON_MAP = {
    FolderOpen, User, MapPin, Globe, Gem, ClipboardList, Ruler,
    Heart, Star, Shield, Zap, Feather, Compass, Flag, Tag, Layers,
    Bookmark, Crown, Flame, Lightbulb, Music, Palette, Sword, Target,
    Moon, Sun, Cloud, TreePine, Mountain, Waves, Building, Car,
    FileText, BookOpen,
};
const ICON_GRID = [
    'User', 'Heart', 'Star', 'Shield', 'Zap', 'Crown',
    'Sword', 'Flag', 'Target', 'Compass', 'Feather', 'Flame',
    'Lightbulb', 'Moon', 'Sun', 'Cloud', 'TreePine', 'Mountain',
    'Waves', 'Building', 'Music', 'Palette', 'Bookmark', 'BookOpen',
    'MapPin', 'Globe', 'Gem', 'Tag', 'Layers', 'Car',
    'ClipboardList', 'Ruler', 'FolderOpen', 'FileText',
];
function getIconByName(name) {
    return ICON_MAP[name] || null;
}

export default function SettingsPanel() {
    const {
        showSettings: open,
        setShowSettings,
        setWritingMode: setGlobalWritingMode,
        incrementSettingsVersion,
        jumpToNodeId,
        setJumpToNodeId,
    } = useAppStore();

    const onClose = () => {
        setShowSettings(false);
        setGlobalWritingMode(getWritingMode());
        incrementSettingsVersion();
    };

    const [settings, setSettings] = useState(null);

    const [nodes, setNodes] = useState([]);
    const [works, setWorks] = useState([]);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [writingMode, setWritingModeState] = useState('webnovel');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeWorkId, setActiveWorkIdState] = useState(null);
    const [showNewWorkInput, setShowNewWorkInput] = useState(false);
    const [newWorkName, setNewWorkName] = useState('');
    const { t } = useI18n();

    const [expandedCategory, setExpandedCategory] = useState(null);
    const [showExportFormat, setShowExportFormat] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [iconPickerCat, setIconPickerCat] = useState(null); // 当前打开图标选择器的分类
    const [iconPickerRect, setIconPickerRect] = useState(null);

    // 删除确认弹窗状态
    const [deleteConfirm, setDeleteConfirm] = useState(null); // { message, onConfirm }

    // 检查是否应跳过删除确认
    const shouldSkipDeleteConfirm = () => {
        try {
            if (localStorage.getItem('author-delete-never-remind') === 'true') return true;
            const skipDate = localStorage.getItem('author-delete-skip-today');
            if (skipDate && skipDate === new Date().toISOString().slice(0, 10)) return true;
        } catch { /* ignore */ }
        return false;
    };

    // 获取当前作品的节点
    useEffect(() => {
        if (open) {
            setSettings(getProjectSettings());
            const loadData = async () => {
                // 加载作品列表
                const allWorks = await getAllWorks();
                setWorks(allWorks);

                // 初始化激活作品
                let wid = getActiveWorkId();
                if (!wid || !allWorks.find(w => w.id === wid)) {
                    wid = allWorks[0]?.id || null;
                    if (wid) setActiveWorkId(wid);
                }
                setActiveWorkIdState(wid);

                // 加载当前作品节点
                const workNodes = await getSettingsNodes(wid);
                setNodes(workNodes);
                setWritingModeState(getWritingMode());
                setSearchQuery('');

                // 跳转到指定节点
                if (jumpToNodeId) {
                    setSelectedNodeId(jumpToNodeId);
                    setJumpToNodeId(null);
                }
            };
            loadData();
        }
    }, [open]);

    // 当前作品节点即可见节点（无需再按作品过滤）
    const visibleNodes = nodes;

    const stats = useMemo(() => {
        const items = visibleNodes.filter(n => n.type === 'item');
        const workId = getActiveWorkId();
        // 内置分类（排除 bookInfo — 已移至独立面板）
        const builtIn = Object.entries(CAT_STYLES).filter(([cat]) => cat !== 'work').map(([cat, style]) => {
            const rf = visibleNodes.find(n => n.type === 'folder' && n.category === cat && n.parentId && n.parentId.startsWith('work-') && !visibleNodes.some(p => p.id === n.parentId));
            return {
                category: cat,
                count: items.filter(n => n.category === cat).length,
                label: t(`settings.categories.${cat}`),
                customIcon: rf?.icon || null,
                rootFolderId: rf?.id || null,
                ...style,
            };
        });
        // 用户自建分类（parentId === workId 的 folder/special，且 category 不在 CAT_STYLES 内，排除 bookInfo）
        const builtInCats = new Set(Object.keys(CAT_STYLES));
        builtInCats.add('bookInfo');
        const customFolders = visibleNodes.filter(n =>
            (n.type === 'folder' || n.type === 'special') && n.parentId === workId && !builtInCats.has(n.category)
        );
        // 每个自定义 folder 独立出一张卡片（不按 category 去重，因为多个 folder 可能共享 category='custom'）
        const countDescendants = (folderId) => {
            let count = 0;
            visibleNodes.filter(n => n.parentId === folderId).forEach(child => {
                if (child.type === 'item') count++;
                else count += countDescendants(child.id);
            });
            return count;
        };
        const custom = customFolders.map(rf => ({
            category: `custom__${rf.id}`,
            realCategory: rf.category,
            count: countDescendants(rf.id),
            label: rf.name || rf.category,
            customIcon: rf.icon || null,
            rootFolderId: rf.id,
            color: 'var(--cat-custom, #64748b)',
            bg: 'var(--cat-custom-bg, rgba(100,116,139,0.08))',
            isCustom: true,
        }));
        return [...builtIn, ...custom];
    }, [visibleNodes, t]);

    // 更换分类图标
    const handleChangeCatIcon = async (category, iconName) => {
        const catStat = stats.find(s => s.category === category);
        if (!catStat?.rootFolderId) return;
        await updateSettingsNode(catStat.rootFolderId, { icon: iconName });
        setNodes(prev => prev.map(n => n.id === catStat.rootFolderId ? { ...n, icon: iconName } : n));
        setIconPickerCat(null);
    };

    const handleSwitchWork = async (workId) => {
        setActiveWorkIdState(workId);
        setActiveWorkId(workId);
        // 同步 Zustand store，触发 page.js 重载章节
        useAppStore.getState().setActiveWorkId(workId);
        setSelectedNodeId(null);
        // 重新加载该作品的节点
        const workNodes = await getSettingsNodes(workId);
        setNodes(workNodes);
    };

    const handleCreateWork = async () => {
        const name = newWorkName.trim();
        if (!name) return;
        const workNode = await addWork(name);
        setWorks(await getAllWorks());
        await handleSwitchWork(workNode.id);
        setNewWorkName('');
        setShowNewWorkInput(false);
    };

    const handleDeleteWork = async (workId) => {
        const work = nodes.find(n => n.id === workId);
        if (!work) return;
        if (works.length <= 1) { alert(t('settings.deleteWorkAlert')); return; }
        if (shouldSkipDeleteConfirm()) {
            await doDeleteWork(workId);
        } else {
            return new Promise((resolve) => {
                setDeleteConfirm({
                    message: t('settings.deleteWorkPrompt').replace('{name}', work.name),
                    onConfirm: async () => { setDeleteConfirm(null); await doDeleteWork(workId); resolve(); },
                    onCancel: () => { setDeleteConfirm(null); resolve(); },
                });
            });
        }
    };

    const doDeleteWork = async (workId) => {
        const updatedWorks = await removeWork(workId);
        setWorks(updatedWorks);
        // 切换到第一个存活的作品
        const nextWork = updatedWorks[0];
        if (nextWork) {
            await handleSwitchWork(nextWork.id);
        } else {
            setNodes([]);
        }
    };

    // 一键清空当前作品的所有条目（保留文件夹结构）
    const handleClearAllItems = async () => {
        if (!activeWorkId) return;
        const workEntry = works.find(w => w.id === activeWorkId);
        const workName = workEntry?.name || '';
        const itemCount = nodes.filter(n => n.type === 'item').length;
        if (itemCount === 0) return;

        const msg = t('settings.clearAllPrompt').replace('{name}', workName).replace('{count}', itemCount);
        setDeleteConfirm({
            message: msg,
            onConfirm: async () => {
                setDeleteConfirm(null);
                const updatedNodes = nodes.filter(n => n.type !== 'item');
                await saveSettingsNodes(updatedNodes, activeWorkId);
                setNodes(updatedNodes);
                setSelectedNodeId(null);
            },
            onCancel: () => setDeleteConfirm(null),
        });
    };

    // 收集当前作品的所有节点（现在就是 nodes 本身）
    const getWorkNodes = () => nodes;

    // 导出当前作品的设定集
    const handleExportSettings = async (format = 'json') => {
        if (!activeWorkId) return;
        const workEntry = works.find(w => w.id === activeWorkId);
        if (!workEntry) return;
        const workNodes = getWorkNodes();
        const baseName = workEntry.name || '设定集';
        setShowExportFormat(false);

        if (format === 'txt') {
            const txt = exportNodesToTxt(workNodes);
            await downloadFile(txt, `${baseName}-设定集.txt`, 'text/plain');
        } else if (format === 'md') {
            const md = exportNodesToMarkdown(workNodes);
            await downloadFile(md, `${baseName}-设定集.md`, 'text/markdown');
        } else if (format === 'docx') {
            const blob = await exportNodesToDocx(workNodes);
            await downloadBlob(blob, `${baseName}-设定集.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        } else if (format === 'pdf') {
            exportSettingsAsPdf(workNodes);
        } else {
            // JSON 格式
            const exportNodes = workNodes.map(({ embedding, ...rest }) => rest);
            const projectSettings = getProjectSettings();
            const data = {
                type: 'author-settings-export',
                version: 2,
                workName: workEntry.name,
                exportedAt: new Date().toISOString(),
                nodes: exportNodes,
                writingMode: projectSettings.writingMode || 'webnovel',
            };
            await downloadFile(JSON.stringify(data, null, 2), `${baseName}-设定集.json`, 'application/json');
        }
    };

    // 导入设定集
    const handleImportSettings = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const ext = file.name.split('.').pop().toLowerCase();

        // PMPX 导入（排骨笔记）— 独立流程
        if (ext === 'pmpx') {
            try {
                if (!activeWorkId) { alert(t('settings.importNoWork')); return; }
                const importedItems = await parsePmpxFile(file);
                if (importedItems.length === 0) {
                    alert(t('settings.importEmpty') || '未能从文件中解析出任何设定条目');
                    return;
                }
                // 检测冲突
                const existingItems = nodes.filter(n => n.type === 'item' && n.parentId);
                const conflicts = [];
                const noConflicts = [];
                for (const item of importedItems) {
                    const existing = existingItems.find(n =>
                        n.name === item.name && n.category === item.category &&
                        nodes.find(p => p.id === n.parentId && (p.parentId === activeWorkId || p.id === activeWorkId))
                    );
                    if (existing) {
                        conflicts.push({ name: item.name, category: item.category, existing, imported: item });
                    } else {
                        noConflicts.push(item);
                    }
                }
                if (conflicts.length > 0) {
                    setConflictData({ conflicts, noConflicts });
                } else {
                    await doImportItems(noConflicts, []);
                }
            } catch (err) { alert((t('settings.importError')) + err.message); }
            return;
        }

        // 先把文件转换为纯文本
        let text;
        if (ext === 'json') {
            text = await file.text();
        } else if (ext === 'docx') {
            text = await parseDocxToText(file);
        } else if (ext === 'pdf') {
            text = await parsePdfToText(file);
            text = preprocessPdfText(text); // 恢复标题结构
        } else {
            text = await file.text();
        }

        // JSON 导入
        if (ext === 'json') {
            try {
                const data = JSON.parse(text);
                if (data.type !== 'author-settings-export' || !Array.isArray(data.nodes)) {
                    alert(t('settings.importInvalidFile')); return;
                }
                const importedNodes = data.nodes;
                const importedWorkNode = importedNodes.find(n => n.type === 'work');
                if (!importedWorkNode) { alert(t('settings.importNoWork')); return; }
                // 分离 work 节点和子节点
                const importedSubNodes = importedNodes.filter(n => n.type !== 'work');

                const restorePS = () => {
                    if (data.writingMode) {
                        const ps = getProjectSettings();
                        if (data.writingMode) ps.writingMode = data.writingMode;
                        saveProjectSettings(ps); setSettings(ps);
                        if (data.writingMode) { setWritingModeState(data.writingMode); setWritingMode(data.writingMode); }
                    }
                    // 兼容旧版导出
                    if (data.bookInfo && Object.values(data.bookInfo).some(v => v)) {
                        const biNode = importedSubNodes.find(n => n.parentId === importedWorkNode.id && n.category === 'bookInfo');
                        if (biNode && (!biNode.content || Object.keys(biNode.content).length === 0)) {
                            biNode.content = data.bookInfo;
                        }
                    }
                };
                const existingWork = works.find(w => w.name === importedWorkNode.name);
                if (existingWork) {
                    if (!confirm((t('settings.importOverwrite')).replace('{name}', importedWorkNode.name))) return;
                    // 覆盖现有作品的节点
                    await saveSettingsNodes(importedSubNodes, existingWork.id);
                    restorePS();
                    setWorks(await getAllWorks());
                    await handleSwitchWork(existingWork.id);
                } else {
                    // 创建新作品
                    const newWork = await addWork(importedWorkNode.name, importedWorkNode.id);
                    await saveSettingsNodes(importedSubNodes, newWork.id);
                    restorePS();
                    setWorks(await getAllWorks());
                    await handleSwitchWork(newWork.id);
                }
            } catch (err) { alert((t('settings.importError')) + err.message); }
            return;
        }

        // TXT / MD / DOCX / PDF 智能导入
        try {
            if (!activeWorkId) { alert(t('settings.importNoWork')); return; }

            console.log('[Settings Import] activeWorkId:', activeWorkId);
            console.log('[Settings Import] text length:', text?.length, 'first 500 chars:', text?.substring(0, 500));
            console.log('[Settings Import] isStructured:', isStructuredText(text));

            // 解析文本为条目列表 [{name, category, content}]
            let importedItems = [];

            if (isStructuredText(text)) {
                const parsedEntries = parseStructuredText(text);
                console.log('[Settings Import] structured entries:', parsedEntries.length, parsedEntries.map(e => e.name));
                for (const entry of parsedEntries) {
                    const mapped = mapFieldsToContent(entry.fields, entry.category);
                    const nodeName = mapped.name || entry.name || '导入条目';
                    if (Object.keys(mapped.content).length === 0) continue;
                    importedItems.push({ name: nodeName, category: entry.category, content: mapped.content });
                }
            } else {
                const blocks = parseMultipleEntries(text);
                console.log('[Settings Import] unstructured blocks:', blocks.length);
                for (const block of blocks) {
                    const parsed = parseTextToFields(block);
                    if (Object.keys(parsed).length === 0) continue;
                    const category = detectCategory(block);
                    const mapped = mapFieldsToContent(parsed, category);
                    const nodeName = mapped.name || Object.values(parsed)[0]?.substring(0, 20) || '导入条目';
                    importedItems.push({ name: nodeName, category, content: mapped.content });
                }
            }

            console.log('[Settings Import] importedItems:', importedItems.length, importedItems.map(i => i.name));

            if (importedItems.length === 0) {
                alert(t('settings.importEmpty') || '未能从文件中解析出任何设定条目');
                return;
            }

            // 检测冲突（同名 + 同分类）
            const existingItems = nodes.filter(n => n.type === 'item' && n.parentId);
            console.log('[Settings Import] existingItems in activeWork:', existingItems.filter(n =>
                nodes.find(p => p.id === n.parentId && (p.parentId === activeWorkId || p.id === activeWorkId))
            ).map(n => `${n.name}(${n.category})`));
            const conflicts = [];
            const noConflicts = [];

            for (const item of importedItems) {
                const existing = existingItems.find(n =>
                    n.name === item.name && n.category === item.category &&
                    nodes.find(p => p.id === n.parentId && (p.parentId === activeWorkId || p.id === activeWorkId))
                );
                console.log('[Settings Import] checking:', item.name, 'cat:', item.category, '→', existing ? 'CONFLICT' : 'new');
                if (existing) {
                    conflicts.push({ name: item.name, category: item.category, existing, imported: item });
                } else {
                    noConflicts.push(item);
                }
            }

            console.log('[Settings Import] conflicts:', conflicts.length, 'noConflicts:', noConflicts.length);

            if (conflicts.length > 0) {
                // 有冲突 → 显示冲突弹窗
                console.log('[Settings Import] SHOWING CONFLICT MODAL with', conflicts.length, 'conflicts');
                setConflictData({ conflicts, noConflicts });
                return; // 不继续执行后续逻辑
            } else {
                // 无冲突 → 直接导入
                await doImportItems(noConflicts, []);
            }
        } catch (err) {
            alert((t('settings.importError')) + err.message);
        }
    };

    // 冲突解决状态
    const [conflictData, setConflictData] = useState(null);

    // 查找分类对应的父文件夹
    const catSuffixMap = {
        character: 'characters', location: 'locations', object: 'objects',
        world: 'world', plot: 'plot', rules: 'rules',
    };
    const findParentFolder = (category) => {
        const suffix = catSuffixMap[category] || category;
        let parentId = nodes.find(n => n.parentId === activeWorkId && n.id.endsWith('-' + suffix))?.id;
        if (!parentId) {
            parentId = nodes.find(n => n.parentId === activeWorkId && n.category === category)?.id;
        }
        return parentId || activeWorkId;
    };

    // 执行导入
    const doImportItems = async (items, updates) => {
        let updatedNodes = [...nodes];

        // 处理冲突解决的更新
        for (const up of updates) {
            updatedNodes = updatedNodes.map(n => {
                if (n.id === up.nodeId) {
                    return { ...n, content: up.content, name: up.name || n.name, updatedAt: new Date().toISOString() };
                }
                return n;
            });
        }

        // 添加新条目
        let importedCount = 0;
        for (const item of items) {
            const parentId = findParentFolder(item.category);
            const nodeId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6) + importedCount;
            updatedNodes.push({
                id: nodeId, name: item.name, type: 'item',
                category: item.category, parentId, order: importedCount,
                content: item.content,
                collapsed: false, enabled: true,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            });
            importedCount++;
        }

        await saveSettingsNodes(updatedNodes);
        setNodes(updatedNodes);
        const totalCount = items.length + updates.length;
        alert((t('settings.importTextSuccess') || '成功导入 {count} 个设定条目').replace('{count}', totalCount));
    };

    // 冲突解决确认
    const handleConflictConfirm = async (resolvedUpdates, noConflictItems) => {
        setConflictData(null);
        await doImportItems(noConflictItems, resolvedUpdates);
    };

    if ((!open && !conflictData) || !settings) return null;

    const handleSettingsSave = (section, data) => {
        const newSettings = { ...settings, [section]: data };
        setSettings(newSettings);
        saveProjectSettings(newSettings);
    };

    // 节点操作
    const handleAddNode = async (parentId, category) => {
        const parent = parentId ? nodes.find(n => n.id === parentId) : null;
        let cat = category || (parent ? parent.category : 'custom');
        // 如果父节点是作品节点，创建文件夹（大分类）；否则创建条目
        // 注意：getSettingsNodes 不含 work 节点，parentId 存在但找不到 parent 说明是 work 节点
        const isParentWork = (parent && parent.type === 'work') || (parentId && !parent);
        const newNode = await addSettingsNode({
            name: isParentWork ? t('settings.newFolder') : t('settings.newItem'),
            type: isParentWork ? 'folder' : 'item',
            category: cat,
            parentId,
            enabled: true,
        });
        setNodes(await getSettingsNodes());
        setSelectedNodeId(newNode.id);
    };

    const handleDeleteNode = async (id) => {
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        if (shouldSkipDeleteConfirm()) {
            await doDeleteNode(id);
        } else {
            return new Promise((resolve) => {
                setDeleteConfirm({
                    message: t('settings.deleteNodePrompt').replace('{name}', node.name),
                    onConfirm: async () => { setDeleteConfirm(null); await doDeleteNode(id); resolve(); },
                    onCancel: () => { setDeleteConfirm(null); resolve(); },
                });
            });
        }
    };

    const doDeleteNode = async (id) => {
        await deleteSettingsNode(id);
        setNodes(await getSettingsNodes());
        if (selectedNodeId === id) setSelectedNodeId(null);
    };

    const handleRenameNode = async (id, newName) => {
        await updateSettingsNode(id, { name: newName });
        setNodes(await getSettingsNodes());
    };

    const handleToggleEnabled = async (id) => {
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        const newEnabled = node.enabled === false ? true : false;
        await updateSettingsNode(id, { enabled: newEnabled });
        setNodes(prev => prev.map(n => n.id === id ? { ...n, enabled: newEnabled } : n));
    };

    const handleUpdateNode = (id, updates) => {
        // 乐观更新：立即同步 React 状态，防止异步操作（如 embedding API）导致文字回退
        const updatedNodes = nodes.map(n => n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n);
        setNodes(updatedNodes);
        // 后台持久化（传入当前节点，避免重新读取 API）
        updateSettingsNode(id, updates, updatedNodes);
    };

    const selectedNode = visibleNodes.find(n => n.id === selectedNodeId);
    const showBookInfo = selectedNode?.type === 'special' && selectedNode?.category === 'bookInfo';

    // 面板标题映射
    const panelTitles = {
        settings: { icon: <Library size={20} style={{ verticalAlign: 'text-bottom' }} />, title: t('settings.tabSettings'), subtitle: t('settings.subtitle') },
        apiConfig: { icon: <KeyRound size={20} style={{ verticalAlign: 'text-bottom' }} />, title: t('settings.tabApi'), subtitle: '' },
        preferences: { icon: <Settings size={20} style={{ verticalAlign: 'text-bottom' }} />, title: t('settings.tabPreferences'), subtitle: '' },
    };
    const currentPanel = panelTitles[open] || panelTitles.settings;

    // 始终挂载在 DOM，用 CSS display 切换可见性 —— 零渲染开销
    return (
        <div className="settings-panel-overlay" style={{ display: open ? '' : 'none' }} onMouseDown={e => { e.currentTarget._mouseDownTarget = e.target; }} onClick={e => { if (e.currentTarget._mouseDownTarget === e.currentTarget) onClose(); }}>
            <div className={`settings-panel-container glass-panel${isFullscreen ? ' fullscreen' : ''}`} onClick={e => e.stopPropagation()}>
                {/* 头部 */}
                <div className="settings-header" style={{ background: 'transparent' }}>
                    <h2>
                        {currentPanel.icon} {currentPanel.title}
                        {currentPanel.subtitle && <span className="subtitle">— {currentPanel.subtitle}</span>}
                    </h2>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {open === 'settings' && <button className="btn btn-ghost btn-icon" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? '退出全屏' : '全屏'}>
                            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>}
                        <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
                    </div>
                </div>

                {/* 内容区 */}
                {open === 'apiConfig' ? (
                    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
                        <ApiConfigForm data={settings.apiConfig} onChange={data => handleSettingsSave('apiConfig', data)} />
                    </div>
                ) : open === 'preferences' ? (
                    <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
                        <PreferencesForm />
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* 作品切换器 - 下拉菜单 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
                            <BookOpen size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('settings.workLabel')}</span>
                            <div style={{ position: 'relative', flex: '0 1 auto' }}>
                                <select
                                    value={activeWorkId || ''}
                                    onChange={e => handleSwitchWork(e.target.value)}
                                    style={{
                                        padding: '6px 36px 6px 12px',
                                        border: '1.5px solid var(--accent, #6366f1)',
                                        borderRadius: 10,
                                        background: 'var(--bg-card, #fff)',
                                        color: 'var(--text-primary)',
                                        fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer', outline: 'none',
                                        appearance: 'none', WebkitAppearance: 'none',
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7 10l5 5 5-5'/%3E%3C/svg%3E")`,
                                        backgroundRepeat: 'no-repeat',
                                        backgroundPosition: 'right 10px center',
                                        boxShadow: '0 1px 4px rgba(99,102,241,0.08)',
                                        transition: 'all 0.15s',
                                        minWidth: 100,
                                    }}
                                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-glow, rgba(99,102,241,0.15))'; }}
                                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--accent, #6366f1)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(99,102,241,0.08)'; }}
                                >
                                    {works.map(w => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </select>
                            </div>
                            {showNewWorkInput ? (
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <input style={{ padding: '5px 10px', border: '1.5px solid var(--accent)', borderRadius: 10, fontSize: 12, background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', width: 120 }}
                                        value={newWorkName} onChange={e => setNewWorkName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleCreateWork(); if (e.key === 'Escape') setShowNewWorkInput(false); }}
                                        placeholder={t('settings.workNamePlaceholder')} autoFocus />
                                    <button className="btn btn-primary btn-sm" style={{ padding: '4px 10px', fontSize: 11, borderRadius: 8 }} onClick={handleCreateWork}>{t('settings.confirmBtn')}</button>
                                    <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setShowNewWorkInput(false)}>{t('common.cancel')}</button>
                                </div>
                            ) : (
                                <button style={{ padding: '5px 10px', border: '1px dashed var(--border-light)', borderRadius: 8, background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', transition: 'all 0.15s' }}
                                    onClick={() => { setNewWorkName(''); setShowNewWorkInput(true); }}>{t('settings.newWork')}</button>
                            )}
                            {works.length > 1 && (
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '4px 6px', opacity: 0.7, transition: 'opacity 0.15s' }}
                                    onClick={() => handleDeleteWork(activeWorkId)} title={t('common.delete') + '作品'}
                                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444'; }}
                                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                ><X size={14} /></button>
                            )}
                            {/* 右侧导入导出清空 */}
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, alignItems: 'center', position: 'relative' }}>
                                <div style={{ position: 'relative', display: 'inline-block' }}>
                                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s' }}
                                        onClick={() => setShowExportFormat(!showExportFormat)} title={t('settings.exportSettingsTitle')}
                                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light, rgba(99,102,241,0.08))'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                                    ><Upload size={13} /></button>
                                    {showExportFormat && (
                                        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-primary)', border: '1px solid var(--border-light)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 20, overflow: 'hidden', minWidth: 120 }}>
                                            {[{ key: 'json', label: 'JSON (完整)' }, { key: 'txt', label: 'TXT (纯文本)' }, { key: 'md', label: 'Markdown' }, { key: 'docx', label: 'Word (.docx)' }, { key: 'pdf', label: 'PDF (打印)' }].map(f => (
                                                <button key={f.key} style={{ display: 'block', width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left', transition: 'background 0.1s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                                    onClick={() => handleExportSettings(f.key)}
                                                ><FileText size={12} style={{ marginRight: 6 }} />{f.label}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s' }}
                                    onClick={() => document.getElementById('settings-import-input')?.click()} title={t('settings.importSettings')}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-light, rgba(99,102,241,0.08))'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                                ><Download size={13} /></button>
                                <input id="settings-import-input" type="file" accept=".json,.txt,.md,.docx,.pdf,.pmpx" onChange={handleImportSettings} style={{ display: 'none' }} />
                                <div style={{ width: 1, height: 14, background: 'var(--border-light)', margin: '0 2px' }} />
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 6px', borderRadius: 6, transition: 'all 0.15s' }}
                                    onClick={handleClearAllItems} title={t('settings.clearAll') || '清空设定'}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none'; }}
                                ><Trash2 size={13} /></button>
                            </div>
                        </div>

                        {/* ===== 分类看板 ===== */}
                        <div style={{ flex: 1, padding: '24px 28px', overflow: 'auto' }}>
                            {/* 统计摘要 */}
                            <div style={{ display: 'flex', gap: 12, marginBottom: 20, maxWidth: 880, margin: '0 auto 20px' }}>
                                <div style={{ padding: '10px 16px', borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', flex: 1 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>词条总数</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {stats.reduce((s, c) => s + c.count, 0)}
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>条设定</span>
                                    </div>
                                </div>
                                <div style={{ padding: '10px 16px', borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', flex: 1 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>分类数</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {stats.length}
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>个分类</span>
                                    </div>
                                </div>
                            </div>

                            {/* 分类卡片网格 */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, maxWidth: 880, margin: '0 auto' }}>
                                {stats.map(cat => {
                                    const defaultIcon = CAT_ICONS[cat.category] || FileText;
                                    const CustomIcon = cat.customIcon ? (getIconByName(cat.customIcon) || defaultIcon) : defaultIcon;
                                    const Icon = CustomIcon;
                                    const color = CAT_STYLES[cat.category]?.color || '#64748b';
                                    const bg = CAT_STYLES[cat.category]?.bg || 'var(--bg-secondary)';
                                    // 获取该分类最近的几个条目名称
                                    const catItems = visibleNodes
                                        .filter(n => n.type === 'item' && n.category === cat.category && n.name)
                                        .slice(0, 3)
                                        .map(n => n.name);
                                    const isPickerOpen = iconPickerCat === cat.category;
                                    return (
                                        <div key={cat.category} style={{ position: 'relative' }}>
                                        <button style={{
                                            position: 'relative', display: 'flex', flexDirection: 'column',
                                            padding: '20px 22px 16px', textAlign: 'left', width: '100%', height: '100%',
                                            border: '1px solid var(--border-light)', borderRadius: 18,
                                            background: 'var(--bg-primary)',
                                            cursor: 'pointer', transition: 'all 0.25s ease', overflow: 'hidden',
                                            minHeight: 170,
                                        }}
                                            onClick={() => { onClose(); setTimeout(() => useAppStore.getState().setOpenCategoryModal(cat.realCategory || cat.category), 80); }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.transform = 'translateY(-4px)';
                                                e.currentTarget.style.boxShadow = `0 12px 32px ${color}18, 0 0 0 1px ${color}30`;
                                                e.currentTarget.style.borderColor = `${color}50`;
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.transform = 'none';
                                                e.currentTarget.style.boxShadow = 'none';
                                                e.currentTarget.style.borderColor = 'var(--border-light)';
                                            }}
                                        >
                                            {/* 顶部：图标 + 计数 */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, width: '100%' }}>
                                                <span
                                                    title="点击更换图标"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setIconPickerRect(rect);
                                                        setIconPickerCat(isPickerOpen ? null : cat.category);
                                                    }}
                                                    style={{
                                                        width: 44, height: 44, borderRadius: 13,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: '#fff', background: color,
                                                        boxShadow: `0 6px 16px ${color}30`,
                                                        cursor: 'pointer', transition: 'transform 0.15s',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.12)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                                                >
                                                    <Icon size={22} />
                                                </span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.5px' }}>
                                                        {cat.count}
                                                    </div>
                                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700, marginTop: 2 }}>
                                                        ITEMS
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 标题 */}
                                            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                                                {cat.label}
                                            </div>

                                            {/* 预览条目 */}
                                            <div style={{ flex: 1, marginBottom: 12 }}>
                                                {catItems.length > 0 ? catItems.map((name, idx) => (
                                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>
                                                        <span style={{ width: 4, height: 4, borderRadius: 2, background: color, flexShrink: 0 }} />
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                                                    </div>
                                                )) : (
                                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', opacity: 0.6 }}>暂无条目</div>
                                                )}
                                            </div>

                                            {/* 底部 */}
                                            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                    {cat.count > 0 ? `共 ${cat.count} 条` : '点击创建'}
                                                </span>
                                                <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)' }}>
                                                    <span style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1 }}>›</span>
                                                </span>
                                            </div>

                                            {/* 装饰水印图标 */}
                                            <div style={{ position: 'absolute', bottom: 8, right: 8, opacity: 0.04, pointerEvents: 'none' }}>
                                                <Icon size={64} />
                                            </div>
                                        </button>

                                        {/* 图标选择器弹窗 */}
                                        {isPickerOpen && (
                                            <div
                                                style={{
                                                    position: 'absolute', top: 56, left: 16, zIndex: 100,
                                                    background: 'var(--bg-card, #fff)',
                                                    border: '1px solid var(--border-light)',
                                                    borderRadius: 14,
                                                    boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
                                                    padding: 12, width: 240,
                                                }}
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, padding: '0 2px' }}>选择图标</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                                                    {ICON_GRID.map(name => {
                                                        const IcoComp = ICON_MAP[name];
                                                        if (!IcoComp) return null;
                                                        const isActive = cat.customIcon === name || (!cat.customIcon && ICON_MAP[name] === defaultIcon);
                                                        return (
                                                            <button
                                                                key={name}
                                                                style={{
                                                                    width: 34, height: 34, border: 'none', borderRadius: 8,
                                                                    background: isActive ? bg : 'transparent',
                                                                    color: isActive ? color : 'var(--text-secondary)',
                                                                    cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    transition: 'all 0.12s ease',
                                                                    outline: isActive ? `2px solid ${color}` : 'none',
                                                                    outlineOffset: -2,
                                                                }}
                                                                onClick={(e) => { e.stopPropagation(); handleChangeCatIcon(cat.category, name); }}
                                                                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-hover, #f3f4f6)'; e.currentTarget.style.color = color; }}}
                                                                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}}
                                                                title={name}
                                                            >
                                                                <IcoComp size={16} />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        </div>
                                    );
                                })}

                                {/* 新建分类 */}
                                <button
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        padding: '20px 22px', textAlign: 'center', width: '100%',
                                        border: '2px dashed var(--border-light)', borderRadius: 18,
                                        background: 'transparent',
                                        cursor: 'pointer', transition: 'all 0.25s ease',
                                        minHeight: 170, gap: 10,
                                    }}
                                    onClick={async () => {
                                        const workId = getActiveWorkId();
                                        if (!workId) return;
                                        // 每个自定义分类需要唯一的 category ID，否则会被 stats 去重合并为一张卡片
                                        const uniqueCat = 'custom-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
                                        const newNode = await addSettingsNode({
                                            name: '新分类',
                                            type: 'folder',
                                            category: uniqueCat,
                                            parentId: workId,
                                            icon: 'Gem',
                                        });
                                        if (newNode) {
                                            setNodes(prev => [...prev, newNode]);
                                            incrementSettingsVersion();
                                        }
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.borderColor = 'var(--accent)';
                                        e.currentTarget.style.background = 'var(--accent-light, rgba(99,102,241,0.04))';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.borderColor = 'var(--border-light)';
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.transform = 'none';
                                    }}
                                >
                                    <span style={{
                                        width: 44, height: 44, borderRadius: 13,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'var(--text-muted)', background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-light)',
                                    }}>
                                        <Plus size={22} />
                                    </span>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>新建分类</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {
                conflictData && createPortal(
                    <SettingsConflictModal
                        conflicts={conflictData.conflicts}
                        noConflicts={conflictData.noConflicts}
                        onConfirm={handleConflictConfirm}
                        onClose={() => setConflictData(null)}
                    />,
                    document.body // Render into document.body or a specific portal root
                )
            }
            {
                deleteConfirm && createPortal(
                    <DeleteConfirmModal
                        message={deleteConfirm.message}
                        onConfirm={deleteConfirm.onConfirm}
                        onCancel={deleteConfirm.onCancel}
                    />,
                    document.body
                )
            }
        </div>
    );
}

export const PROVIDERS = [
    // === 国内供应商 ===
    { key: 'zhipu', label: '智谱AI (GLM)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-flash', 'glm-4-plus', 'glm-4-long', 'glm-4'] },
    { key: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
    { key: 'bailian', label: '阿里云百炼 (千问)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', anthropicBaseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic', models: ['qwen3.5-plus', 'qwen3-max'], supportedFormats: ['openai', 'anthropic'], defaultFormat: 'openai', allowCustomModel: true },
    { key: 'volcengine', label: '火山引擎 (豆包)', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: [], hint: '需在火山引擎控制台创建推理接入点，填入 endpoint_id 作为模型名' },
    { key: 'moonshot', label: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
    { key: 'stepfun', label: '阶跃星辰 (Step)', baseUrl: 'https://api.stepfun.com/v1', models: ['step-2-16k', 'step-1-8k', 'step-1-32k', 'step-1-128k'] },
    { key: 'yi', label: '零一万物 (Yi)', baseUrl: 'https://api.lingyiwanwu.com/v1', models: ['yi-lightning', 'yi-large', 'yi-medium', 'yi-spark'] },
    { key: 'baichuan', label: '百川 (Baichuan)', baseUrl: 'https://api.baichuan-ai.com/v1', models: ['Baichuan4', 'Baichuan3-Turbo', 'Baichuan3-Turbo-128k'] },
    { key: 'hunyuan', label: '腾讯混元', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', models: ['hunyuan-turbo', 'hunyuan-pro', 'hunyuan-standard', 'hunyuan-lite'] },
    { key: 'baidu', label: '百度文心', baseUrl: 'https://qianfan.baidubce.com/v2', models: ['ernie-4.0-turbo-8k', 'ernie-4.0-8k', 'ernie-3.5-8k', 'ernie-speed-8k'] },
    { key: 'minimax', label: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1', anthropicBaseUrl: 'https://api.minimaxi.com/anthropic', models: ['MiniMax-M2.5', 'MiniMax-M2.1', 'MiniMax-M2.5-highspeed'], supportedFormats: ['openai', 'anthropic'], defaultFormat: 'openai', allowCustomModel: true },
    { key: 'siliconflow', label: 'SiliconFlow (硅基流动)', baseUrl: 'https://api.siliconflow.cn/v1', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'THUDM/glm-4-9b-chat'] },
    // === 国际供应商 ===
    { key: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'o3-mini'] },
    { key: 'claude', label: 'Claude (Anthropic)', baseUrl: 'https://api.anthropic.com', models: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022'], apiFormat: 'anthropic' },
    { key: 'gemini', label: 'Gemini (OpenAI兼容)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'] },
    { key: 'gemini-native', label: 'Gemini（原生格式）', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'] },
    { key: 'openai-responses', label: 'OpenAI Responses', baseUrl: 'https://api.openai.com/v1', models: [] },
    { key: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'] },
    { key: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'open-mistral-nemo'] },
    { key: 'cohere', label: 'Cohere', baseUrl: 'https://api.cohere.com/v2', models: ['command-r-plus', 'command-r', 'command-light'] },
    { key: 'together', label: 'Together AI', baseUrl: 'https://api.together.xyz/v1', models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'deepseek-ai/DeepSeek-R1'] },
    { key: 'perplexity', label: 'Perplexity', baseUrl: 'https://api.perplexity.ai', models: ['sonar-pro', 'sonar', 'sonar-reasoning-pro', 'sonar-reasoning'] },
    { key: 'xai', label: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', models: ['grok-3', 'grok-3-mini', 'grok-2'] },
    { key: 'cerebras', label: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', models: ['llama-3.3-70b', 'llama-3.1-8b'] },
    { key: 'github', label: 'GitHub Models', baseUrl: 'https://models.inference.ai.azure.com', models: ['gpt-4o', 'gpt-4o-mini', 'Phi-3.5-MoE-instruct'] },
    // === 聚合/转发 ===
    { key: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['google/gemini-2.5-flash-preview', 'anthropic/claude-sonnet-4', 'openai/gpt-4o', 'deepseek/deepseek-chat-v3-0324', 'meta-llama/llama-4-maverick'] },
    // === 自定义 ===
    { key: 'custom', label: '自定义 (OpenAI兼容)', baseUrl: '', models: [] },
    { key: 'custom-gemini', label: '自定义 (Gemini格式)', baseUrl: '', models: [] },
    { key: 'custom-claude', label: '自定义 (Claude格式)', baseUrl: '', models: [] },
];

function PreferencesForm() {
    const { language, setLanguage, visualTheme, setVisualTheme, sidebarPushMode, setSidebarPushMode, aiSidebarPushMode, setAiSidebarPushMode } = useAppStore();
    const { t } = useI18n();

    // ---- 自定义提示词 ----
    const [customPrompt, setCustomPrompt] = useState('');
    const [promptSaveTimer, setPromptSaveTimer] = useState(null);
    const writingMode = getWritingMode();
    const defaultPrompt = getModeRolePrompt(writingMode);

    useEffect(() => {
        const settings = getProjectSettings();
        setCustomPrompt(settings.customPrompt || '');
    }, []);

    const handlePromptChange = (value) => {
        setCustomPrompt(value);
        // 500ms 防抖保存
        if (promptSaveTimer) clearTimeout(promptSaveTimer);
        const timer = setTimeout(() => {
            const settings = getProjectSettings();
            settings.customPrompt = value;
            saveProjectSettings(settings);
        }, 500);
        setPromptSaveTimer(timer);
    };

    const handleResetPrompt = () => {
        setCustomPrompt('');
        const settings = getProjectSettings();
        settings.customPrompt = '';
        saveProjectSettings(settings);
    };

    const layoutBtnStyle = (active) => ({
        flex: 1, padding: '10px 14px',
        border: active ? '2px solid var(--accent)' : '1px solid var(--border-light)',
        borderRadius: 'var(--radius-md)',
        background: active ? 'var(--accent-light)' : 'var(--bg-primary)',
        cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
        boxShadow: active ? '0 2px 8px var(--accent-glow)' : 'var(--shadow-sm)',
    });

    const [writingModeState, setWritingModeLocalState] = useState(getWritingMode());
    const { setWritingMode: setGlobalWritingMode } = useAppStore();

    return (
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
                {t('preferences.intro')}
            </p>

            {/* 写作模式选择器 */}
            <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>写作模式</label>
                <div style={{ display: 'flex', gap: 10 }}>
                    {Object.values(WRITING_MODES).map(m => (
                        <button
                            key={m.key}
                            className={`writing-mode-card ${writingModeState === m.key ? 'active' : ''}`}
                            style={{
                                border: writingModeState === m.key ? `2px solid ${m.color}` : '1px solid var(--border-light)',
                                background: writingModeState === m.key ? `${m.color}10` : 'var(--bg-primary)',
                            }}
                            onClick={() => { setWritingModeLocalState(m.key); setWritingMode(m.key); setGlobalWritingMode(m.key); }}
                        >
                            <div style={{ fontSize: 18, marginBottom: 4 }}>
                                {m.icon === 'smartphone' ? <Smartphone size={18} /> : m.icon === 'book-open' ? <BookOpen size={18} /> : m.icon === 'clapperboard' ? <Clapperboard size={18} /> : null}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: writingModeState === m.key ? m.color : 'var(--text-primary)', marginBottom: 2 }}>{m.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{m.desc}</div>
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>{t('preferences.langLabel')}</label>
                <div style={{ display: 'flex', gap: 12 }}>
                    {['zh', 'en', 'ru'].map(lang => (
                        <button
                            key={lang}
                            style={{
                                flex: 1, padding: '12px 16px', border: language === lang ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                                borderRadius: 'var(--radius-md)', background: language === lang ? 'var(--accent-light)' : 'var(--bg-primary)',
                                cursor: 'pointer', fontSize: 14, fontWeight: language === lang ? 600 : 400,
                                color: language === lang ? 'var(--accent)' : 'var(--text-primary)', transition: 'all 0.15s',
                                boxShadow: language === lang ? '0 2px 8px var(--accent-glow)' : 'var(--shadow-sm)'
                            }}
                            onClick={() => setLanguage(lang)}
                        >
                            {lang === 'zh' ? '🇨🇳 简体中文' : lang === 'en' ? '🇬🇧 English' : '🇷🇺 Русский'}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 12 }}>{t('preferences.themeLabel')}</label>
                <div style={{ display: 'flex', gap: 16 }}>
                    {[{ id: 'warm', label: t('preferences.themeWarm'), desc: t('preferences.themeWarmDesc') }, { id: 'modern', label: t('preferences.themeModern'), desc: t('preferences.themeModernDesc') }].map(theme => (
                        <button
                            key={theme.id}
                            style={{
                                flex: 1, padding: '20px 16px', border: visualTheme === theme.id ? '2px solid var(--accent)' : '1px solid var(--border-light)',
                                borderRadius: 'var(--radius-lg)', background: visualTheme === theme.id ? 'var(--accent-light)' : 'var(--bg-primary)',
                                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                                boxShadow: visualTheme === theme.id ? '0 6px 16px var(--accent-glow)' : 'var(--shadow-sm)'
                            }}
                            onMouseEnter={e => { if (visualTheme !== theme.id) e.currentTarget.style.transform = 'translateY(-2px)' }}
                            onMouseLeave={e => { if (visualTheme !== theme.id) e.currentTarget.style.transform = 'none' }}
                            onClick={() => {
                                setVisualTheme(theme.id);
                                document.documentElement.setAttribute('data-visual', theme.id);
                            }}
                        >
                            <div style={{ fontSize: 15, fontWeight: 600, color: visualTheme === theme.id ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 6 }}>
                                {theme.label}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{theme.desc}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 布局模式 */}
            <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 16 }}>{t('preferences.layoutLabel')}</label>

                {/* 左侧章节列表 */}
                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('preferences.sidebarLayoutLabel')}</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button style={layoutBtnStyle(!sidebarPushMode)} onClick={() => setSidebarPushMode(false)}>
                            <div style={{ fontSize: 13, fontWeight: !sidebarPushMode ? 600 : 400, color: !sidebarPushMode ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 3 }}>
                                {t('preferences.layoutOverlay')}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('preferences.layoutOverlayDesc')}</div>
                        </button>
                        <button style={layoutBtnStyle(sidebarPushMode)} onClick={() => setSidebarPushMode(true)}>
                            <div style={{ fontSize: 13, fontWeight: sidebarPushMode ? 600 : 400, color: sidebarPushMode ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 3 }}>
                                {t('preferences.layoutPush')}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('preferences.layoutPushDesc')}</div>
                        </button>
                    </div>
                </div>

                {/* 右侧 AI 助手 */}
                <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('preferences.aiSidebarLayoutLabel')}</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button style={layoutBtnStyle(!aiSidebarPushMode)} onClick={() => setAiSidebarPushMode(false)}>
                            <div style={{ fontSize: 13, fontWeight: !aiSidebarPushMode ? 600 : 400, color: !aiSidebarPushMode ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 3 }}>
                                {t('preferences.layoutOverlay')}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('preferences.layoutOverlayDesc')}</div>
                        </button>
                        <button style={layoutBtnStyle(aiSidebarPushMode)} onClick={() => setAiSidebarPushMode(true)}>
                            <div style={{ fontSize: 13, fontWeight: aiSidebarPushMode ? 600 : 400, color: aiSidebarPushMode ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 3 }}>
                                {t('preferences.layoutPush')}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('preferences.layoutPushDesc')}</div>
                        </button>
                    </div>
                </div>
            </div>

            {/* 自定义系统提示词 */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                        <Sparkles size={14} style={{ marginRight: 4 }} /> 自定义系统提示词
                    </label>
                    {customPrompt && (
                        <button
                            onClick={handleResetPrompt}
                            style={{
                                background: 'none', border: '1px solid var(--border-light)',
                                borderRadius: 'var(--radius-sm)', padding: '3px 10px',
                                cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                        >
                            ↩ 恢复默认
                        </button>
                    )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                    自定义 AI 的角色设定和写作风格。留空则使用内置默认提示词（基于当前写作模式）。
                </div>
                <textarea
                    value={customPrompt}
                    onChange={e => handlePromptChange(e.target.value)}
                    placeholder={defaultPrompt}
                    rows={8}
                    style={{
                        width: '100%', padding: '12px 14px',
                        background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                        fontSize: 13, lineHeight: 1.6, resize: 'vertical',
                        fontFamily: 'inherit', outline: 'none', transition: 'border 0.15s',
                        minHeight: 120, maxHeight: 400,
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border-light)'}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {customPrompt ? <><CheckCircle2 size={12} style={{ marginRight: 4, color: 'var(--success, #22c55e)' }} />使用自定义提示词</> : <><FileText size={12} style={{ marginRight: 4 }} />使用内置默认提示词</>}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {customPrompt.length} 字
                    </span>
                </div>
            </div>
        </div>
    );
}

function ApiConfigForm({ data, onChange }) {
    const update = (field, value) => onChange({ ...data, [field]: value });
    const [testStatus, setTestStatus] = useState(null);
    const [fetchedModels, setFetchedModels] = useState(null);
    const [fetchedEmbedModels, setFetchedEmbedModels] = useState(null);
    const [rebuildStatus, setRebuildStatus] = useState(null); // null | 'loading' | {done, total, failed}
    const [balanceInfo, setBalanceInfo] = useState(null); // null | 'loading' | { supported, balance, currency, ... } | { error }
    const [savedProfiles, setSavedProfiles] = useState([]);
    const [profileName, setProfileName] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [providerSearch, setProviderSearch] = useState('');
    const [showModelModal, setShowModelModal] = useState(false);
    const [modelSearch, setModelSearch] = useState('');
    const [showEmbedModelModal, setShowEmbedModelModal] = useState(false);
    const [embedModelSearch, setEmbedModelSearch] = useState('');
    const [embedProviderSearch, setEmbedProviderSearch] = useState('');
    const { t } = useI18n();

    // 根据 provider 和 apiFormat 获取正确的 baseUrl
    const getBaseUrl = (provider, apiFormat) => {
        const p = PROVIDERS.find(pr => pr.key === provider);
        if (!p) return '';
        if (apiFormat === 'anthropic' && p.anthropicBaseUrl) {
            return p.anthropicBaseUrl;
        }
        return p.baseUrl || '';
    };

    useEffect(() => {
        try {
            const saved = localStorage.getItem('author-api-profiles');
            if (saved) setSavedProfiles(JSON.parse(saved));
        } catch { /* ignore */ }
    }, []);

    const persistProfiles = (profiles) => {
        setSavedProfiles(profiles);
        localStorage.setItem('author-api-profiles', JSON.stringify(profiles));
        import('../lib/persistence').then(m => m.persistSet('author-api-profiles', profiles).catch(() => { }));
    };

    const handleSaveProfile = () => {
        const name = profileName.trim();
        if (!name) return;
        const profile = { id: Date.now().toString(36), name, config: { ...data }, createdAt: new Date().toLocaleString('zh-CN') };
        const updated = savedProfiles.filter(p => p.name !== name);
        updated.unshift(profile);
        persistProfiles(updated);
        setProfileName('');
        setShowSaveInput(false);
    };

    const handleLoadProfile = (profile) => { onChange({ ...profile.config }); setTestStatus(null); setFetchedModels(null); };
    const handleDeleteProfile = (id) => { persistProfiles(savedProfiles.filter(p => p.id !== id)); };

    const handleProviderChange = (providerKey) => {
        const provider = PROVIDERS.find(p => p.key === providerKey);
        if (!provider) return;

        // 1. 保存当前供应商配置到 providerConfigs
        const configs = { ...(data.providerConfigs || {}) };
        if (data.provider) {
            configs[data.provider] = {
                apiKey: data.apiKey || '',
                baseUrl: data.baseUrl || '',
                model: data.model || '',
                apiFormat: data.apiFormat || '',
                models: data.providerConfigs?.[data.provider]?.models || (data.model ? [data.model] : []),
            };
        }

        // 2. 从 providerConfigs 加载目标供应商已保存的配置
        const saved = configs[providerKey] || {};
        const defaultFormat = provider.defaultFormat || 'openai';
        const isCustom = ['custom', 'custom-gemini', 'custom-claude'].includes(providerKey);

        const newConfig = {
            ...data,
            providerConfigs: configs,
            provider: providerKey,
            apiKey: saved.apiKey || '',
            baseUrl: isCustom ? (saved.baseUrl || '') : (saved.baseUrl || getBaseUrl(providerKey, provider.supportedFormats ? defaultFormat : undefined)),
            model: saved.model || (isCustom ? '' : (provider.models[0] || '')),
        };

        // 设置 apiFormat
        if (provider.supportedFormats) {
            newConfig.apiFormat = saved.apiFormat || defaultFormat;
        } else if (provider.apiFormat) {
            newConfig.apiFormat = provider.apiFormat;
        } else {
            delete newConfig.apiFormat;
        }

        onChange(newConfig);
        setTestStatus(null);
        setFetchedModels(null);
        setFetchedEmbedModels(null);
        setBalanceInfo(null);
    };

    // 切换 apiFormat 时自动更新 baseUrl
    const handleApiFormatChange = (format) => {
        const newBaseUrl = getBaseUrl(data.provider, format);
        onChange({ ...data, apiFormat: format, baseUrl: newBaseUrl });
    };

    const handleTestConnection = async () => {
        setTestStatus('loading');
        try {
            const res = await fetch('/api/ai/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiConfig: data }) });
            setTestStatus(await res.json());
        } catch { setTestStatus({ success: false, error: t('apiConfig.networkError') }); }
    };

    const handleFetchModels = async () => {
        setFetchedModels('loading');
        try {
            const res = await fetch('/api/ai/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: data.apiKey, baseUrl: data.baseUrl, provider: data.provider, proxyUrl: data.proxyUrl }) });
            const result = await res.json();
            if (result.error) { setFetchedModels(null); setTestStatus({ success: false, error: result.error }); }
            else { setFetchedModels(result.models || []); setShowModelModal(true); setModelSearch(''); }
        } catch { setFetchedModels(null); setTestStatus({ success: false, error: t('apiConfig.fetchModelsFailed') }); }
    };

    const handleFetchEmbedModels = async () => {
        setFetchedEmbedModels('loading');
        try {
            const embedKey = data.embedApiKey || data.apiKey;
            const embedBase = data.embedBaseUrl || data.baseUrl;
            const res = await fetch('/api/ai/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: embedKey, baseUrl: embedBase, provider: data.embedProvider, embedOnly: true, proxyUrl: data.proxyUrl }) });
            const result = await res.json();
            if (result.error) { setFetchedEmbedModels(null); setTestStatus({ success: false, error: t('apiConfig.embedApiPrefix') + result.error }); }
            else { setFetchedEmbedModels(result.models || []); }
        } catch { setFetchedEmbedModels(null); setTestStatus({ success: false, error: t('apiConfig.fetchEmbedModelsFailed') }); }
    };

    const handleRebuildEmbeddings = async () => {
        setRebuildStatus({ done: 0, total: 0, failed: 0 });
        try {
            const result = await rebuildAllEmbeddings((done, total, failed) => {
                setRebuildStatus({ done, total, failed });
            });
            setRebuildStatus({ ...result, finished: true });
            setTimeout(() => setRebuildStatus(null), 5000);
        } catch {
            setRebuildStatus({ error: true });
            setTimeout(() => setRebuildStatus(null), 3000);
        }
    };

    const currentProvider = PROVIDERS.find(p => p.key === data.provider) || PROVIDERS[7];
    const isCustom = ['custom', 'custom-gemini', 'custom-claude'].includes(data.provider);

    // 嵌入模型供应商
    const EMBED_EXCLUDED = ['deepseek', 'moonshot', 'siliconflow', 'openai-responses', 'openrouter', 'groq', 'mistral', 'cohere', 'together', 'perplexity', 'xai', 'cerebras', 'github', 'stepfun', 'volcengine', 'minimax', 'yi', 'baidu'];
    const currentEmbedProvider = PROVIDERS.find(p => p.key === data.embedProvider) || PROVIDERS.find(p => p.key === 'zhipu') || PROVIDERS[0];
    const isEmbedCustom = ['custom', 'custom-gemini', 'custom-claude'].includes(data.embedProvider);
    const handleEmbedProviderChange = (providerKey) => {
        const provider = PROVIDERS.find(p => p.key === providerKey);
        if (!provider) return;

        // 1. 保存当前嵌入供应商配置到 embedProviderConfigs
        const configs = { ...(data.embedProviderConfigs || {}) };
        if (data.embedProvider) {
            configs[data.embedProvider] = {
                apiKey: data.embedApiKey || '',
                baseUrl: data.embedBaseUrl || '',
                model: data.embedModel || '',
            };
        }

        // 2. 从 embedProviderConfigs 加载目标供应商已保存的配置
        const saved = configs[providerKey] || {};
        const isCustom = ['custom', 'custom-gemini', 'custom-claude'].includes(providerKey);

        onChange({
            ...data,
            embedProviderConfigs: configs,
            embedProvider: providerKey,
            embedApiKey: saved.apiKey || '',
            embedBaseUrl: isCustom ? (saved.baseUrl || '') : (saved.baseUrl || provider.baseUrl || ''),
            embedModel: saved.model || (isCustom ? '' : (providerKey === 'zhipu' ? 'embedding-3' : 'text-embedding-v3-small')),
        });
        setFetchedEmbedModels(null);
    };

    // 余额查询
    const handleQueryBalance = async () => {
        setBalanceInfo('loading');
        try {
            const res = await fetch('/api/balance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: data.provider, apiKey: data.apiKey, baseUrl: data.baseUrl, proxyUrl: data.proxyUrl }),
            });
            const result = await res.json();
            if (res.ok) {
                setBalanceInfo(result);
            } else {
                setBalanceInfo({ error: result.error || '查询失败' });
            }
        } catch (e) {
            setBalanceInfo({ error: e.message || '网络错误' });
        }
    };

    return (
        <div>
            {savedProfiles.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('apiConfig.savedProfiles')}</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {savedProfiles.map(p => (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', fontSize: 12 }}>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 500, fontSize: 12, padding: 0 }} onClick={() => handleLoadProfile(p)} title={`${p.config.provider} | ${p.config.model}`}>{p.name}</button>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: '0 2px', lineHeight: 1 }} onClick={() => handleDeleteProfile(p.id)} title={t('apiConfig.deleteProfile')}><X size={10} /></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{t('apiConfig.intro')}</p>

            {/* ===== 供应商左右分栏 ===== */}
            <div className="provider-split">
                {/* 左侧：供应商列表 */}
                <div className="provider-list">
                    <input
                        className="provider-search"
                        placeholder="搜索供应商..."
                        value={providerSearch}
                        onChange={e => setProviderSearch(e.target.value)}
                    />
                    {[
                        { group: '🇨🇳 国内', keys: ['zhipu', 'deepseek', 'bailian', 'volcengine', 'moonshot', 'stepfun', 'yi', 'baichuan', 'hunyuan', 'baidu', 'minimax', 'siliconflow'] },
                        { group: '国际', keys: ['openai', 'claude', 'gemini', 'gemini-native', 'openai-responses', 'groq', 'mistral', 'cohere', 'together', 'perplexity', 'xai', 'cerebras', 'github'] },
                        { group: '聚合', keys: ['openrouter'] },
                        { group: '自定义', keys: ['custom', 'custom-gemini', 'custom-claude'] },
                    ].map(section => {
                        const items = section.keys
                            .map(k => PROVIDERS.find(p => p.key === k))
                            .filter(Boolean)
                            .filter(p => !providerSearch || p.label.toLowerCase().includes(providerSearch.toLowerCase()) || p.key.includes(providerSearch.toLowerCase()));
                        if (items.length === 0) return null;
                        return (
                            <div key={section.group}>
                                <div className="provider-group-header">{section.group}</div>
                                {items.map(p => {
                                    const hasKey = !!(data.providerConfigs?.[p.key]?.apiKey || (data.provider === p.key && data.apiKey));
                                    return (
                                        <button
                                            key={p.key}
                                            className={`provider-item ${data.provider === p.key ? 'active' : ''}`}
                                            onClick={() => handleProviderChange(p.key)}
                                        >
                                            <span className="provider-item-name">{p.label}</span>
                                            {hasKey && <span className="provider-item-check"><CheckCircle2 size={12} /></span>}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>

                {/* 右侧：选中供应商的配置 */}
                <div className="provider-detail">
                    <div className="provider-detail-header">
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{currentProvider.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{currentProvider.key}</span>
                    </div>

                    {/* 供应商特定提示 */}
                    {data.provider === 'gemini-native' && (
                        <div className="provider-hint">{t('apiConfig.geminiNativeHint')}</div>
                    )}
                    {data.provider === 'volcengine' && (
                        <div className="provider-hint">火山引擎需要先在控制台创建「推理接入点」，然后将 endpoint_id（如 ep-xxxx）填入模型字段。支持豆包系列模型。</div>
                    )}
                    {data.provider === 'bailian' && (
                        <div className="provider-hint">阿里云百炼平台 API Key 在「模型服务灵积」控制台获取，支持通义千问系列模型。</div>
                    )}
                    {data.provider === 'minimax' && (
                        <div className="provider-hint">MiniMax API Key 在开放平台获取，支持 abab 系列和 MiniMax-Text 系列模型。</div>
                    )}

                    {/* API 格式选择（多格式供应商） */}
                    {(data.provider === 'bailian' || data.provider === 'minimax') && (
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>API 格式</label>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {[
                                    { key: 'openai', label: 'OpenAI 兼容' },
                                    { key: 'anthropic', label: 'Anthropic 兼容' },
                                ].map(opt => (
                                    <button key={opt.key} style={{ padding: '5px 12px', border: (data.apiFormat || 'openai') === opt.key ? '2px solid var(--accent)' : '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: (data.apiFormat || 'openai') === opt.key ? 'var(--accent-light)' : 'var(--bg-primary)', cursor: 'pointer', fontSize: 11, fontWeight: (data.apiFormat || 'openai') === opt.key ? 600 : 400, color: (data.apiFormat || 'openai') === opt.key ? 'var(--accent)' : 'var(--text-primary)', transition: 'all 0.15s' }} onClick={() => handleApiFormatChange(opt.key)}>{opt.label}</button>
                                ))}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>Anthropic 格式可解锁 Claude 代码复用，OpenAI 格式兼容性更广</div>
                        </div>
                    )}

                    {/* API Key */}
                    <FieldInput label="API Key" value={data.apiKey} onChange={v => update('apiKey', v)} placeholder={t('apiConfig.apiKeyPlaceholder')} secret />
                    {data.apiKey && <div style={{ fontSize: 11, color: 'var(--success)', marginTop: -10, marginBottom: 10 }}>{t('apiConfig.apiKeyConfigured')}</div>}

                    {/* 余额查询 */}
                    {data.apiKey && (
                        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}><Coins size={13} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />{t('apiConfig.balance') || 'API 余额'}</span>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '3px 10px' }} onClick={handleQueryBalance} disabled={balanceInfo === 'loading'}>
                                    {balanceInfo === 'loading' ? (t('apiConfig.balanceQuerying') || '查询中...') : (t('apiConfig.balanceQuery') || '查询余额')}
                                </button>
                            </div>
                            {balanceInfo && balanceInfo !== 'loading' && (
                                <div style={{ marginTop: 8 }}>
                                    {balanceInfo.error ? (
                                        <div style={{ fontSize: 12, color: 'var(--error)' }}><XCircle size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />{balanceInfo.error}</div>
                                    ) : !balanceInfo.supported ? (
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}><AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />{t('apiConfig.balanceNotSupported') || '该供应商暂不支持余额查询'}</div>
                                    ) : (
                                        <div>
                                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                                                {balanceInfo.currency} {typeof balanceInfo.balance === 'number' ? balanceInfo.balance.toFixed(2) : balanceInfo.balance}
                                            </div>
                                            {balanceInfo.details && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{balanceInfo.details}</div>}
                                            {balanceInfo.source && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>via {balanceInfo.source}</div>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* API 地址 */}
                    <FieldInput label={isCustom ? t('apiConfig.apiAddress') : t('apiConfig.apiAddressAuto')} value={data.baseUrl} onChange={v => update('baseUrl', v)} placeholder={data.provider === 'custom-gemini' ? 'https://generativelanguage.googleapis.com/v1beta' : data.provider === 'custom-claude' ? 'https://api.anthropic.com' : t('apiConfig.apiAddressPlaceholder')} />

                    {/* 代理地址 */}
                    <FieldInput label={<><Globe size={13} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />代理地址（可选）</>} value={data.proxyUrl || ''} onChange={v => update('proxyUrl', v)} placeholder="http://127.0.0.1:7890" />
                    {/* 模型选择 — 统一用弹窗管理，内联只显示当前模型 + 获取按钮 */}
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>
                            {t('apiConfig.model')}
                        </label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input className="modal-input" style={{ marginBottom: 0, flex: 1 }} value={data.model || ''} onChange={e => update('model', e.target.value)} placeholder={isCustom ? (data.provider === 'custom-gemini' ? '例如：gemini-2.0-flash' : data.provider === 'custom-claude' ? '例如：claude-sonnet-4-20250514' : '例如：gpt-4o-mini') : '选择或输入模型名称'} />
                            {(isCustom ? (data.apiKey && data.baseUrl) : data.apiKey) && (
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => { if (Array.isArray(fetchedModels) && fetchedModels.length > 0) { setShowModelModal(true); setModelSearch(''); } else { handleFetchModels(); } }} disabled={fetchedModels === 'loading'}>
                                    {fetchedModels === 'loading' ? '获取中…' : Array.isArray(fetchedModels) && fetchedModels.length > 0 ? `模型列表 (${fetchedModels.length})` : '获取模型列表'}
                                </button>
                            )}
                        </div>
                        {/* 快切列表管理 */}
                        {data.model && (() => {
                            const savedModels = data.providerConfigs?.[data.provider]?.models || [];
                            const isInList = savedModels.includes(data.model);
                            return (
                                <button style={{ marginTop: 6, padding: '4px 12px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: isInList ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--bg-primary)', cursor: 'pointer', fontSize: 11, color: isInList ? 'var(--accent)' : 'var(--text-secondary)' }} onClick={() => {
                                    const configs = { ...(data.providerConfigs || {}) };
                                    if (!configs[data.provider]) configs[data.provider] = {};
                                    const models = [...(configs[data.provider].models || [])];
                                    if (isInList) {
                                        configs[data.provider] = { ...configs[data.provider], models: models.filter(x => x !== data.model) };
                                    } else {
                                        models.push(data.model);
                                        configs[data.provider] = { ...configs[data.provider], models };
                                    }
                                    onChange({ ...data, providerConfigs: configs });
                                }}>{isInList ? '☑ 已在快切列表' : '☐ 加入快切列表'}</button>
                            );
                        })()}
                    </div>

                    {/* ===== 获取模型弹窗 ===== */}
                    {showModelModal && Array.isArray(fetchedModels) && (
                        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }} onClick={e => { if (e.target === e.currentTarget) setShowModelModal(false); }}>
                            <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg, 14px)', boxShadow: '0 16px 48px rgba(0,0,0,0.25)', width: 480, maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'modelPickerFadeInDown 0.2s ease' }}>
                                {/* 弹窗头 */}
                                <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>可用模型列表</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{currentProvider.label} · 共 {fetchedModels.length} 个模型，勾选加入快切列表</div>
                                    </div>
                                    <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', lineHeight: 1 }} onClick={() => setShowModelModal(false)}><X size={16} /></button>
                                </div>
                                {/* 搜索框 */}
                                <div style={{ padding: '10px 20px 8px' }}>
                                    <input
                                        style={{ width: '100%', padding: '7px 12px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                                        placeholder="搜索模型名称…"
                                        value={modelSearch}
                                        onChange={e => setModelSearch(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                {/* 模型列表 */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
                                    {fetchedModels
                                        .filter(m => !modelSearch || m.id.toLowerCase().includes(modelSearch.toLowerCase()))
                                        .map(m => {
                                            const savedModels = data.providerConfigs?.[data.provider]?.models || [];
                                            const isInList = savedModels.includes(m.id);
                                            const isActive = data.model === m.id;
                                            return (
                                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer', transition: 'background 0.1s', background: isActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-secondary)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = isActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent'}
                                                >
                                                    {/* 勾选框 */}
                                                    <button style={{ width: 22, height: 22, border: isInList ? '2px solid var(--accent)' : '2px solid var(--border-light)', borderRadius: 4, background: isInList ? 'var(--accent)' : 'transparent', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }} onClick={() => {
                                                        const configs = { ...(data.providerConfigs || {}) };
                                                        if (!configs[data.provider]) configs[data.provider] = {};
                                                        const models = [...(configs[data.provider].models || [])];
                                                        if (isInList) {
                                                            configs[data.provider] = { ...configs[data.provider], models: models.filter(x => x !== m.id) };
                                                        } else {
                                                            models.push(m.id);
                                                            configs[data.provider] = { ...configs[data.provider], models };
                                                        }
                                                        onChange({ ...data, providerConfigs: configs });
                                                    }}>{isInList ? '✓' : ''}</button>
                                                    {/* 模型名 */}
                                                    <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: isActive ? 'var(--accent)' : 'var(--text-primary)', fontWeight: isActive ? 600 : 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => { update('model', m.id); }} title={`使用 ${m.id}`}>{m.id}</span>
                                                    {isActive && <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>当前</span>}
                                                </div>
                                            );
                                        })}
                                </div>
                                {/* 底部 */}
                                <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>已勾选 {(data.providerConfigs?.[data.provider]?.models || []).length} 个模型</span>
                                    <button style={{ padding: '6px 20px', borderRadius: 'var(--radius-sm, 6px)', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} onClick={() => setShowModelModal(false)}>完成</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 连接测试 */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                        <button className="btn btn-ghost btn-sm" onClick={handleTestConnection} disabled={testStatus === 'loading'} style={{ fontSize: 12 }}>
                            {testStatus === 'loading' ? '测试中...' : <><Plug size={12} style={{ marginRight: 4 }} />测试连接</>}
                        </button>
                        {testStatus && testStatus !== 'loading' && (
                            <span style={{ fontSize: 12, color: testStatus.success ? 'var(--success)' : 'var(--error)', alignSelf: 'center' }}>
                                {testStatus.success ? <><CheckCircle2 size={12} style={{ marginRight: 4 }} />连接成功</> : <><XCircle size={12} style={{ marginRight: 4 }} />{testStatus.error || '连接失败'}</>}
                            </span>
                        )}
                    </div>

                    {/* 搜索工具配置 */}
                    <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}><Search size={13} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />{t('apiConfig.searchTools') || '联网搜索'}</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', marginBottom: 4 }}>
                            <input type="checkbox" checked={data.tools?.searchEnabled || false} onChange={e => onChange({ ...data, tools: { ...(data.tools || {}), searchEnabled: e.target.checked } })} style={{ margin: 0 }} />
                            {t('apiConfig.enableSearch') || '启用联网搜索'}
                        </label>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, paddingLeft: 22 }}>
                            {t('apiConfig.enableSearchDesc') || '让 AI 搜索互联网获取最新信息，搜索来源会显示在回复中'}
                        </div>
                        {data.tools?.searchEnabled && ['openai', 'openai-responses', 'custom', 'custom-gemini'].includes(data.provider) && (
                            <div style={{ paddingLeft: 22, marginBottom: 6 }}>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {[
                                        { key: 'builtin', label: t('apiConfig.searchBuiltin') || '内置搜索' },
                                        { key: 'external', label: t('apiConfig.searchExternal') || '外部搜索' },
                                    ].map(opt => (
                                        <button key={opt.key} style={{ padding: '4px 10px', border: (data.tools?.searchMode || 'builtin') === opt.key ? '2px solid var(--accent)' : '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: (data.tools?.searchMode || 'builtin') === opt.key ? 'var(--accent-light)' : 'var(--bg-primary)', cursor: 'pointer', fontSize: 11, fontWeight: (data.tools?.searchMode || 'builtin') === opt.key ? 600 : 400, color: (data.tools?.searchMode || 'builtin') === opt.key ? 'var(--accent)' : 'var(--text-primary)', transition: 'all 0.15s' }} onClick={() => onChange({ ...data, tools: { ...(data.tools || {}), searchMode: opt.key } })}>{opt.label}</button>
                                    ))}
                                </div>
                                {['custom', 'custom-gemini'].includes(data.provider)
                                    ? <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>自定义供应商仅支持 Function Calling (外部搜索) 方式</div>
                                    : <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{t('apiConfig.searchModeHint') || '内置搜索速度更快，外部搜索可自定义来源'}</div>
                                }
                            </div>
                        )}
                        {data.tools?.searchEnabled && (
                            (data.tools?.searchMode === 'external' || !['openai', 'openai-responses', 'custom', 'custom-gemini', 'gemini-native'].includes(data.provider)) && (
                                <div style={{ paddingLeft: 22, marginTop: 6 }}>
                                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 3 }}>{t('apiConfig.searchTool') || '搜索工具'}</div>
                                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                        {[
                                            { key: 'tavily', label: 'Tavily' },
                                            { key: 'exa', label: 'Exa' },
                                        ].map(opt => (
                                            <button key={opt.key} style={{ padding: '4px 10px', border: (data.searchConfig?.tool || 'tavily') === opt.key ? '2px solid var(--accent)' : '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: (data.searchConfig?.tool || 'tavily') === opt.key ? 'var(--accent-light)' : 'var(--bg-primary)', cursor: 'pointer', fontSize: 11, fontWeight: (data.searchConfig?.tool || 'tavily') === opt.key ? 600 : 400, color: (data.searchConfig?.tool || 'tavily') === opt.key ? 'var(--accent)' : 'var(--text-primary)', transition: 'all 0.15s' }} onClick={() => onChange({ ...data, searchConfig: { ...(data.searchConfig || {}), tool: opt.key } })}>{opt.label}</button>
                                        ))}
                                    </div>
                                    <FieldInput label={`${(data.searchConfig?.tool || 'Tavily').charAt(0).toUpperCase() + (data.searchConfig?.tool || 'tavily').slice(1)} API Key`} value={data.searchConfig?.apiKey || ''} onChange={v => onChange({ ...data, searchConfig: { ...(data.searchConfig || {}), apiKey: v } })} placeholder={`填入 ${data.searchConfig?.tool || 'Tavily'} API Key`} secret />
                                    {!data.searchConfig?.apiKey && (
                                        <div style={{ fontSize: 11, color: 'var(--error)', marginTop: -8, marginBottom: 6, paddingLeft: 2 }}>
                                            <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />当前供应商需要外部搜索 API Key 才能使用联网搜索（<a href={data.searchConfig?.tool === 'exa' ? 'https://exa.ai' : 'https://tavily.com'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>点此获取</a>）
                                        </div>
                                    )}
                                </div>
                            )
                        )}
                        {['gemini-native', 'custom-gemini'].includes(data.provider) && (
                            <>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', marginTop: 8 }}>
                                    <input type="checkbox" checked={data.tools?.codeExecution || false} onChange={e => onChange({ ...data, tools: { ...(data.tools || {}), codeExecution: e.target.checked } })} style={{ margin: 0 }} />
                                    <Monitor size={13} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />{t('apiConfig.toolCodeExecution') || 'Code Execution（代码执行）'}
                                </label>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, paddingLeft: 22 }}>{t('apiConfig.toolCodeExecutionDesc') || '让 AI 编写并运行代码来解决数学计算等问题，回复中会显示代码和执行结果'}</div>
                            </>
                        )}
                    </div>

                    {/* Reasoning Effort for OpenAI Responses */}
                    {data.provider === 'openai-responses' && (
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>思考等级 (Reasoning Effort)</label>
                            <div style={{ display: 'flex', gap: 6 }}>
                                {[
                                    { key: 'none', label: '关闭' },
                                    { key: 'low', label: 'low' },
                                    { key: 'medium', label: 'medium' },
                                    { key: 'high', label: 'high' },
                                    { key: 'xhigh', label: 'xhigh' },
                                ].map(opt => (
                                    <button key={opt.key} style={{ padding: '5px 14px', border: (data.reasoningEffort || 'medium') === opt.key ? '2px solid var(--accent)' : '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: (data.reasoningEffort || 'medium') === opt.key ? 'var(--accent-light)' : 'var(--bg-primary)', cursor: 'pointer', fontSize: 12, fontWeight: (data.reasoningEffort || 'medium') === opt.key ? 600 : 400, color: (data.reasoningEffort || 'medium') === opt.key ? 'var(--accent)' : 'var(--text-primary)', transition: 'all 0.15s' }} onClick={() => update('reasoningEffort', opt.key)}>{opt.label}</button>
                                ))}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>控制模型推理深度，“关闭”禁用思维链，默认 Medium，XHigh 质量最高但更慢</div>
                        </div>
                    )}
                </div>
            </div>

            {/* 高级模型参数 */}
            <div style={{ marginTop: 24, marginBottom: 14, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    <input
                        type="checkbox"
                        checked={data.useAdvancedParams || false}
                        onChange={e => update('useAdvancedParams', e.target.checked)}
                        style={{ margin: 0 }}
                    />
                    {t('apiConfig.advancedParamsTitle')}
                </label>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, paddingLeft: 22 }}>
                    {t('apiConfig.advancedParamsDesc')}
                </div>
            </div>

            {data.useAdvancedParams && (
                <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
                    {/* Temperature */}
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>
                            {t('apiConfig.temperature')}
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="range" min="0" max="2" step="0.05" value={data.temperature ?? 1} onChange={e => update('temperature', parseFloat(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} />
                            <input type="number" min="0" max="2" step="0.05" className="modal-input" style={{ width: 72, margin: 0, padding: '5px 8px', fontSize: 13, textAlign: 'center' }} value={data.temperature ?? 1} onChange={e => update('temperature', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('apiConfig.temperatureDesc')}</div>
                    </div>

                    {/* Top P */}
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>{t('apiConfig.topP')}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="range" min="0" max="1" step="0.05" value={data.topP ?? 0.95} onChange={e => update('topP', parseFloat(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} />
                            <input type="number" min="0" max="1" step="0.05" className="modal-input" style={{ width: 72, margin: 0, padding: '5px 8px', fontSize: 13, textAlign: 'center' }} value={data.topP ?? 0.95} onChange={e => update('topP', parseFloat(e.target.value) || 0)} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('apiConfig.topPDesc')}</div>
                    </div>

                    {/* 最大上下文长度 */}
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>{t('apiConfig.maxContextLength')}</label>
                        <input type="number" min="1024" step="1024" className="modal-input" style={{ margin: 0, width: 160, padding: '5px 8px', fontSize: 13 }} value={data.maxContextLength ?? 200000} onChange={e => update('maxContextLength', parseInt(e.target.value) || 4096)} />
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('apiConfig.maxContextLengthDesc')}</div>
                    </div>

                    {/* 最大输出 Token */}
                    {data.provider !== 'openai-responses' && (
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>{t('apiConfig.maxOutputTokens')}</label>
                            <input type="number" min="256" step="256" className="modal-input" style={{ margin: 0, width: 160, padding: '5px 8px', fontSize: 13 }} value={data.maxOutputTokens ?? 65536} onChange={e => update('maxOutputTokens', parseInt(e.target.value) || 4096)} />
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('apiConfig.maxOutputTokensDesc')}</div>
                        </div>
                    )}

                    {/* 思考层级 */}
                    {data.provider !== 'openai-responses' && (
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>{t('apiConfig.reasoningEffort')}</label>
                            <select className="modal-input" style={{ margin: 0, width: 160, padding: '5px 8px', fontSize: 13 }} value={data.reasoningEffort || 'auto'} onChange={e => update('reasoningEffort', e.target.value)}>
                                <option value="auto">{t('apiConfig.reasoningAuto')}</option>
                                <option value="none">{t('apiConfig.reasoningNone') || '关闭思考'}</option>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t('apiConfig.reasoningEffortDesc')}</div>
                        </div>
                    )}
                </div>
            )}

            {/* 独立 Embedding 配置 */}
            <div style={{ marginTop: 24, marginBottom: 14, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    <input type="checkbox" checked={data.useCustomEmbed || false} onChange={e => update('useCustomEmbed', e.target.checked)} style={{ margin: 0 }} />
                    {t('apiConfig.embedTitle')}
                </label>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, paddingLeft: 22 }}>{t('apiConfig.embedDesc')}</div>
            </div>

            {data.useCustomEmbed && (
                <div className="provider-split" style={{ marginBottom: 20 }}>
                    {/* 左侧：嵌入供应商列表 */}
                    <div className="provider-list">
                        <input
                            className="provider-search"
                            placeholder="搜索供应商..."
                            value={embedProviderSearch}
                            onChange={e => setEmbedProviderSearch(e.target.value)}
                        />
                        {[
                            { group: '🇨🇳 国内', keys: ['zhipu', 'bailian', 'hunyuan', 'baichuan', 'siliconflow'] },
                            { group: '国际', keys: ['openai', 'claude', 'gemini', 'gemini-native'] },
                            { group: '自定义', keys: ['custom', 'custom-gemini', 'custom-claude'] },
                        ].map(section => {
                            const items = section.keys
                                .map(k => PROVIDERS.find(p => p.key === k))
                                .filter(Boolean)
                                .filter(p => !EMBED_EXCLUDED.includes(p.key))
                                .filter(p => !embedProviderSearch || p.label.toLowerCase().includes(embedProviderSearch.toLowerCase()) || p.key.includes(embedProviderSearch.toLowerCase()));
                            if (items.length === 0) return null;
                            return (
                                <div key={section.group}>
                                    <div className="provider-group-header">{section.group}</div>
                                    {items.map(p => {
                                        const embedCfg = data.embedProviderConfigs?.[p.key];
                                        const hasKey = !!(embedCfg?.apiKey || (data.embedProvider === p.key && (data.embedApiKey || data.apiKey)));
                                        return (
                                            <button
                                                key={p.key}
                                                className={`provider-item ${data.embedProvider === p.key ? 'active' : ''}`}
                                                onClick={() => handleEmbedProviderChange(p.key)}
                                            >
                                                <span className="provider-item-name">{p.label}</span>
                                                {hasKey && <span className="provider-item-check"><CheckCircle2 size={12} /></span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>

                    {/* 右侧：嵌入供应商配置 */}
                    <div className="provider-detail">
                        <div className="provider-detail-header">
                            <span style={{ fontSize: 15, fontWeight: 600 }}>{currentEmbedProvider.label}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{currentEmbedProvider.key}</span>
                        </div>

                        <FieldInput label="Embedding API Key" value={data.embedApiKey} onChange={v => update('embedApiKey', v)} placeholder={t('apiConfig.embedApiKeyPlaceholder')} secret />
                        <FieldInput label={isEmbedCustom ? t('apiConfig.embedApiAddress') : t('apiConfig.embedApiAddressAuto')} value={data.embedBaseUrl} onChange={v => update('embedBaseUrl', v)} placeholder="https://api.example.com/v1" />

                        {/* 模型选择 */}
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>
                                {t('apiConfig.embedModel')}
                            </label>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input className="modal-input" style={{ marginBottom: 0, flex: 1 }} value={data.embedModel || ''} onChange={e => update('embedModel', e.target.value)} placeholder="例如：text-embedding-v3-small" />
                                {(data.embedApiKey || data.apiKey) ? (
                                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => { if (Array.isArray(fetchedEmbedModels) && fetchedEmbedModels.length > 0) { setShowEmbedModelModal(true); setEmbedModelSearch(''); } else { handleFetchEmbedModels(); } }} disabled={fetchedEmbedModels === 'loading'}>
                                        {fetchedEmbedModels === 'loading' ? '获取中…' : Array.isArray(fetchedEmbedModels) && fetchedEmbedModels.length > 0 ? `模型列表 (${fetchedEmbedModels.length})` : '获取模型列表'}
                                    </button>
                                ) : null}
                            </div>
                            {/* 快切列表管理 */}
                            {data.embedModel && (() => {
                                const savedModels = data.embedProviderConfigs?.[data.embedProvider]?.models || [];
                                const isInList = savedModels.includes(data.embedModel);
                                return (
                                    <button style={{ marginTop: 6, padding: '4px 12px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: isInList ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--bg-primary)', cursor: 'pointer', fontSize: 11, color: isInList ? 'var(--accent)' : 'var(--text-secondary)' }} onClick={() => {
                                        const configs = { ...(data.embedProviderConfigs || {}) };
                                        if (!configs[data.embedProvider]) configs[data.embedProvider] = {};
                                        const models = [...(configs[data.embedProvider].models || [])];
                                        if (isInList) {
                                            configs[data.embedProvider] = { ...configs[data.embedProvider], models: models.filter(x => x !== data.embedModel) };
                                        } else {
                                            models.push(data.embedModel);
                                            configs[data.embedProvider] = { ...configs[data.embedProvider], models };
                                        }
                                        onChange({ ...data, embedProviderConfigs: configs });
                                    }}>{isInList ? '☑ 已在快切列表' : '☐ 加入快切列表'}</button>
                                );
                            })()}
                            {Array.isArray(fetchedEmbedModels) && fetchedEmbedModels.length === 0 && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 4px' }}>未找到嵌入模型，可手动输入模型名（如 embedding-3）</div>
                            )}
                        </div>

                        {/* ===== 嵌入模型弹窗（与主模型一致，带勾选框） ===== */}
                        {showEmbedModelModal && Array.isArray(fetchedEmbedModels) && (
                            <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }} onClick={e => { if (e.target === e.currentTarget) setShowEmbedModelModal(false); }}>
                                <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg, 14px)', boxShadow: '0 16px 48px rgba(0,0,0,0.25)', width: 480, maxWidth: '90vw', maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'modelPickerFadeInDown 0.2s ease' }}>
                                    <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>可用嵌入模型列表</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{currentEmbedProvider.label} · 共 {fetchedEmbedModels.length} 个模型，勾选加入快切列表</div>
                                        </div>
                                        <button style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px', lineHeight: 1 }} onClick={() => setShowEmbedModelModal(false)}><X size={16} /></button>
                                    </div>
                                    <div style={{ padding: '10px 20px 8px' }}>
                                        <input
                                            style={{ width: '100%', padding: '7px 12px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm, 6px)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                                            placeholder="搜索模型名称…"
                                            value={embedModelSearch}
                                            onChange={e => setEmbedModelSearch(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
                                        {fetchedEmbedModels
                                            .filter(m => !embedModelSearch || m.id.toLowerCase().includes(embedModelSearch.toLowerCase()))
                                            .map(m => {
                                                const savedModels = data.embedProviderConfigs?.[data.embedProvider]?.models || [];
                                                const isInList = savedModels.includes(m.id);
                                                const isActive = data.embedModel === m.id;
                                                return (
                                                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 'var(--radius-sm, 6px)', cursor: 'pointer', transition: 'background 0.1s', background: isActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-secondary)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = isActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent'}
                                                    >
                                                        {/* 勾选框 */}
                                                        <button style={{ width: 22, height: 22, border: isInList ? '2px solid var(--accent)' : '2px solid var(--border-light)', borderRadius: 4, background: isInList ? 'var(--accent)' : 'transparent', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }} onClick={() => {
                                                            const configs = { ...(data.embedProviderConfigs || {}) };
                                                            if (!configs[data.embedProvider]) configs[data.embedProvider] = {};
                                                            const models = [...(configs[data.embedProvider].models || [])];
                                                            if (isInList) {
                                                                configs[data.embedProvider] = { ...configs[data.embedProvider], models: models.filter(x => x !== m.id) };
                                                            } else {
                                                                models.push(m.id);
                                                                configs[data.embedProvider] = { ...configs[data.embedProvider], models };
                                                            }
                                                            onChange({ ...data, embedProviderConfigs: configs });
                                                        }}>{isInList ? '✓' : ''}</button>
                                                        {/* 模型名 */}
                                                        <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: isActive ? 'var(--accent)' : 'var(--text-primary)', fontWeight: isActive ? 600 : 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => { update('embedModel', m.id); }} title={`使用 ${m.id}`}>{m.id}</span>
                                                        {isActive && <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>当前</span>}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                    <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>已勾选 {(data.embedProviderConfigs?.[data.embedProvider]?.models || []).length} 个模型</span>
                                        <button style={{ padding: '6px 20px', borderRadius: 'var(--radius-sm, 6px)', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} onClick={() => setShowEmbedModelModal(false)}>完成</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 重建向量 */}
                        <div style={{ marginTop: 8 }}>
                            <button style={{ padding: '8px 16px', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)', cursor: rebuildStatus && !rebuildStatus.finished ? 'wait' : 'pointer', fontSize: 12, color: 'var(--accent)', fontWeight: 500, opacity: rebuildStatus && !rebuildStatus.finished ? 0.7 : 1 }} onClick={handleRebuildEmbeddings} disabled={rebuildStatus && !rebuildStatus.finished && !rebuildStatus.error}>
                                {rebuildStatus && !rebuildStatus.finished && !rebuildStatus.error ? `向量化中... ${rebuildStatus.done}/${rebuildStatus.total}` : <><RefreshCw size={12} style={{ marginRight: 4 }} />重建所有设定向量</>}
                            </button>
                            {rebuildStatus?.finished && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: rebuildStatus.failed > 0 ? 'var(--warning)' : 'var(--success)' }}>
                                    ✓ 完成！{rebuildStatus.done - rebuildStatus.failed}/{rebuildStatus.total} 成功{rebuildStatus.failed > 0 ? `，${rebuildStatus.failed} 失败` : ''}
                                </span>
                            )}
                            {rebuildStatus?.error && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--error)' }}>重建失败</span>
                            )}
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>首次开启或更换嵌入模型后，需要重建向量才能使用 RAG 智能检索</div>
                        </div>
                    </div>
                </div>
            )}

            {/* 保存配置 */}
            {data.apiKey && (
                <div style={{ marginBottom: 14 }}>
                    {!showSaveInput ? (
                        <button style={{ padding: '8px 16px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }} onClick={() => { const pl = PROVIDERS.find(p => p.key === data.provider)?.label || data.provider; setProfileName(`${pl} - ${data.model || t('common.confirm')}`); setShowSaveInput(true); }}>
                            {t('apiConfig.saveProfileBtn')}
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input className="modal-input" style={{ margin: 0, flex: 1, padding: '7px 10px', fontSize: 13 }} value={profileName} onChange={e => setProfileName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveProfile()} placeholder={t('apiConfig.saveProfilePlaceholder')} autoFocus />
                            <button className="btn btn-primary btn-sm" style={{ padding: '7px 14px', whiteSpace: 'nowrap' }} onClick={handleSaveProfile}>{t('apiConfig.saveBtn')}</button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '7px 10px' }} onClick={() => setShowSaveInput(false)}>{t('common.cancel')}</button>
                        </div>
                    )}
                </div>
            )}

            <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                <strong>{t('apiConfig.howToGetKey')}</strong><br />
                • {t('apiConfig.keyGuide').split('\n').map((line, i) => <span key={i}>{line.replace(/^• /, '')}<br /></span>)}
            </div>
        </div>
    );
}

function FieldInput({ label, value, onChange, placeholder, multiline, rows, secret }) {
    const [showSecret, setShowSecret] = useState(false);
    const Component = multiline ? 'textarea' : 'input';
    return (
        <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>{label}</label>
            <div style={{ position: 'relative' }}>
                <Component
                    className="modal-input"
                    style={{ marginBottom: 0, ...(multiline ? { resize: 'vertical', minHeight: `${(rows || 3) * 22}px` } : {}), ...(secret ? { paddingRight: 36 } : {}) }}
                    {...(!multiline ? { type: secret && !showSecret ? 'password' : 'text' } : {})}
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    rows={rows || 3}
                />
                {secret && value && (
                    <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        style={{
                            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 14, color: 'var(--text-muted)', padding: '2px 4px',
                            opacity: 0.7, lineHeight: 1,
                        }}
                        title={showSecret ? '隐藏' : '显示'}
                    >
                        {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                )}
            </div>
        </div>
    );
}

function BookInfoForm({ data, onChange }) {
    const update = (field, value) => onChange({ ...data, [field]: value });
    const { t } = useI18n();
    return (
        <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{t('bookInfo.intro')}</p>
            <FieldInput label={t('bookInfo.title')} value={data.title} onChange={v => update('title', v)} placeholder={t('bookInfo.titlePlaceholder')} />
            <FieldInput label={t('bookInfo.genre')} value={data.genre} onChange={v => update('genre', v)} placeholder={t('bookInfo.genrePlaceholder')} />
            <FieldInput label={t('bookInfo.synopsis')} value={data.synopsis} onChange={v => update('synopsis', v)} placeholder={t('bookInfo.synopsisPlaceholder')} multiline rows={3} />
            <FieldInput label={t('bookInfo.style')} value={data.style} onChange={v => update('style', v)} placeholder={t('bookInfo.stylePlaceholder')} />
            <FieldInput label={t('bookInfo.tone')} value={data.tone} onChange={v => update('tone', v)} placeholder={t('bookInfo.tonePlaceholder')} />
            <FieldInput label={t('bookInfo.pov')} value={data.pov} onChange={v => update('pov', v)} placeholder={t('bookInfo.povPlaceholder')} />
            <FieldInput label={t('bookInfo.targetAudience')} value={data.targetAudience} onChange={v => update('targetAudience', v)} placeholder={t('bookInfo.targetAudiencePlaceholder')} />
        </div>
    );
}

function DeleteConfirmModal({ message, onConfirm, onCancel }) {
    const [skipToday, setSkipToday] = useState(false);
    const [neverRemind, setNeverRemind] = useState(false);
    const { t } = useI18n();

    const handleConfirm = () => {
        try {
            if (neverRemind) {
                localStorage.setItem('author-delete-never-remind', 'true');
            } else if (skipToday) {
                localStorage.setItem('author-delete-skip-today', new Date().toISOString().slice(0, 10));
            }
        } catch { /* ignore */ }
        onConfirm();
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 99999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
            }}
            onClick={onCancel}
        >
            <div
                style={{
                    background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-lg, 12px)', padding: '24px 28px',
                    minWidth: 340, maxWidth: 440,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
                    animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* 标题 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <span style={{ fontSize: 20 }}>⚠️</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {t('settings.deleteConfirmTitle')}
                    </span>
                </div>

                {/* 消息 */}
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
                    {message}
                </p>

                {/* 复选框 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                        <input
                            type="checkbox" checked={skipToday} disabled={neverRemind}
                            onChange={e => setSkipToday(e.target.checked)}
                            style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
                        />
                        {t('settings.dontRemindToday')}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                        <input
                            type="checkbox" checked={neverRemind}
                            onChange={e => { setNeverRemind(e.target.checked); if (e.target.checked) setSkipToday(false); }}
                            style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
                        />
                        {t('settings.dontRemindForever')}
                    </label>
                </div>

                {/* 按钮 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 20px', border: '1px solid var(--border-light)',
                            borderRadius: 'var(--radius-md, 8px)', background: 'var(--bg-secondary)',
                            cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500,
                            transition: 'all 0.15s',
                        }}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleConfirm}
                        style={{
                            padding: '8px 20px', border: 'none',
                            borderRadius: 'var(--radius-md, 8px)', background: '#e53e3e',
                            cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 600,
                            transition: 'all 0.15s',
                            boxShadow: '0 2px 8px rgba(229,62,62,0.3)',
                        }}
                    >
                        {t('common.delete')}
                    </button>
                </div>
            </div>
        </div>
    );
}
