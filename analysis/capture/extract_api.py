# -*- coding: utf-8 -*-
"""抽取所有 `url:"/..."` API 路径 + 签名/SSE 关键片段。"""
import re, os, glob

JS_DIR = "D:/Documents/AI_Work_Temp/Doubao-pp/capture/js"
urls = {}
WIN = 240

files = sorted(glob.glob(os.path.join(JS_DIR, "*.js")))
for fp in files:
    name = os.path.basename(fp)
    text = open(fp, encoding="utf-8", errors="replace").read()
    # 1) 抽取 url:"/..." 与 cmd:XXX 与 uplinkKey
    for m in re.finditer(r'url:"(/[^"]*)"', text):
        u = m.group(1)
        urls.setdefault(u, set()).add(name)
    # 2) 签名 / bogus / signature 上下文
    for m in re.finditer(r'.{0,160}(a_bogus|X-Bogus|bogus|signature|sign_str|msToken|webId|web_id|verify_fp|tt_target_domain|wd_rtick).{0,160}', text):
        seg = m.group(0).replace("\n", " ")
        tag = "SIGN"
        print(f"[{tag}|{name}] …{seg}…")

print("\n" + "=" * 90)
print(f"API url 路径清单（共 {len(urls)} 条，按路径排序）：")
print("=" * 90)
for u in sorted(urls):
    print(f"  {u}   <- {','.join(sorted(urls[u]))}")
