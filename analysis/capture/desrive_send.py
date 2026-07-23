# -*- coding: utf-8 -*-
"""连 9223，在已登录的豆包聊天页驱动发一条消息，捕获真实 SSE 流。
捕获脚本 capture_auth.py 仍在同一页面监听并把 window.__cap 落盘到 phaseB_auth.json，
本脚本额外把 SSE 体单独存到 phaseB_sse.json。"""
import json, time, os

OUT = "D:/Documents/AI_Work_Temp/Doubao-pp/capture"
os.makedirs(OUT, exist_ok=True)

def main():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp("http://127.0.0.1:9223")
        ctx = b.contexts[0] if b.contexts else b.new_context()
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        print("PAGE url=", page.url, "title=", page.title())
        # 找输入框
        info = page.evaluate("""() => {
            const all=[...document.querySelectorAll('textarea,input[type=text],div[contenteditable=true],[contenteditable=true]')];
            const vis=all.filter(e=>e.offsetParent!==null && e.clientHeight>8 && e.clientWidth>50);
            return vis.map(e=>({tag:e.tagName, cls:String(e.className).slice(0,80), ph:e.getAttribute('placeholder')||'', w:Math.round(e.clientWidth), h:Math.round(e.clientHeight)}));
        }""")
        print("INPUT候选:", json.dumps(info, ensure_ascii=False)[:800])
        if not info:
            print("未找到输入框，可能未登录或页面未就绪"); return
        # 选最后一个可见输入框（通常在底部）
        sel = "textarea"
        try:
            page.wait_for_selector(sel, timeout=8000, state="visible")
        except Exception:
            sel = None
        if sel:
            page.click(sel)
            page.fill(sel, "你好")
        else:
            # contenteditable
            box = page.evaluate("""() => {
                const all=[...document.querySelectorAll('div[contenteditable=true],[contenteditable=true]')];
                const vis=all.filter(e=>e.offsetParent!==null && e.clientHeight>8);
                if(!vis.length) return null; const el=vis[vis.length-1];
                el.focus(); return true;
            }""")
            page.keyboard.type("你好", delay=30)
        time.sleep(1)
        # 发送：优先点发送按钮，否则回车
        sent = False
        for lbl in ["发送", "send", "Send", "SEND"]:
            try:
                btn = page.query_selector(f"button[aria-label*='{lbl}']")
                if btn: btn.click(); sent=True; print("点发送按钮:", lbl); break
            except Exception: pass
        if not sent:
            try:
                # 常见发送按钮 class 含 send
                btn = page.query_selector("button.send, button.icon-send, [class*=send]")
                if btn: btn.click(); sent=True; print("点 class 含 send 的按钮")
            except Exception: pass
        if not sent:
            page.keyboard.press("Enter"); print("回车发送")
        print("已触发发送，等待 SSE ...")
        # 轮询 window.__cap，抓取含聊天流的体
        sse = []
        for i in range(12):
            time.sleep(3)
            caps = page.evaluate("() => window.__cap || []")
            for c in caps:
                b = str(c.get("respBody", ""))
                if any(k in b for k in ["2001","2002","2003","msg_type","event","conversation_id",'"content"',"samantha"]) and c not in sse:
                    sse.append(c)
            print(f"  [{i+1}] __cap={len(caps)} sse命中={len(sse)}")
            # 若已出现较长内容则提前结束
            if sse and any(len(str(x.get('respBody','')))>500 for x in sse):
                pass
        # 保存
        with open(os.path.join(OUT,"phaseB_sse.json"),"w",encoding="utf-8") as f:
            json.dump(sse, f, ensure_ascii=False, indent=2, default=str)
        print("SSE 捕获条数:", len(sse))
        for c in sse[:3]:
            print("URL:", c.get("url","")[:120], "status:", c.get("status"), "len:", len(str(c.get("respBody",""))))
            print("BODY前1200:", str(c.get("respBody",""))[:1200].replace("\n","\\n"))
        try: b.close()
        except Exception: pass

if __name__ == "__main__":
    main()
