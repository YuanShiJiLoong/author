const FOLDER_LABEL_GROUPS = [
    { zh: '作品信息', en: 'Book Info', ru: 'Информация о произведении', aliases: ['Information', 'Информация'] },
    { zh: '人物设定', en: 'Characters', ru: 'Персонажи' },
    { zh: '空间/地点', en: 'Places', ru: 'Места' },
    { zh: '世界观/设定', en: 'Worldbuilding', ru: 'Мир', aliases: ['世界观'] },
    { zh: '物品/道具', en: 'Items / Props', ru: 'Предметы / реквизит', aliases: ['Items', 'Предметы'] },
    { zh: '大纲', en: 'Outline', ru: 'План' },
    { zh: '写作规则', en: 'Writing Rules', ru: 'Правила письма', aliases: ['Правила'] },
    { zh: '自定义设定', en: 'Custom Settings', ru: 'Пользовательские настройки' },
    { zh: '主要角色', en: 'Main Characters', ru: 'Главные персонажи' },
    { zh: '次要角色', en: 'Supporting Characters', ru: 'Второстепенные персонажи' },
    { zh: '阵营/势力', en: 'Factions', ru: 'Фракции' },
    { zh: '主要场景', en: 'Key Locations', ru: 'Ключевые места' },
    { zh: '自然环境', en: 'Natural Environment', ru: 'Природная среда' },
    { zh: '历史/纪元', en: 'History / Eras', ru: 'История / Эпохи' },
    { zh: '社会/政治', en: 'Society / Politics', ru: 'Общество / Политика' },
    { zh: '文化/习俗', en: 'Culture / Customs', ru: 'Культура / Обычаи' },
    { zh: '力量体系', en: 'Power System', ru: 'Система сил' },
    { zh: '武器/装备', en: 'Weapons / Equipment', ru: 'Оружие / Снаряжение' },
    { zh: '特殊道具', en: 'Special Items', ru: 'Особые предметы' },
    { zh: '主线', en: 'Main Plot', ru: 'Основной сюжет' },
    { zh: '支线', en: 'Subplots', ru: 'Побочные линии' },
    { zh: '伏笔', en: 'Foreshadowing', ru: 'Предвестия' },
    { zh: '文风规范', en: 'Style Guide', ru: 'Стилистика' },
    { zh: '禁忌/注意', en: 'Taboos / Notes', ru: 'Табу / Примечания' },
];

const WORK_NAME_GROUPS = [
    { zh: '默认作品', en: 'Default Work', ru: 'Работа по умолчанию' },
    { zh: '新作品', en: 'New Work', ru: 'Новое произведение' },
];

function findLabelGroup(groups, name) {
    if (typeof name !== 'string' || !name.trim()) return null;
    const normalized = name.trim();
    return groups.find(group => (
        group.zh === normalized ||
        group.en === normalized ||
        group.ru === normalized ||
        group.aliases?.includes(normalized)
    )) || null;
}

function localizeLabel(groups, name, text) {
    if (!name || typeof text !== 'function') return name;
    const group = findLabelGroup(groups, name);
    return group ? text(group.zh, group.en, group.ru) : name;
}

export function isBuiltInFolderLabel(name) {
    return !!findLabelGroup(FOLDER_LABEL_GROUPS, name);
}

export function getBuiltInFolderLabel(name, text) {
    return localizeLabel(FOLDER_LABEL_GROUPS, name, text);
}

export function getBuiltInWorkName(name, text) {
    return localizeLabel(WORK_NAME_GROUPS, name, text);
}
