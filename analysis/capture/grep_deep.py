# -*- coding: utf-8 -*-
"""精准提取豆包流式对话端点、SSE 帧解析、反爬签名。"""
import re, os

JS_DIR = "D:/Documents/AI_Work_Temp/Doubao-pp/capture/js"
WIN = 260

targets = {
    "A_流式对话端点(url/cmd)": re.compile(r"url:\"(/[^\"]*(chat|completion|samantha|bot|agent|conversation|message|generate|v2|v1)[^\"]*)\"|cmd:[A-Z_]{4,}|uplinkKey:\"[^\"]+\""),
    "B_SSE帧解析(getReader/decode/event-stream/data)": re.compile(r"getReader|ReadableStream|new TextDecoder|event-stream|text/event|\"data\"|onmessage|\.data\b|EventSource|fetchEventSource"),
    "C_反爬签名(a_bogus/X-Bogus/signature/msToken/webId)": re.compile(r"a_bogus|X-Bogus|bogus|signature|sign_str|msToken|webId|web_id|wd_rtick|verify_fp|tt_target_domain|a_bogus|signedParams|genBogus"),
    "D_请求体关键字段(content/prompt/messages/model)": re.compile(r"\"content\"|\"prompt\"|\"messages\"|\"model\"|\"bot_id\"|\"scene\"|\"search_mode\"|\"stream\"|\"version\"|\"language\""),
    "E_流式读取循环(while/for reader)": re.compile(r"while\([^)]*\)|for\([^)]*read|await[^;]{0,80}read\(\)|done:|value:"),
}

files = ["chat.js", "conversation-service.js", "im-chat-l0.js", "infra-message.js", "skill-msg-lifecycle.js"]
for fname in files:
    fp = os.path.join(JS_DIR, fname)
    if not os.path.exists(fp): 
        print(f"\n[跳过] 无 {fname}"); continue
    text = open(fp, encoding="utf-8", errors="replace").read()
    print("\n" + "#" * 90)
    print(f"# 文件 {fname} ({len(text)//1024} KB)")
    print("#" * 90)
    for label, pat in targets.items():
        hits = list(pat.finditer(text))
        if not hits:
            continue
        print(f"\n>> {label}  命中 {len(hits)}")
        for i, m in enumerate(hits[:8]):
            s = max(0, m.start() - WIN)
            e = min(len(text), m.end() + WIN)
            snip = text[s:e].replace("\n", " ")
            print(f"   [{i}] …{snip}…")
