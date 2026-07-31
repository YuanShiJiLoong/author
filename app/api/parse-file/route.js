/**
 * API Route: 解析 DOC / PDF 文件为纯文本
 * POST /api/parse-file
 * Body: FormData { file: File }
 * Response: { text: string } | { error: string }
 */

import { NextResponse } from 'next/server';

// 提高 body 大小限制，避免大 PDF/DOC 文件上传时返回 413
export const maxDuration = 60; // 秒
export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: '未提供文件', code: 'NO_FILE' }, { status: 400 });
        }

        const fileName = file.name.toLowerCase();
        const buffer = Buffer.from(await file.arrayBuffer());

        let text = '';

        if (fileName.endsWith('.pdf')) {
            // PDF 解析 — 直接引用内部模块，避免 index.js 加载测试文件
            const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
            const pdfData = await pdfParse(buffer);
            text = pdfData.text || '';
        } else if (fileName.endsWith('.doc') && !fileName.endsWith('.docx')) {
            // DOC 解析（旧版 Word 二进制格式）
            const WordExtractor = (await import('word-extractor')).default;
            const extractor = new WordExtractor();
            const doc = await extractor.extract(buffer);
            text = doc.getBody() || '';
        } else {
            return NextResponse.json({ error: '不支持的文件格式', code: 'UNSUPPORTED_FORMAT' }, { status: 400 });
        }

        if (!text.trim()) {
            return NextResponse.json({ text: '', warning: '文件中未能提取到文本内容（可能是扫描件或图片PDF）', code: 'PARSE_NO_TEXT' });
        }
        return NextResponse.json({ text });
    } catch (err) {
        console.error('parse-file error:', err);
        // 不把解析库的原始错误/堆栈/文件路径回传前端，避免内部信息泄露；
        // 仅返回稳定文案 + code，前端用 localizeApiError 按 code 本地化展示
        return NextResponse.json(
            { error: '解析失败', code: 'PARSE_FAILED' },
            { status: 500 }
        );
    }
}
