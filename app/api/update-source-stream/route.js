import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { assertUpdateToken } from '../../lib/update-source-auth';

// 服务启动时记录的版本（Node require 缓存，不会变）
const RUNNING_VERSION = (() => {
    try {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
        return pkg.version;
    } catch { return null; }
})();

/**
 * POST /api/update-source-stream
 * SSE 流式更新源码：git pull → npm install → npm run build
 * 实时推送每个步骤的进度
 * 安全：需通过 UPDATE_SOURCE_TOKEN 校验，避免匿名访客触发命令执行
 */
export async function POST(request) {
    const authCheck = assertUpdateToken(request);
    if (!authCheck.ok) {
        return new Response(
            JSON.stringify({ error: authCheck.error, code: authCheck.code }),
            { status: authCheck.status, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const cwd = process.cwd();
    const gitDir = join(cwd, '.git');

    if (!existsSync(gitDir)) {
        return new Response(
            JSON.stringify({ error: '非源码部署环境，无法执行自动更新', code: 'NOT_SOURCE_DEPLOY' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            const steps = [
                { step: 1, total: 3, label: '🔄 拉取最新代码', cmd: 'git', args: ['pull'], timeout: 60000 },
                { step: 2, total: 3, label: '📦 安装依赖', cmd: 'npm', args: ['install'], timeout: 300000 },
                { step: 3, total: 3, label: '🔨 构建项目', cmd: 'npm', args: ['run', 'build'], timeout: 300000 },
            ];

            try {
                for (const stepInfo of steps) {
                    send({ step: stepInfo.step, total: stepInfo.total, label: stepInfo.label, status: 'running' });

                    const result = await runCommand(stepInfo.cmd, stepInfo.args, cwd, stepInfo.timeout);

                    if (!result.success) {
                        send({
                            step: stepInfo.step, total: stepInfo.total, label: stepInfo.label,
                            status: 'error', log: result.output,
                        });
                        send({ done: true, success: false, error: `步骤 ${stepInfo.step} 失败: ${stepInfo.label}`, code: 'UPDATE_STEP_FAILED', step: stepInfo.step, label: stepInfo.label });
                        controller.close();
                        return;
                    }

                    // 检查 git pull 是否已是最新
                    if (stepInfo.step === 1 && (result.output.includes('Already up to date') || result.output.includes('已经是最新'))) {
                        send({
                            step: stepInfo.step, total: stepInfo.total, label: stepInfo.label,
                            status: 'done', log: result.output,
                        });
                        // 读取磁盘上的 package.json 版本（可能被之前的 git pull 更新过但服务未重启）
                        let diskVersion = null;
                        let needRestart = false;
                        try {
                            const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
                            diskVersion = pkg.version;
                            needRestart = RUNNING_VERSION && diskVersion !== RUNNING_VERSION;
                        } catch { /* ignore */ }
                        send({
                            done: true, success: true, alreadyUpToDate: true,
                            needRestart, diskVersion, runningVersion: RUNNING_VERSION,
                        });
                        controller.close();
                        return;
                    }

                    send({
                        step: stepInfo.step, total: stepInfo.total, label: stepInfo.label,
                        status: 'done', log: result.lastLines,
                    });
                }

                // 完整更新成功（git pull + npm install + build），必须重启
                send({ done: true, success: true, alreadyUpToDate: false, needRestart: true });
            } catch (err) {
                send({ done: true, success: false, error: err.message });
            }

            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}

function runCommand(cmd, args, cwd, timeout) {
    return new Promise((resolve) => {
        let output = '';
        let timer;

        // Windows 下用 shell 模式
        const proc = spawn(cmd, args, {
            cwd,
            shell: true,
            env: { ...process.env },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        proc.stdout.on('data', (data) => { output += data.toString(); });
        proc.stderr.on('data', (data) => { output += data.toString(); });

        proc.on('close', (code) => {
            clearTimeout(timer);
            const lines = output.trim().split('\n');
            resolve({
                success: code === 0,
                output: output.trim(),
                lastLines: lines.slice(-5).join('\n'),
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({ success: false, output: err.message, lastLines: err.message });
        });

        timer = setTimeout(() => {
            proc.kill();
            resolve({ success: false, output: '命令执行超时', lastLines: '命令执行超时' });
        }, timeout);
    });
}
