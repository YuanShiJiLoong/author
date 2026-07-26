# -*- coding: utf-8 -*-
"""Author 桌面端 IndexedDB 离线数据抢救工具。

适用场景：用户卸载/重装后应用内看不到作品或快照，但
%APPDATA%\\author-app\\IndexedDB\\http_localhost_3000.indexeddb.leveldb（及同名 .blob 目录）
仍然存在。本脚本离线解析这些文件，把章节正文和快照导出成可读的 txt/html。

依赖（建议在虚拟环境中安装；Python 3.13 下直接 pip install dfindexeddb
会因编译 python-snappy/zstd 失败，按下面顺序装）：
    pip install "python-snappy>=0.7" zstd
    pip install --no-deps dfindexeddb

用法：
    双击运行（或不带参数）：交互模式 —— 可选自动扫描本机 / 选择备份 zip /
    选择数据文件夹，结果默认输出到桌面。

    命令行：python recover-indexeddb.py <来源> [输出目录]
    <来源> 可以是：
      - 备份压缩包 xxx.zip                             （自动解压后在里面找数据）
      - .../IndexedDB 或 .../author-app 等目录          （自动向下搜索数据目录）
      - .../http_localhost_3000.indexeddb.leveldb      （只解析这一个 origin）
    把 zip 或文件夹拖到 exe 图标上等同于第一个参数。
    输出目录默认为当前目录下的 recovered-output/。

安全性：只读源目录（leveldb 需复制到可写位置时请先自行复制），不修改任何原始数据。
强烈建议先把整个 IndexedDB 文件夹复制一份，对副本运行本脚本。
"""

import html
import json
import os
import re
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path

AUTHOR_KEY_PREFIXES = (
    "author-chapters",
    "author-snapshot-data-v2:",
    "author-snapshots-index-v2",
    "author-settings-nodes",
    "author-chat-sessions",
    "author-generation-archive",
    "author-works-index",
    "author-chapter-memory-groups",
)

TAG_RE = re.compile(r"<[^>]+>")


def strip_html(text):
    """粗略地把章节 HTML 转成纯文本（段落换行）。"""
    if not isinstance(text, str):
        return ""
    text = re.sub(r"</p\s*>|<br\s*/?>", "\n", text, flags=re.I)
    text = TAG_RE.sub("", text)
    return html.unescape(text).strip()


def safe_name(name, limit=60):
    name = re.sub(r'[\\/:*?"<>|\r\n]+', "_", str(name)).strip() or "untitled"
    return name[:limit]


def unwrap(value):
    """把 dfindexeddb 的类型包装（JSArray 等）还原成普通 Python 结构。

    兼容两种形态：JSONL 输出里的 {'__type__': 'JSArray', ...} 字典，
    以及直接调用库 API 时返回的 JSArray/JSSet 数据类实例。
    """
    tname = type(value).__name__
    if tname in ("JSArray", "JSSet") and hasattr(value, "values"):
        return [unwrap(v) for v in list(value.values)]
    if tname in ("Undefined", "Null"):
        return None
    if tname == "RegExp":
        return str(value)
    if isinstance(value, dict):
        t = value.get("__type__")
        if t == "JSArray":
            items = value.get("values", [])
            return [unwrap(v) for v in items]
        if t in ("JSDate",):
            return value.get("value")
        if "value" in value and t in ("IDBKey", "ObjectStoreDataValue"):
            return unwrap(value["value"])
        return {k: unwrap(v) for k, v in value.items() if k != "__type__"}
    if isinstance(value, list):
        return [unwrap(v) for v in value]
    return value


def run_dfindexeddb(leveldb_dir, jsonl_path):
    """进程内调用 dfindexeddb，把一个 leveldb 目录 dump 成 jsonl。

    不走子进程，这样 PyInstaller 打包成单文件 exe 后依然可用。
    """
    import contextlib

    from dfindexeddb.indexeddb import cli

    # 工具要求 .blob 目录必须存在；若是我们临时补建的空目录，用完即删，
    # 保证不在用户数据目录里留下任何痕迹。
    blob_dir = Path(str(leveldb_dir).replace(".leveldb", ".blob"))
    created_blob_dir = not blob_dir.exists()
    blob_dir.mkdir(exist_ok=True)
    print(f"[*] 解析 {leveldb_dir} ...")
    old_argv = sys.argv
    # 不加 --use_manifest：恢复模式，会把已删除记录和历史旧版本一并挖出来
    sys.argv = ["dfindexeddb", "db", "-s", str(leveldb_dir), "-f", "chrome",
                "--load_blobs", "-o", "jsonl"]
    # 解析器的技术性告警（Ignoring LOCK/LOG 等）写进日志文件，不刷屏
    stderr_log = Path(jsonl_path).with_name("_parse-log.txt")
    try:
        with open(jsonl_path, "w", encoding="utf-8") as out, \
                open(stderr_log, "w", encoding="utf-8") as errlog, \
                contextlib.redirect_stdout(out), \
                contextlib.redirect_stderr(errlog):
            cli.App()
    except SystemExit:
        pass
    except Exception as e:
        print(f"[!] dfindexeddb 解析出错：{type(e).__name__}: {e}（详见 {stderr_log}）")
    finally:
        sys.argv = old_argv
        if created_blob_dir:
            try:
                blob_dir.rmdir()  # 只能删空目录，不可能误删数据
            except OSError:
                pass
    return jsonl_path


def iter_records(jsonl_path):
    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            key = rec.get("key") or {}
            if key.get("__type__") != "ObjectStoreDataKey":
                continue
            user_key = (key.get("encoded_user_key") or {}).get("value")
            if not isinstance(user_key, str):
                continue
            yield user_key, rec


def make_work_index_entry(work_id, name, when_iso):
    return {
        "id": work_id,
        "name": name,
        "type": "work",
        "category": "work",
        "icon": "",
        "order": 0,
        "createdAt": when_iso,
        "updatedAt": when_iso,
    }


def write_import_archive(out_dir, chapters_by_work, settings_by_work=None,
                         works_index=None, chat_sessions=None, exported_at=None,
                         filename="Author_恢复存档.json"):
    """生成软件「读档」按钮可直接导入的 Author 存档 JSON。

    格式对应 app/lib/project-io.js 的 importProject()（v2）。
    """
    chapters_by_work = {k: v for k, v in (chapters_by_work or {}).items()
                        if isinstance(v, list) and v}
    if not chapters_by_work:
        return None
    when_iso = exported_at or datetime.now().isoformat()

    index = [w for w in (works_index or []) if isinstance(w, dict) and w.get("id")]
    known_ids = {w["id"] for w in index}
    for work_id in chapters_by_work:
        if work_id not in known_ids:
            index.append(make_work_index_entry(
                work_id, f"恢复的作品（{work_id}）", when_iso))

    archive = {
        "_app": "Author",
        "_version": 2,
        "_exportedAt": when_iso,
        "_recoveredBy": "recover-indexeddb",
        "activeWork": next(iter(chapters_by_work)),
        "worksIndex": index,
        "perWorkChapters": chapters_by_work,
        "perWorkSettings": {k: v for k, v in (settings_by_work or {}).items()
                            if isinstance(v, list)},
    }
    if chat_sessions:
        archive["chatSessions"] = chat_sessions

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / filename
    path.write_text(json.dumps(archive, ensure_ascii=False, default=str),
                    encoding="utf-8")
    return path


def snapshot_import_archive(snap_dir, snapshot_value):
    """从一份完整快照生成导入存档。"""
    data = snapshot_value.get("data") if isinstance(snapshot_value, dict) else None
    if not isinstance(data, dict):
        return None
    work_id = data.get("workId") or "work-default"
    ts = snapshot_value.get("timestamp")
    when = (datetime.fromtimestamp(ts / 1000).isoformat() if ts else None)
    return write_import_archive(
        snap_dir,
        {work_id: data.get("chapters") or []},
        settings_by_work={work_id: data.get("settingsNodes") or []},
        works_index=data.get("worksIndex"),
        chat_sessions=data.get("chatSessions"),
        exported_at=when,
    )


def dump_chapters(chapters, out_dir):
    """把章节数组导出为 txt + html，返回统计信息。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    total_chars = 0
    for i, ch in enumerate(chapters or []):
        if not isinstance(ch, dict):
            continue
        title = safe_name(ch.get("title") or f"chapter-{i + 1}")
        content = ch.get("content") or ""
        text = strip_html(content)
        total_chars += len(text)
        base = out_dir / f"{i + 1:03d}-{title}"
        base.with_suffix(".txt").write_text(text, encoding="utf-8")
        if isinstance(content, str) and content.strip():
            base.with_suffix(".html").write_text(content, encoding="utf-8")
    return total_chars


def extract(jsonl_path, out_root):
    """返回 (是否提取到数据, 未解析的外置 blob 引用数)。"""
    # 同一个键可能有多个历史版本（不同 sequence_number），全部保留，
    # 序号最大的标记为 latest。
    by_key = {}
    unresolved_blob_refs = 0
    for user_key, rec in iter_records(jsonl_path):
        if not user_key.startswith(AUTHOR_KEY_PREFIXES):
            continue
        rv = rec.get("value")
        if isinstance(rv, dict) and rv.get("blob_size") and rv.get("value") is None:
            # 值被外置到 .blob 文件、JSONL 里只有引用桩 —— 交给孤儿 blob 扫描
            unresolved_blob_refs += 1
            continue
        by_key.setdefault(user_key, []).append(rec)

    if unresolved_blob_refs:
        print(f"[*] 有 {unresolved_blob_refs} 条记录的值外置在 .blob 文件里，稍后用 blob 扫描恢复")
    if not by_key:
        print("[!] leveldb 里没有可直接读出的 author-* 数据键。")
        return False, unresolved_blob_refs

    summary = []
    latest_values = {}
    for user_key, recs in sorted(by_key.items()):
        recs.sort(key=lambda r: r.get("sequence_number") or 0)
        seen = set()
        for idx, rec in enumerate(recs):
            seq = rec.get("sequence_number") or 0
            if (user_key, seq) in seen:
                continue
            seen.add((user_key, seq))
            is_latest = idx == len(recs) - 1
            raw_value = rec.get("value")
            if raw_value is None:
                continue  # 已删除/残缺记录，没有可恢复的值
            value = unwrap(raw_value)
            if value is None:
                continue
            if is_latest:
                latest_values[user_key] = value
            label = "latest" if is_latest else f"seq{seq}"
            key_dir = out_root / safe_name(user_key, 80) / label

            if user_key.startswith("author-chapters"):
                chapters = value if isinstance(value, list) else []
                chars = dump_chapters(chapters, key_dir)
                summary.append(f"{user_key} [{label}] 章节 {len(chapters)} 个，约 {chars} 字")
            elif user_key.startswith("author-snapshot-data-v2:"):
                data = value.get("data") if isinstance(value, dict) else None
                chapters = (data or {}).get("chapters") or []
                ts = value.get("timestamp") if isinstance(value, dict) else None
                when = datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d_%H%M") if ts else "unknown"
                snap_label = value.get("label") if isinstance(value, dict) else ""
                snap_dir = out_root / "snapshots" / f"{when}-{safe_name(snap_label)}-{label}"
                chars = dump_chapters(chapters, snap_dir)
                snapshot_import_archive(snap_dir, value)
                summary.append(f"快照 {when}（{snap_label}）[{label}] 章节 {len(chapters)} 个，约 {chars} 字")
            else:
                key_dir.mkdir(parents=True, exist_ok=True)
                (key_dir / "value.json").write_text(
                    json.dumps(value, ensure_ascii=False, indent=1, default=str),
                    encoding="utf-8")
                summary.append(f"{user_key} [{label}] -> value.json")

    # 用各键的最新值合成一份「最新状态」导入存档（覆盖所有作品）
    chapters_by_work = {}
    settings_by_work = {}
    for key, value in latest_values.items():
        if key.startswith("author-chapters-"):
            chapters_by_work[key[len("author-chapters-"):]] = value
        elif key.startswith("author-settings-nodes-"):
            settings_by_work[key[len("author-settings-nodes-"):]] = value
    combined = write_import_archive(
        out_root, chapters_by_work, settings_by_work,
        works_index=latest_values.get("author-works-index"),
        chat_sessions=latest_values.get("author-chat-sessions"),
        filename="Author_恢复存档_最新状态.json",
    )
    if combined:
        summary.append(f"最新状态导入包 -> {combined.name}")

    report = out_root / "REPORT.txt"
    report.write_text("\n".join(summary), encoding="utf-8")
    print(f"[*] 完成，共 {len(summary)} 条记录，明细见 {report}")
    return bool(summary), unresolved_blob_refs


def scan_orphan_blobs(blob_dir, out_root):
    """保底路径：leveldb 记录缺失时，直接逐个解析 .blob 目录里的文件。"""
    try:
        from dfindexeddb.indexeddb.chromium import blink
    except ImportError:
        print("[!] 无法 import dfindexeddb，跳过孤儿 blob 扫描。")
        return
    files = [p for p in Path(blob_dir).rglob("*") if p.is_file()]
    print(f"[*] 孤儿 blob 扫描：{blob_dir} 下共 {len(files)} 个文件")
    ok = 0
    for p in sorted(files, key=lambda p: p.stat().st_size, reverse=True):
        try:
            value = blink.V8ScriptValueDecoder.FromBytes(p.read_bytes())
        except Exception as e:
            print(f"    [x] {p.name}（{p.stat().st_size // 1024}KB）解析失败: {type(e).__name__}: {e}")
            continue
        value = unwrap(value)
        ok += 1
        dest = out_root / "orphan-blobs" / p.name
        if isinstance(value, dict) and "data" in value and isinstance(value.get("data"), dict):
            chapters = value["data"].get("chapters") or []
            chars = dump_chapters(chapters, dest)
            snapshot_import_archive(dest, value)
            print(f"    [ok] {p.name} -> 疑似快照，章节 {len(chapters)} 个，约 {chars} 字")
        elif isinstance(value, list):
            chars = dump_chapters(value, dest)
            print(f"    [ok] {p.name} -> 疑似章节数组 {len(value)} 个，约 {chars} 字")
        else:
            dest.mkdir(parents=True, exist_ok=True)
            (dest / "value.json").write_text(
                json.dumps(value, ensure_ascii=False, indent=1, default=str)[:50_000_000],
                encoding="utf-8")
            print(f"    [ok] {p.name} -> value.json")
    print(f"[*] 孤儿 blob 扫描完成：成功 {ok}/{len(files)}")


def find_default_source():
    """自助模式：自动定位 Author 桌面端的 IndexedDB 目录。"""
    appdata = os.environ.get("APPDATA", "")
    candidates = [
        Path(appdata) / "author-app" / "IndexedDB",
        Path(appdata) / "Author" / "IndexedDB",
    ]
    for c in candidates:
        if c.is_dir() and (list(c.glob("*.indexeddb.leveldb"))
                           or list(c.glob("*.indexeddb.blob"))):
            return c
    return None


def default_output_dir():
    desktop = Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Desktop"
    base = desktop if desktop.is_dir() else Path.cwd()
    return base / "Author数据恢复结果"


def pause_if_interactive(interactive):
    if interactive:
        try:
            input("\n按回车键退出...")
        except EOFError:
            pass


def _pick_with_dialog(kind):
    """弹系统文件选择框；tkinter 不可用时返回 None（调用方回退为手输）。"""
    try:
        import tkinter
        from tkinter import filedialog
        root = tkinter.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        if kind == "zip":
            path = filedialog.askopenfilename(
                title="选择备份压缩包",
                filetypes=[("Zip 压缩包", "*.zip"), ("所有文件", "*.*")])
        else:
            path = filedialog.askdirectory(title="选择文件夹")
        root.destroy()
        return Path(path) if path else None
    except Exception:
        return None


def _ask_path(prompt):
    raw = input(prompt).strip().strip('"').strip("'")
    return Path(raw) if raw else None


def find_idb_sources(root):
    """在任意目录下（含子目录）找出所有包含 *.indexeddb.* 的数据目录。"""
    root = Path(root)
    if list(root.glob("*.indexeddb.leveldb")) or list(root.glob("*.indexeddb.blob")):
        return [root]
    hits = set()
    for pattern in ("*.indexeddb.leveldb", "*.indexeddb.blob"):
        for p in root.rglob(pattern):
            hits.add(p.parent)
    return sorted(hits)


def extract_zip(zip_path, out_root):
    """把备份 zip 解压到输出目录下的临时文件夹，返回解压路径。"""
    tmp = Path(out_root) / "_tmp_unzip"
    if tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"[*] 正在解压 {Path(zip_path).name} ...（大文件可能要几分钟）")
    try:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(tmp)
    except zipfile.BadZipFile:
        print("[!] 这个文件不是有效的 zip 压缩包，或已损坏。")
        return None
    return tmp


def choose_source_interactive():
    """交互模式：让用户选数据来源，返回 Path（zip 文件或目录）。"""
    print("请选择数据来源：")
    print("  1. 自动扫描本机的 Author 数据（默认，直接回车）")
    print("  2. 选择之前备份的 zip 压缩包")
    print("  3. 手动选择数据文件夹")
    choice = input("输入 1/2/3 后回车: ").strip() or "1"

    if choice == "2":
        src = _pick_with_dialog("zip") or _ask_path("请输入压缩包完整路径: ")
        if not src or not src.is_file():
            print("[!] 没有选择有效的压缩包。")
            return None
        return src
    if choice == "3":
        src = _pick_with_dialog("dir") or _ask_path("请输入数据文件夹完整路径: ")
        if not src or not src.is_dir():
            print("[!] 没有选择有效的文件夹。")
            return None
        return src

    src = find_default_source()
    if not src:
        print("[!] 没有在这台电脑上找到 Author 的数据目录")
        print(r"    （找过 %APPDATA%\author-app\IndexedDB）。")
        print("    如果数据在压缩包或别的文件夹里，重新运行后选 2 或 3。")
        return None
    print(f"[*] 找到数据目录：{src}")
    return src


def choose_output_interactive():
    out_root = default_output_dir()
    ans = input(f"\n结果将保存到：{out_root}\n直接回车确认，或输入 s 选择其他位置: ").strip().lower()
    if ans == "s":
        picked = _pick_with_dialog("dir") or _ask_path("请输入保存位置完整路径: ")
        if picked:
            out_root = Path(picked) / "Author数据恢复结果"
    return out_root


def process_source(src, out_root):
    """解析一个数据目录（含多个 origin）或单个 origin 目录。"""
    src = Path(src)
    # 每个 origin 由 .leveldb（账本）和 .blob（大文件）两个目录组成。
    # 账本可能已被卸载程序删掉，所以两种目录都要作为线索收集起来。
    if src.name.endswith(".indexeddb.leveldb"):
        leveldbs = [src]
    elif src.name.endswith(".indexeddb.blob"):
        leveldbs = [Path(str(src).replace(".indexeddb.blob", ".indexeddb.leveldb"))]
    else:
        stems = {str(p) for p in src.glob("*.indexeddb.leveldb")}
        stems.update(str(p).replace(".indexeddb.blob", ".indexeddb.leveldb")
                     for p in src.glob("*.indexeddb.blob"))
        leveldbs = sorted(Path(s) for s in stems)
    if not leveldbs:
        print(f"[!] {src} 下没有找到 *.indexeddb.leveldb / *.indexeddb.blob 目录")
        return False

    for lv in leveldbs:
        origin = lv.name.replace(".indexeddb.leveldb", "")
        origin_out = out_root / safe_name(origin, 80)
        origin_out.mkdir(parents=True, exist_ok=True)
        got, unresolved = False, 0
        if lv.is_dir():
            jsonl = origin_out / "_dump.jsonl"
            run_dfindexeddb(lv, jsonl)
            if jsonl.exists() and jsonl.stat().st_size:
                got, unresolved = extract(jsonl, origin_out)
        else:
            print(f"[!] {lv.name} 不存在（账本已丢失），直接扫描残留的 blob 文件")
        blob_dir = Path(str(lv).replace(".leveldb", ".blob"))
        if (not got or unresolved) and blob_dir.is_dir():
            scan_orphan_blobs(blob_dir, origin_out)
    return True


def main():
    if os.environ.get("AUTHOR_RECOVER_SMOKE") == "1":
        # 打包自检：确认文件选择框依赖（tkinter）被正确打进 exe
        import tkinter
        print(f"smoke-ok tkinter {tkinter.TkVersion}")
        return

    interactive = len(sys.argv) < 2
    should_pause = interactive or getattr(sys, "frozen", False)

    if interactive:
        print("=" * 56)
        print(" Author 数据恢复工具（离线运行，不上传任何数据）")
        print("=" * 56)
        print("[提示] 运行前请先完全退出 Author（包括右下角托盘图标）。\n")
        src = choose_source_interactive()
        if not src:
            pause_if_interactive(should_pause)
            sys.exit(1)
        out_root = choose_output_interactive()
    else:
        src = Path(sys.argv[1])
        out_root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("recovered-output")

    out_root.mkdir(parents=True, exist_ok=True)

    # zip 来源：先解压到输出目录下的临时文件夹，结束后删掉这个临时副本
    tmp_extract = None
    if src.is_file() and src.suffix.lower() == ".zip":
        tmp_extract = extract_zip(src, out_root)
        if not tmp_extract:
            pause_if_interactive(should_pause)
            sys.exit(1)
        sources = find_idb_sources(tmp_extract)
        if not sources:
            print("[!] 压缩包里没有找到 Author 的数据目录（*.indexeddb.*）。")
            print("    请确认压缩的是 author-app 或 IndexedDB 文件夹。")
            shutil.rmtree(tmp_extract, ignore_errors=True)
            pause_if_interactive(should_pause)
            sys.exit(1)
    elif src.is_dir() and not src.name.endswith((".indexeddb.leveldb", ".indexeddb.blob")):
        sources = find_idb_sources(src)
        if not sources:
            print(f"[!] {src} 下（含子目录）没有找到 Author 的数据目录（*.indexeddb.*）。")
            pause_if_interactive(should_pause)
            sys.exit(1)
    else:
        sources = [src]

    ok = False
    for s in sources:
        if len(sources) > 1:
            print(f"\n===== 数据目录：{s} =====")
        ok = process_source(s, out_root) or ok

    if tmp_extract:
        shutil.rmtree(tmp_extract, ignore_errors=True)

    print(f"\n[*] 全部完成。输出目录：{out_root.resolve()}")
    print("[*] 章节正文见各 origin 目录下 author-chapters*/ 与 snapshots/ 中的 .txt 文件。")
    print("[*] 每个 REPORT.txt 里列了各份数据的章节数和字数，挑最新、字数最多的用。")
    pause_if_interactive(should_pause)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        import traceback
        traceback.print_exc()
        pause_if_interactive(getattr(sys, "frozen", False))
        sys.exit(1)
