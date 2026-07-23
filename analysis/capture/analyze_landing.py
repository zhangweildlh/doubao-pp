# -*- coding: utf-8 -*-
"""从 phaseA_landing.json 提炼：API 主机、关键路径请求、JS 包、控制台/localStorage 线索。"""
import json, re
from urllib.parse import urlparse
from collections import Counter

F = "D:/Documents/AI_Work_Temp/Doubao-pp/capture/phaseA_landing.json"
data = json.load(open(F, encoding="utf-8"))

reqs = data.get("requests", [])
resps = data.get("responses", [])
console = data.get("console", [])
ls = data.get("localStorage", {})
js = data.get("js_bundles", [])
fbs = data.get("fetch_bodies", [])

# 1) 主机分布
hosts = Counter()
for r in reqs:
    try: hosts[urlparse(r["url"]).netloc] += 1
    except Exception: pass
print("=== 请求主机分布（Top 30）===")
for h, c in hosts.most_common(30):
    print(f"  {c:4d}  {h}")

# 2) 疑似 API / 流式 / 聊天 相关请求
kw = re.compile(r"(api|chat|complet|sse|stream|conversation|message|generate|llm|bot|agent|session|auth|token|login|user|account)", re.I)
print("\n=== 疑似 API/聊天/认证 相关请求（去重 URL）===")
seen = set()
for r in reqs:
    u = r["url"]
    if kw.search(u):
        key = u.split("?")[0]
        if key not in seen:
            seen.add(key)
            print(f"  [{r['method']}] {u[:160]}")

# 3) JS 包清单（前 60）
print(f"\n=== JS 包数量: {len(js)}，示例（前 40）===")
for j in js[:40]:
    print("  " + j[:160])

# 4) 控制台
print(f"\n=== 控制台消息: {len(console)} ===")
for c in console[:20]:
    print(f"  [{c.get('type')}] {c.get('text','')[:300]}")

# 5) localStorage 键
print(f"\n=== localStorage 键: {len(ls)} ===")
for k in list(ls.keys())[:60]:
    v = str(ls[k])
    print(f"  {k} = {v[:120]}")

# 6) 注入捕获的 fetch 响应体（未登录可能为空）
print(f"\n=== 注入捕获的 fetch 响应体条数: {len(fbs)} ===")
for fb in fbs[:10]:
    print("  ", json.dumps(fb, ensure_ascii=False)[:400])
