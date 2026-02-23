const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let nextServer;

const isDev = process.argv.includes('--dev');
const PORT = 3000;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: 'Author — AI-Powered Creative Writing',
        icon: path.join(__dirname, '..', 'public', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        // 隐藏默认菜单栏，更简洁
        autoHideMenuBar: true,
        show: false,
    });

    mainWindow.loadURL(`http://localhost:${PORT}`);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // 外部链接在系统浏览器中打开
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startNextServer() {
    return new Promise((resolve, reject) => {
        if (isDev) {
            // 开发模式：假设 dev server 已在运行
            console.log('[Author] Dev mode — connecting to existing dev server...');
            resolve();
            return;
        }

        console.log('[Author] Starting production server...');

        // 生产模式：运行 next start
        const nextBin = path.join(__dirname, '..', 'node_modules', '.bin', 'next');
        const projectDir = path.join(__dirname, '..');

        nextServer = spawn(
            process.platform === 'win32' ? `${nextBin}.cmd` : nextBin,
            ['start', '-p', String(PORT)],
            {
                cwd: projectDir,
                env: { ...process.env, NODE_ENV: 'production' },
                stdio: 'pipe',
                shell: true,
            }
        );

        let started = false;

        nextServer.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('[Next.js]', output);
            if (!started && output.includes('Ready')) {
                started = true;
                resolve();
            }
        });

        nextServer.stderr.on('data', (data) => {
            console.error('[Next.js Error]', data.toString());
        });

        nextServer.on('error', (err) => {
            console.error('[Next.js] Failed to start:', err);
            reject(err);
        });

        nextServer.on('close', (code) => {
            if (!started) {
                reject(new Error(`Next.js server exited with code ${code}`));
            }
        });

        // 超时保底 — 15秒内没有就绪也继续
        setTimeout(() => {
            if (!started) {
                started = true;
                console.log('[Author] Server startup timeout, loading anyway...');
                resolve();
            }
        }, 15000);
    });
}

app.whenReady().then(async () => {
    try {
        await startNextServer();
    } catch (err) {
        console.error('[Author] Server start failed:', err);
    }
    createWindow();
});

app.on('window-all-closed', () => {
    if (nextServer) {
        nextServer.kill();
    }
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// 确保退出时清理子进程
app.on('before-quit', () => {
    if (nextServer) {
        nextServer.kill();
    }
});
