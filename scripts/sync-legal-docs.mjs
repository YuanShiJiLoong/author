// 构建前把仓库根目录的法律文档(PRIVACY/TERMS 各语言 md)渲染成自带排版的 HTML,
// 输出到 public/legal/。应用内"服务条款/隐私政策"链接直接打开这些内置文件:
// 桌面/自部署下是本机文件(零外部依赖、可离线),官方网页版仅消耗一次约 10KB 的静态请求。
// 由 predev / prebuild / electron:build 自动执行;产物已 gitignore,源文件以根目录 md 为准。
import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';

const root = process.cwd();
const outDir = path.join(root, 'public', 'legal');
const md = new MarkdownIt({ html: false, linkify: true });

const DOCS = ['PRIVACY', 'TERMS'];
const LANGS = [
    { suffix: '', htmlLang: 'en', dir: 'ltr' },
    { suffix: '.zh', htmlLang: 'zh-CN', dir: 'ltr' },
    { suffix: '.ru', htmlLang: 'ru', dir: 'ltr' },
    { suffix: '.ar', htmlLang: 'ar', dir: 'rtl' },
];

const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0 auto; padding: 32px 20px 80px; max-width: 780px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  line-height: 1.75; font-size: 15px; color: #24292f; background: #ffffff;
  overflow-wrap: break-word;
}
h1 { font-size: 24px; border-bottom: 1px solid #d0d7de; padding-bottom: 10px; }
h2 { font-size: 19px; margin-top: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 6px; }
h3 { font-size: 16px; margin-top: 1.6em; }
a { color: #0969da; text-decoration: none; }
a:hover { text-decoration: underline; }
blockquote { margin: 1em 0; padding: 8px 16px; border-left: 4px solid #d0d7de; background: #f6f8fa; color: #57606a; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; display: block; overflow-x: auto; }
th, td { border: 1px solid #d0d7de; padding: 6px 12px; text-align: left; }
th { background: #f6f8fa; }
hr { border: none; border-top: 1px solid #d0d7de; margin: 2em 0; }
code { background: #f6f8fa; padding: 2px 5px; border-radius: 4px; font-size: 13px; }
@media (prefers-color-scheme: dark) {
  body { color: #d4d4d4; background: #1b1b1d; }
  h1 { border-color: #3a3a3d; } h2 { border-color: #2e2e31; }
  a { color: #58a6ff; }
  blockquote { border-color: #3a3a3d; background: #232326; color: #9a9aa0; }
  th, td { border-color: #3a3a3d; } th { background: #232326; }
  code { background: #232326; }
}
`;

fs.mkdirSync(outDir, { recursive: true });
let count = 0;

for (const doc of DOCS) {
    for (const lang of LANGS) {
        const srcName = `${doc}${lang.suffix}.md`;
        const srcPath = path.join(root, srcName);
        if (!fs.existsSync(srcPath)) continue;

        const raw = fs.readFileSync(srcPath, 'utf8');
        let body = md.render(raw);
        // 文档间的相互链接(语言导航、条款↔政策引用)改指向同目录生成的 html 版本
        body = body.replace(/href="(PRIVACY|TERMS)((?:\.[a-z]{2})?)\.md"/g, 'href="$1$2.html"');

        const titleMatch = raw.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : srcName;

        const page = `<!DOCTYPE html>
<html lang="${lang.htmlLang}" dir="${lang.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>
`;
        fs.writeFileSync(path.join(outDir, `${doc}${lang.suffix}.html`), page);
        count += 1;
    }
}

console.log(`[sync-legal-docs] 已生成 ${count} 个法律文档页面 → public/legal/`);
