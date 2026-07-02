'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    CheckCircle2, Copy, DownloadCloud, HardDrive, Link, RefreshCw,
    Save, TestTube2, UploadCloud, Wifi, XCircle,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useI18n } from '../lib/useI18n';

const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 12,
    outline: 'none',
};

const labelStyle = {
    display: 'block',
    fontSize: 11,
    color: 'var(--text-muted)',
    marginBottom: 6,
};

const buttonStyle = {
    padding: '8px 12px',
    fontSize: 12,
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
};

function formatTime(ts) {
    if (!ts) return '';
    try {
        return new Date(ts).toLocaleTimeString();
    } catch {
        return '';
    }
}

export default function PortableSyncSettings({ mode = 'all' }) {
    const { showToast } = useAppStore();
    const { text } = useI18n();
    const [sync, setSync] = useState(null);
    const [form, setForm] = useState(null);
    const [password, setPassword] = useState('');
    const [hasPassword, setHasPassword] = useState(false);
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState('');
    const [lanShare, setLanShare] = useState(null);
    const [lanSource, setLanSource] = useState('');

    useEffect(() => {
        let mounted = true;
        let unsubscribe = null;
        (async () => {
            const mod = await import('../lib/portable-sync');
            if (!mounted) return;
            setSync(mod);
            setForm(mod.loadPortableSyncSettings());
            const storedPassword = await mod.hasPortableSyncSecret('webdav-password');
            if (!mounted) return;
            setHasPassword(storedPassword);
            unsubscribe = mod.onPortableSyncStatusChange(next => {
                if (mounted) setStatus(next);
            });
        })();
        return () => {
            mounted = false;
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const presets = useMemo(() => sync?.getWebDavPresets?.() || {}, [sync]);
    const selectedPreset = form?.webdav?.preset || 'custom';
    const presetInfo = presets[selectedPreset] || presets.custom || {};
    const presetLabel = (key, item) => ({
        jianguoyun: text('坚果云', 'Jianguoyun', 'Jianguoyun'),
        '123pan': text('123 云盘', '123 Cloud Drive', '123 Cloud'),
        custom: text('自定义 WebDAV', 'Custom WebDAV', 'Пользовательский WebDAV'),
    }[key] || item.label);
    const presetNote = (key, item) => ({
        jianguoyun: text('使用坚果云账号邮箱和应用密码。', 'Use your Jianguoyun account email and app password.', 'Используйте email аккаунта Jianguoyun и пароль приложения.'),
        '123pan': text('在 123 云盘第三方挂载/WebDAV 页面复制地址和授权信息。', 'Copy the address and authorization details from the 123 Cloud third-party mount/WebDAV page.', 'Скопируйте адрес и данные авторизации на странице стороннего подключения/WebDAV 123 Cloud.'),
        custom: text('适用于 NAS、Nextcloud、ownCloud、Seafile、Cloudreve 等。', 'For NAS, Nextcloud, ownCloud, Seafile, Cloudreve, and similar services.', 'Для NAS, Nextcloud, ownCloud, Seafile, Cloudreve и похожих сервисов.'),
    }[key] || item.note);

    if (!form || !sync) return null;

    const updateWebDav = (patch) => {
        setForm(prev => ({
            ...prev,
            webdav: { ...prev.webdav, ...patch },
        }));
    };

    const updateLan = (patch) => {
        setForm(prev => ({
            ...prev,
            lan: { ...prev.lan, ...patch },
        }));
    };

    const saveSettings = async (extra = {}) => {
        const secrets = {};
        if (extra.savePassword && password) {
            secrets.webdavPassword = password;
        }
        const normalized = await sync.savePortableSyncSettings(form, secrets);
        setForm(normalized);
        const storedPassword = await sync.hasPortableSyncSecret('webdav-password');
        setHasPassword(storedPassword);
        if (extra.savePassword && password) setPassword('');
        return normalized;
    };

    const withBusy = async (key, action) => {
        setBusy(key);
        try {
            return await action();
        } finally {
            setBusy('');
        }
    };

    const handlePresetChange = (preset) => {
        const defaults = sync.getWebDavPresetDefaults(preset);
        updateWebDav({
            preset,
            endpoint: defaults.endpoint || form.webdav.endpoint,
            basePath: defaults.basePath || form.webdav.basePath,
        });
    };

    const handleSave = async () => {
        await withBusy('save', async () => {
            await saveSettings({ savePassword: !!password });
            showToast(password
                ? text('WebDAV 配置和密码已保存', 'WebDAV settings and password saved', 'Настройки WebDAV и пароль сохранены')
                : text('WebDAV 配置已保存', 'WebDAV settings saved', 'Настройки WebDAV сохранены'), 'success');
        });
    };

    const handleTest = async () => {
        await withBusy('test', async () => {
            const saved = await saveSettings({ savePassword: !!password });
            await sync.testWebDavConnection({
                ...saved,
                webdav: {
                    ...saved.webdav,
                    ...(password ? { password } : {}),
                },
            });
            if (password) {
                setHasPassword(true);
                setPassword('');
            }
            showToast(text('WebDAV 连接测试成功', 'WebDAV connection test succeeded', 'Проверка подключения WebDAV прошла успешно'), 'success');
        }).catch(err => showToast(err.message, 'error'));
    };

    const flushEditor = async () => {
        await useAppStore.getState().flushPendingEditorSave();
    };

    const handlePush = async () => {
        await withBusy('push', async () => {
            await flushEditor();
            await saveSettings({ savePassword: !!password });
            const count = await sync.pushAllToWebDav();
            if (password) {
                setHasPassword(true);
                setPassword('');
            }
            showToast(text(`已推送 ${count} 项数据到 WebDAV`, `Pushed ${count} items to WebDAV`, `Отправлено элементов в WebDAV: ${count}`), 'success');
        }).catch(err => showToast(err.message, 'error'));
    };

    const handlePull = async () => {
        const confirmed = window.confirm(text(
            '从 WebDAV 拉取会用远端作品/章节/设定覆盖本机同名数据。继续前会自动创建本机快照。确认继续吗？',
            'Pulling from WebDAV will overwrite local works, chapters, and settings with matching remote data. A local snapshot will be created before continuing. Continue?',
            'Загрузка из WebDAV заменит локальные произведения, главы и настройки совпадающими удалёнными данными. Перед продолжением будет создан локальный снимок. Продолжить?'
        ));
        if (!confirmed) return;
        await withBusy('pull', async () => {
            await flushEditor();
            const { createSnapshot } = await import('../lib/snapshots');
            await createSnapshot(text('从 WebDAV 同步前的备份', 'Backup before WebDAV pull', 'Резервная копия перед загрузкой из WebDAV'), 'manual', { syncLatestToCloud: false });
            await saveSettings({ savePassword: !!password });
            const count = await sync.pullAllFromWebDav();
            showToast(text(`已从 WebDAV 拉取 ${count} 项数据，即将刷新`, `Pulled ${count} items from WebDAV. Refreshing soon`, `Загружено элементов из WebDAV: ${count}. Скоро обновление`), 'success');
            setTimeout(() => window.location.reload(), 1200);
        }).catch(err => showToast(err.message, 'error'));
    };

    const handleFlush = async () => {
        await withBusy('flush', async () => {
            await saveSettings({ savePassword: !!password });
            await sync.flushPortableSync({ throwOnError: true });
            showToast(text('WebDAV 待同步队列已处理', 'WebDAV sync queue processed', 'Очередь синхронизации WebDAV обработана'), 'success');
        }).catch(err => showToast(err.message, 'error'));
    };

    const handleCreateLanShare = async () => {
        await withBusy('lan-share', async () => {
            await flushEditor();
            await saveSettings();
            const share = await sync.createLanShare(form.lan.shareMinutes);
            setLanShare(share);
            showToast(text(`局域网分享已创建，包含 ${share.entryCount} 项数据`, `LAN share created with ${share.entryCount} items`, `Общий доступ по LAN создан, элементов: ${share.entryCount}`), 'success');
        }).catch(err => showToast(err.message, 'error'));
    };

    const handleCopy = async (value) => {
        await navigator.clipboard?.writeText(value);
        showToast(text('已复制局域网同步链接', 'LAN sync link copied', 'Ссылка LAN-синхронизации скопирована'), 'success');
    };

    const handleLanImport = async () => {
        const confirmed = window.confirm(text(
            '从局域网导入会覆盖本机同名作品/章节/设定。继续前会自动创建本机快照。确认继续吗？',
            'Importing from LAN will overwrite local works, chapters, and settings with matching data. A local snapshot will be created before continuing. Continue?',
            'Импорт из LAN заменит локальные произведения, главы и настройки совпадающими данными. Перед продолжением будет создан локальный снимок. Продолжить?'
        ));
        if (!confirmed) return;
        await withBusy('lan-import', async () => {
            await flushEditor();
            const { createSnapshot } = await import('../lib/snapshots');
            await createSnapshot(text('从局域网同步前的备份', 'Backup before LAN import', 'Резервная копия перед импортом из LAN'), 'manual', { syncLatestToCloud: false });
            const count = await sync.importLanShare(lanSource);
            showToast(text(`已导入 ${count} 项数据，即将刷新`, `Imported ${count} items. Refreshing soon`, `Импортировано элементов: ${count}. Скоро обновление`), 'success');
            setTimeout(() => window.location.reload(), 1200);
        }).catch(err => showToast(err.message, 'error'));
    };

    const canUseWebDav = form.webdav.endpoint && form.webdav.username && (password || hasPassword);
    const isBusy = (key) => busy === key;

    return (
        <>
            {mode !== 'lan' && (
            <div style={{ marginTop: mode === 'all' ? 18 : 0, paddingTop: mode === 'all' ? 18 : 0, borderTop: mode === 'all' ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <HardDrive size={15} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{text('WebDAV 同步', 'WebDAV Sync', 'Синхронизация WebDAV')}</span>
                    <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={!!form.webdav.enabled}
                            onChange={e => updateWebDav({ enabled: e.target.checked })}
                        />
                        {text('启用', 'Enable', 'Включить')}
                    </label>
                </div>

                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {text('可使用坚果云、123 云盘或自建 NAS/Nextcloud 等 WebDAV 服务。应用密码只保存在本机，不参与云同步。', 'Use Jianguoyun, 123 Cloud Drive, or your own NAS/Nextcloud WebDAV service. App passwords stay on this device and are not synced.', 'Используйте Jianguoyun, 123 Cloud Drive или собственный WebDAV-сервис NAS/Nextcloud. Пароли приложений хранятся только на этом устройстве и не синхронизируются.')}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                        <label style={labelStyle}>{text('服务商', 'Provider', 'Провайдер')}</label>
                        <select
                            value={selectedPreset}
                            onChange={e => handlePresetChange(e.target.value)}
                            style={inputStyle}
                        >
                            {Object.entries(presets).map(([key, item]) => (
                                <option key={key} value={key}>{presetLabel(key, item)}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>{text('远端目录', 'Remote Folder', 'Удалённая папка')}</label>
                        <input
                            value={form.webdav.basePath}
                            onChange={e => updateWebDav({ basePath: e.target.value })}
                            placeholder="/AuthorSync"
                            style={inputStyle}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>{text('WebDAV 地址', 'WebDAV URL', 'URL WebDAV')}</label>
                    <input
                        value={form.webdav.endpoint}
                        onChange={e => updateWebDav({ endpoint: e.target.value })}
                        placeholder="https://dav.example.com/dav/"
                        style={inputStyle}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                        <label style={labelStyle}>{text('账号', 'Account', 'Аккаунт')}</label>
                        <input
                            value={form.webdav.username}
                            onChange={e => updateWebDav({ username: e.target.value })}
                            placeholder={text('邮箱或用户名', 'Email or username', 'Email или имя пользователя')}
                            autoComplete="username"
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>{hasPassword ? text('应用密码（已保存，留空不变）', 'App password (saved, leave blank to keep)', 'Пароль приложения (сохранён, оставьте пустым без изменений)') : text('应用密码 / 授权码', 'App Password / Authorization Code', 'Пароль приложения / код авторизации')}</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder={hasPassword ? text('已保存，输入新密码可替换', 'Saved. Enter a new password to replace it', 'Сохранено. Введите новый пароль для замены') : text('请输入应用密码', 'Enter the app password', 'Введите пароль приложения')}
                            autoComplete="new-password"
                            style={inputStyle}
                        />
                    </div>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.4 }}>
                    {presetNote(selectedPreset, presetInfo)}
                    {status?.pending > 0 ? text(` · ${status.pending} 项待同步`, ` · ${status.pending} pending`, ` · ожидает: ${status.pending}`) : ''}
                    {status?.lastSync ? text(` · 上次同步 ${formatTime(status.lastSync)}`, ` · Last sync ${formatTime(status.lastSync)}`, ` · последняя синхронизация ${formatTime(status.lastSync)}`) : ''}
                    {status?.error ? <span style={{ color: '#ef4444' }}> · {status.error}</span> : null}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button style={buttonStyle} onClick={handleSave} disabled={!!busy}>
                        {isBusy('save') ? <RefreshCw size={13} className="spin" /> : <Save size={13} />}
                        {text('保存配置', 'Save Settings', 'Сохранить настройки')}
                    </button>
                    <button style={buttonStyle} onClick={handleTest} disabled={!!busy || !canUseWebDav}>
                        {isBusy('test') ? <RefreshCw size={13} className="spin" /> : <TestTube2 size={13} />}
                        {text('测试连接', 'Test Connection', 'Проверить подключение')}
                    </button>
                    <button style={buttonStyle} onClick={handleFlush} disabled={!!busy || !canUseWebDav}>
                        {isBusy('flush') ? <RefreshCw size={13} className="spin" /> : <CheckCircle2 size={13} />}
                        {text('同步队列', 'Sync Queue', 'Очередь синхронизации')}
                    </button>
                    <button style={buttonStyle} onClick={handlePush} disabled={!!busy || !canUseWebDav}>
                        {isBusy('push') ? <RefreshCw size={13} className="spin" /> : <UploadCloud size={13} />}
                        {text('推送本机', 'Push Local', 'Отправить локальное')}
                    </button>
                    <button style={buttonStyle} onClick={handlePull} disabled={!!busy || !canUseWebDav}>
                        {isBusy('pull') ? <RefreshCw size={13} className="spin" /> : <DownloadCloud size={13} />}
                        {text('拉取远端', 'Pull Remote', 'Загрузить удалённое')}
                    </button>
                </div>
            </div>
            )}

            {mode !== 'webdav' && (
            <div style={{ marginTop: mode === 'all' ? 18 : 0, paddingTop: mode === 'all' ? 18 : 0, borderTop: mode === 'all' ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Wifi size={15} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{text('局域网同步', 'LAN Sync', 'LAN-синхронизация')}</span>
                </div>

                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {text('同一 Wi-Fi 下临时分享作品、章节和设定。分享链接只在本机应用运行期间有效。', 'Temporarily share works, chapters, and settings on the same Wi-Fi. The link only works while this desktop app is running.', 'Временно делитесь произведениями, главами и настройками в одной Wi-Fi сети. Ссылка работает только пока запущено это настольное приложение.')}
                </p>

                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10 }}>
                    <div style={{ width: 120 }}>
                        <label style={labelStyle}>{text('有效分钟', 'Valid Minutes', 'Минут действия')}</label>
                        <input
                            type="number"
                            min="5"
                            max="120"
                            value={form.lan.shareMinutes}
                            onChange={e => updateLan({ shareMinutes: e.target.value })}
                            style={inputStyle}
                        />
                    </div>
                    <button style={buttonStyle} onClick={handleCreateLanShare} disabled={!!busy}>
                        {isBusy('lan-share') ? <RefreshCw size={13} className="spin" /> : <Link size={13} />}
                        {text('创建分享链接', 'Create Share Link', 'Создать ссылку')}
                    </button>
                </div>

                {lanShare?.urls?.length > 0 && (
                    <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {lanShare.urls.map(url => (
                            <div key={url} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input value={url} readOnly style={{ ...inputStyle, fontFamily: 'monospace' }} />
                                <button style={{ ...buttonStyle, padding: '8px 10px' }} onClick={() => handleCopy(url)} title={text('复制', 'Copy', 'Копировать')}>
                                    <Copy size={13} />
                                </button>
                            </div>
                        ))}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {text('分享码', 'Share Code', 'Код доступа')}：{lanShare.token} · {text(`${lanShare.entryCount} 项`, `${lanShare.entryCount} items`, `${lanShare.entryCount} элементов`)} · {text('到期', 'Expires', 'Истекает')} {formatTime(lanShare.expiresAt)}
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <label style={labelStyle}>{text('导入链接、分享码或同步快照', 'Import Link, Share Code, or Sync Snapshot', 'Ссылка, код доступа или снимок синхронизации')}</label>
                        <input
                            value={lanSource}
                            onChange={e => setLanSource(e.target.value)}
                            placeholder={text('http://192.168.x.x:3000/api/sync/lan?token=... 或粘贴手机复制的快照', 'http://192.168.x.x:3000/api/sync/lan?token=... or paste a snapshot copied from your phone', 'http://192.168.x.x:3000/api/sync/lan?token=... или вставьте снимок, скопированный с телефона')}
                            style={inputStyle}
                        />
                    </div>
                    <button style={buttonStyle} onClick={handleLanImport} disabled={!!busy || !lanSource.trim()}>
                        {isBusy('lan-import') ? <RefreshCw size={13} className="spin" /> : <DownloadCloud size={13} />}
                        {text('导入', 'Import', 'Импорт')}
                    </button>
                </div>

                {lanShare && !lanShare.urls?.length && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#ef4444' }}>
                        <XCircle size={12} /> {text('未获取到可用局域网地址，请检查网络连接。', 'No available LAN address found. Check your network connection.', 'Не найден доступный LAN-адрес. Проверьте подключение к сети.')}
                    </div>
                )}
            </div>
            )}
        </>
    );
}
