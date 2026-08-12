import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
    try {
        const pkgPath = join(process.cwd(), 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        return NextResponse.json(
            { version: pkg.version || '' },
            { headers: { 'Cache-Control': 'public, max-age=3600' } }
        );
    } catch {
        return NextResponse.json(
            { error: '无法读取当前版本号', code: 'CANNOT_READ_VERSION' },
            { status: 500 }
        );
    }
}
