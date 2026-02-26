/**
 * API Route: 解析 DOC / PDF 文件为纯文本
 * POST /api/parse-file
 * Body: FormData { file: File }
 * Response: { text: string } | { error: string }
 */

import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: '未提供文件' }, { status: 400 });
        }

        const fileName = file.name.toLowerCase();
        const buffer = Buffer.from(await file.arrayBuffer());

        let text = '';

        if (fileName.endsWith('.pdf')) {
            // PDF 解析 — 直接引用内部模块，避免 index.js 加载测试文件
            const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
            const pdfData = await pdfParse(buffer);
            console.log('[parse-file] PDF pages:', pdfData.numpages, 'text length:', (pdfData.text || '').length);
            text = pdfData.text || '';
        } else if (fileName.endsWith('.doc') && !fileName.endsWith('.docx')) {
            // DOC 解析（旧版 Word 二进制格式）
            const WordExtractor = (await import('word-extractor')).default;
            const extractor = new WordExtractor();
            const doc = await extractor.extract(buffer);
            text = doc.getBody() || '';
        } else {
            return NextResponse.json({ error: '不支持的文件格式' }, { status: 400 });
        }

        if (!text.trim()) {
            return NextResponse.json({ text: '', warning: '文件中未能提取到文本内容（可能是扫描件或图片PDF）' });
        }
        return NextResponse.json({ text });
    } catch (err) {
        console.error('parse-file error:', err);
        return NextResponse.json(
            { error: `解析失败：${err.message}` },
            { status: 500 }
        );
    }
}
