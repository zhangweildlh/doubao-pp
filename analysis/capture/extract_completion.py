# -*- coding: utf-8 -*-
"""抽取：① /chat/completion 的【请求体】(postData)；② 完整 SSE 响应体（含内容事件）。"""
import json, os

CAP = "D:/Documents/AI_Work_Temp/Doubao-pp/capture"
auth = json.load(open(os.path.join(CAP, "phaseB_auth.json"), encoding="utf-8"))
sse = json.load(open(os.path.join(CAP, "phaseB_sse.json"), encoding="utf-8"))

print("=" * 90)
print("【A】/chat/completion 请求（发送体）")
print("=" * 90)
for r in auth.get("requests", []):
    if "/chat/completion" in r["url"]:
        print("METHOD:", r["method"])
        print("URL   :", r["url"][:200])
        pd = r.get("postData")
        print("POST_BODY:")
        try:
            obj = json.loads(pd) if pd else {}
            print(json.dumps(obj, ensure_ascii=False, indent=2)[:4000])
        except Exception:
            print((pd or "")[:4000])
        break

print("\n" + "=" * 90)
print("【B】完整 SSE 响应体（真实换行）")
print("=" * 90)
for i, c in enumerate(sse):
    print(f"\n--- SSE 体 #{i}  url={c.get('url','')[:140]}  status={c.get('status')} ---")
    body = c.get("respBody", "")
    # 还原真实换行便于阅读
    print(body.replace("\\n", "\n"))
