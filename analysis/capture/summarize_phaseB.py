# -*- coding: utf-8 -*-
"""解析 phaseB_auth.json：统计请求/响应/SSE 体/cookie/localStorage，
并挑出豆包 API（/im/ /alice/ sse 体）做摘要。"""
import json, os

F = "D:/Documents/AI_Work_Temp/Doubao-pp/capture/phaseB_auth.json"
if not os.path.exists(F):
    print("NO_FILE: phaseB_auth.json 尚不存在")
    raise SystemExit

d = json.load(open(F, encoding="utf-8"))
print("requests       :", len(d.get("requests", [])))
print("responses      :", len(d.get("responses", [])))
print("fetch_bodies   :", len(d.get("fetch_bodies", [])))
print("cookies        :", len(d.get("cookies", [])))
print("localStorage   :", len(d.get("localStorage", {})))
print("console        :", len(d.get("console", [])))
print("pageerrors     :", len(d.get("pageerrors", [])))
print("title          :", d.get("title"))
print("-" * 80)

# 1) 豆包 API 请求
print(">>> 豆包相关 API 请求（/im/ /alice/ sse/samantha）：")
seen = set()
for r in d.get("requests", []):
    u = r["url"]
    if any(k in u for k in ["/im/", "/alice/", "/biz/", "samantha", "doubao.com/api"]):
        key = u.split("?")[0]
        if key in seen:
            continue
        seen.add(key)
        print(f"  [{r['method']}] {u[:150]}")

# 2) SSE 风格响应体
print("\n>>> 疑似 SSE/聊天流 响应体（含 2001/msg_type/event/content/conversation）：")
for fb in d.get("fetch_bodies", []):
    b = str(fb.get("respBody", ""))
    if any(k in b for k in ["2001", "2002", "2003", "msg_type", "event", "conversation_id", '"content"', "samantha"]):
        print(f"  URL={fb.get('url','')[:120]} status={fb.get('status')} len={len(b)}")
        print("   BODY前900:", b[:900].replace("\n", "\\n"))
        print("   ...")

# 3) cookie 域名
print("\n>>> Cookie 域名分布：")
from collections import Counter
c = Counter(x.get("domain", "?") for x in d.get("cookies", []))
for dom, n in c.most_common(15):
    print(f"  {n:3d}  {dom}")

# 4) localStorage 关键键
print("\n>>> localStorage 关键键（含 doubao/web_id/token/session）：")
for k in d.get("localStorage", {}):
    if any(t in k.lower() for t in ["doubao", "web_id", "token", "session", "uid", "samantha", "user", "cookie", "login", "passport"]):
        v = str(d["localStorage"][k])
        print(f"  {k} = {v[:160]}")
