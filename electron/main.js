const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const { fork, execSync, spawn } = require('child_process');
const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const os = require('os');

// 日志文件 - 写到用户桌面方便查看
const logFile = path.join(app.getPath('desktop'), 'author-debug.log');
function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    console.log(msg);
    try { fs.appendFileSync(logFile, line); } catch (e) { }
}

// 防止多开
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    log('Another instance is running, quitting.');
    app.quit();
    process.exit(0);
}

let mainWindow;
let serverProcess;

const isDev = process.argv.includes('--dev');
const BASE_PORT = 3000;
let actualPort = BASE_PORT;
let loadRetries = 0;
const MAX_LOAD_RETRIES = 10;
let serverReady = false; // 追踪服务器是否真正就绪

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: 'Author — AI-Powered Creative Writing',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        autoHideMenuBar: true,
        show: false,
    });

    mainWindow.loadURL(`http://localhost:${actualPort}`);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // F12 打开开发者工具
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'F12') {
                mainWindow.webContents.toggleDevTools();
            }
        });
    });

    // 加载失败时有限次重试
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        loadRetries++;
        log(`Load failed (${loadRetries}/${MAX_LOAD_RETRIES}): ${errorDescription}`);
        if (loadRetries < MAX_LOAD_RETRIES) {
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.loadURL(`http://localhost:${actualPort}`);
                }
            }, 2000);
        } else {
            mainWindow.show();
            dialog.showErrorBox(
                'Author 启动失败',
                '无法连接到内置服务器。\n\n' +
                '查看日志: ' + logFile
            );
        }
    });

    // 只有真正加载了 localhost 页面才重置重试计数器
    mainWindow.webContents.on('did-finish-load', () => {
        const url = mainWindow.webContents.getURL();
        if (url.includes('localhost')) {
            log('Page loaded successfully: ' + url);
            loadRetries = 0;
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http') && !url.includes('localhost')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    // 确保下载文件使用正确的文件名（而非 blob UUID）
    mainWindow.webContents.session.on('will-download', (event, item) => {
        const suggestedName = item.getFilename();
        // 如果文件名看起来像 UUID（没有扩展名或是 blob hash），尝试用 Content-Disposition
        if (suggestedName && !suggestedName.match(/^[0-9a-f-]{36}/i)) {
            // 文件名正常，不需要干预
            return;
        }
        // Electron 有时已经能从 a.download 获取到正确名称，这里做兜底
        log(`[Download] Original filename: ${suggestedName}`);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// 检测端口是否可用
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port, '127.0.0.1');
    });
}

// 查找可用端口
async function findAvailablePort(startPort, maxTries = 10) {
    for (let i = 0; i < maxTries; i++) {
        const port = startPort + i;
        if (await isPortAvailable(port)) {
            return port;
        }
        log(`Port ${port} is in use, trying next...`);
    }
    return null;
}

// 尝试杀掉占用端口的进程 (Windows)
function tryKillPortProcess(port) {
    try {
        if (process.platform === 'win32') {
            const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', timeout: 5000 });
            const lines = result.trim().split('\n');
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0') {
                    log(`Killing process ${pid} on port ${port}`);
                    try { execSync(`taskkill /F /PID ${pid}`, { timeout: 5000 }); } catch (e) { }
                }
            }
        }
    } catch (e) {
        // 没有进程占用或命令失败，忽略
    }
}

function waitForServer(port, maxRetries = 60) {
    return new Promise((resolve) => {
        let retries = 0;
        const check = () => {
            const req = http.get(`http://localhost:${port}`, (res) => {
                resolve(true);
            });
            req.on('error', () => {
                retries++;
                if (retries >= maxRetries) {
                    resolve(false);
                } else {
                    setTimeout(check, 1000);
                }
            });
            req.setTimeout(3000, () => {
                req.destroy();
                retries++;
                if (retries >= maxRetries) {
                    resolve(false);
                } else {
                    setTimeout(check, 1000);
                }
            });
        };
        check();
    });
}

function startNextServer() {
    return new Promise(async (resolve) => {
        if (isDev) {
            log('Dev mode — connecting to existing dev server...');
            resolve(true);
            return;
        }

        const isPackaged = app.isPackaged;
        let standaloneDir;

        if (isPackaged) {
            standaloneDir = path.join(process.resourcesPath, 'standalone');
        } else {
            standaloneDir = path.join(__dirname, '..', '.next', 'standalone');
        }

        const serverPath = path.join(standaloneDir, 'server.js');

        log(`isPackaged: ${isPackaged}`);
        log(`resourcesPath: ${process.resourcesPath}`);
        log(`standaloneDir: ${standaloneDir}`);
        log(`serverPath: ${serverPath}`);
        log(`serverExists: ${fs.existsSync(serverPath)}`);

        // 检查关键目录
        const staticDir = path.join(standaloneDir, '.next', 'static');
        const publicDir = path.join(standaloneDir, 'public');
        log(`staticDir exists: ${fs.existsSync(staticDir)}`);
        log(`publicDir exists: ${fs.existsSync(publicDir)}`);

        if (!fs.existsSync(serverPath)) {
            const msg = '找不到 server.js\n路径: ' + serverPath;
            log('ERROR: ' + msg);
            dialog.showErrorBox('Author 启动失败', msg);
            resolve(false);
            return;
        }

        // 尝试释放被占用的端口
        tryKillPortProcess(BASE_PORT);

        // 等待一下让端口释放
        await new Promise(r => setTimeout(r, 500));

        // 查找可用端口
        actualPort = await findAvailablePort(BASE_PORT);
        if (!actualPort) {
            const msg = `端口 ${BASE_PORT}-${BASE_PORT + 9} 全部被占用，无法启动服务器。`;
            log('ERROR: ' + msg);
            dialog.showErrorBox('Author 启动失败', msg);
            resolve(false);
            return;
        }

        log(`Using port: ${actualPort}`);
        log('Starting Next.js server via fork...');

        serverProcess = fork(serverPath, [], {
            cwd: standaloneDir,
            env: {
                ...process.env,
                NODE_ENV: 'production',
                PORT: String(actualPort),
                HOSTNAME: '0.0.0.0',
            },
            stdio: 'pipe',
        });

        serverProcess.stdout.on('data', (data) => {
            log('[Next.js stdout] ' + data.toString().trim());
        });

        serverProcess.stderr.on('data', (data) => {
            log('[Next.js stderr] ' + data.toString().trim());
        });

        serverProcess.on('error', (err) => {
            log('[Server process error] ' + err.message);
        });

        serverProcess.on('close', (code) => {
            log('[Server process closed] code: ' + code);
            serverReady = false;
        });

        const ready = await waitForServer(actualPort);
        serverReady = ready;
        log(`Server ready: ${ready}`);
        resolve(ready);
    });
}

app.whenReady().then(async () => {
    log('=== Author Desktop Starting ===');
    log(`Electron version: ${process.versions.electron}`);
    log(`Node version: ${process.versions.node}`);
    log(`Platform: ${process.platform} ${process.arch}`);
    log(`App path: ${app.getAppPath()}`);
    log(`Exe path: ${process.execPath}`);

    const ready = await startNextServer();

    if (!ready) {
        log('Server failed to start. Showing error dialog.');
        dialog.showErrorBox(
            'Author 启动失败',
            '内置服务器无法启动。\n\n' +
            '可能原因：\n' +
            '1. 端口被其他程序占用\n' +
            '2. 缺少运行文件\n' +
            '3. 防火墙或杀毒软件拦截\n\n' +
            '查看日志: ' + logFile
        );
        app.quit();
        return;
    }

    createWindow();
});

// ==================== 自动下载更新 ====================

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Author-App' } }, (res) => {
            // 跟随重定向
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                httpsGet(res.headers.location).then(resolve).catch(reject);
                return;
            }
            resolve(res);
        }).on('error', reject);
    });
}

ipcMain.handle('download-and-install-update', async (event) => {
    try {
        log('=== Auto-update started ===');

        // 1. 获取最新 release 信息
        const releaseRes = await new Promise((resolve, reject) => {
            https.get('https://api.github.com/repos/YuanShiJiLoong/author/releases/latest', {
                headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Author-App' },
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });

        // 2. 找到 .exe 安装包
        const exeAsset = releaseRes.assets?.find(a => a.name.endsWith('.exe'));
        if (!exeAsset) {
            log('No .exe asset found in release');
            return { success: false, error: '未找到安装包' };
        }

        const downloadUrl = exeAsset.browser_download_url;
        const fileName = exeAsset.name;
        const totalSize = exeAsset.size;
        const savePath = path.join(os.tmpdir(), fileName);

        log(`Downloading: ${fileName} (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
        log(`URL: ${downloadUrl}`);
        log(`Save to: ${savePath}`);

        // 3. 下载文件（跟随重定向）
        const res = await httpsGet(downloadUrl);

        if (res.statusCode !== 200) {
            log(`Download failed, status: ${res.statusCode}`);
            return { success: false, error: `下载失败 (HTTP ${res.statusCode})` };
        }

        const file = fs.createWriteStream(savePath);
        let downloaded = 0;
        let lastProgress = 0;

        await new Promise((resolve, reject) => {
            res.on('data', (chunk) => {
                downloaded += chunk.length;
                const progress = Math.floor(downloaded / totalSize * 100);
                if (progress > lastProgress) {
                    lastProgress = progress;
                    // 发送进度到渲染进程
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('update-download-progress', { progress, downloaded, total: totalSize });
                    }
                }
            });
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', reject);
            res.on('error', reject);
        });

        log(`Download complete: ${savePath}`);

        // 4. 启动安装程序（静默模式）并退出当前应用
        log('Launching installer...');
        const installer = spawn(savePath, ['/S'], {
            detached: true,
            stdio: 'ignore',
        });
        installer.unref();

        // 稍等一下确保安装程序启动
        await new Promise(r => setTimeout(r, 1000));

        log('Quitting app for update...');
        app.quit();

        return { success: true };
    } catch (err) {
        log(`Auto-update error: ${err.message}`);
        return { success: false, error: err.message };
    }
});

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    app.quit();
});

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill();
});
