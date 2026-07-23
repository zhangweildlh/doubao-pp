# -*- coding: utf-8 -*-
"""在 minified JS 中按关键词提取上下文片段，用于逆向豆包协议。"""
import re, os, glob

JS_DIR = "D:/Documents/AI_Work_Temp/Doubao-pp/capture/js"
WIN = 200  # 上下文窗口字符数
MAX_HITS = 12  # 每个模式每文件最多打印条数

PATTERNS = {
    "completions/stream_api": re.compile(r"completions?|/chat/|/aws_server|/alice/|streamGenerate|generateStream|/bot/|/agent/", re.I),
    "sse_event_code": re.compile(r"\b200[1-3]\b|msg_type|msgType|event_type|eventType"),
    "conv_fields": re.compile(r"conversation_id|conversationId|chat_id|chatId|message_id|messageId|section_id|sectionId|parent_msg|session_id"),
    "sign_anti": re.compile(r"a_bogus|x[-_]bogus|bogus|signature|sign\b|[_]signature|msToken|sessionid|web_id"),
    "endpoint_cfg": re.compile(r"baseURL|baseUrl|endpoint|/api/|doubao\.com|byteimg|snssdk|volcengine|getWay|bff"),
    "sse_proto": re.compile(r"event-stream|EventSource|fetchEventSource|text/event|onmessage|onopen|heartbeat|retry|ping"),
    "req_method": re.compile(r"requestAnimationFrame|fetch\(|XMLHttpRequest|axios|application/json|multipart"),
}

files = sorted(glob.glob(os.path.join(JS_DIR, "*.js")))
for fp in files:
    name = os.path.basename(fp)
    size = os.path.getsize(fp)
    print("\n" + "=" * 80)
    print(f"文件: {name}  ({size//1024} KB)")
    print("=" * 80)
    try:
        text = open(fp, encoding="utf-8", errors="replace").read()
    except Exception as e:
        print("读取失败:", e); continue
    for label, pat in PATTERNS.items():
        hits = list(pat.finditer(text))
        if not hits:
            continue
        print(f"\n--- 模式[{label}] 命中 {len(hits)} 处（展示前 {MAX_HITS}）---")
        for i, m in enumerate(hits[:MAX_HITS]):
            s = max(0, m.start() - WIN)
            e = min(len(text), m.end() + WIN)
            snippet = text[s:e]
            snippet = snippet.replace("\n", " ")
            print(f"  [{i}] ...{snippet}...")
