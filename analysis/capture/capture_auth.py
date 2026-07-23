# -*- coding: utf-8 -*-
"""认证态捕获：连 9223 的带界面实例，监听豆包网页版网络（含 SSE 流），
增量落盘到 phaseB_auth.json。不自动发消息——由用户在弹出的窗口里手动发送。"""
import json, time, os

OUT = "D:/Documents/AI_Work_Temp/Doubao-pp/capture"
os.makedirs(OUT, exist_ok=True)
URL = "https://www.doubao.com/chat/"
LISTEN_SECONDS = 280

records = {
    "meta": {"url": URL, "started_at": time.strftime("%Y-%m-%d %H:%M:%S")},
    "requests": [], "responses": [], "console": [], "pageerrors": [],
    "dom": None, "title": None, "cookies": [], "localStorage": {}, "fetch_bodies": [],
}

# 注入：包装 fetch，克隆响应体读全量（用于抓取 SSE 完整流），并记录请求体
INIT = r"""
(() => {
  window.__cap = window.__cap || [];
  const MAX = 2000000;
  const orig = window.fetch;
  window.fetch = function(...a){
    const [u, opt] = a;
    const url = (typeof u === 'string') ? u : (u && u.url);
    const method = (opt && opt.method) || 'GET';
    let reqBody = null;
    try { if (opt && opt.body) reqBody = (typeof opt.body === 'string') ? opt.body : String(opt.body); } catch(e){}
    return orig.apply(this, a).then(async (resp) => {
      try {
        const clone = resp.clone();
        let txt = '';
        try { txt = await clone.text(); } catch(e){ txt = '[read failed]'; }
        if (txt && txt.length > MAX) txt = txt.slice(0, MAX) + '...[trunc]';
        window.__cap.push({url, method, status: resp.status, reqBody, respBody: txt,
          contentType: (resp.headers && resp.headers.get && resp.headers.get('content-type')) || ''});
      } catch(e){}
      return resp;
    }).catch(err => { window.__cap.push({url, method, error: String(err)}); throw err; });
  };
})();
"""

def save():
    try:
        with open(os.path.join(OUT, "phaseB_auth.json"), "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2, default=str)
    except Exception as e:
        print("save err:", e)

def main():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp("http://127.0.0.1:9223")
        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page = context.new_page()
        page.add_init_script(INIT)

        def on_request(req):
            try: post = req.post_data
            except Exception: post = None
            records["requests"].append({"url": req.url, "method": req.method,
                "headers": dict(req.headers), "postData": post})
        def on_response(resp):
            records["responses"].append({"url": resp.url, "status": resp.status, "headers": dict(resp.headers)})
        def on_console(msg):
            records["console"].append({"type": msg.type, "text": msg.text[:6000]})
        def on_error(err):
            records["pageerrors"].append(str(err)[:6000])
        page.on("request", on_request)
        page.on("response", on_response)
        page.on("console", on_console)
        page.on("pageerror", on_error)

        try:
            page.goto(URL, wait_until="domcontentloaded", timeout=45000)
        except Exception as e:
            records["pageerrors"].append("goto: " + str(e)[:2000])
        save()

        # 增量监听
        steps = LISTEN_SECONDS // 10
        for i in range(steps):
            time.sleep(10)
            try:
                caps = page.evaluate("() => window.__cap || []")
                records["fetch_bodies"] = caps
            except Exception as e:
                records["pageerrors"].append("cap: " + str(e))
            try: records["title"] = page.title()
            except Exception: pass
            try: records["cookies"] = context.cookies()
            except Exception: pass
            try:
                records["localStorage"] = page.evaluate("""() => { const o={}; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); try{o[k]=localStorage.getItem(k);}catch(e){}} return o; }""")
            except Exception: pass
            save()
            print(f"[{i+1}/{steps}] reqs={len(records['requests'])} caps={len(records['fetch_bodies'])}")

        # 最终 DOM
        try: records["dom"] = page.content()
        except Exception as e: records["pageerrors"].append("dom: " + str(e))
        save()
        print("AUTH_CAPTURE_DONE reqs=%d caps=%d" % (len(records["requests"]), len(records["fetch_bodies"])))
        try: browser.close()
        except Exception: pass

if __name__ == "__main__":
    main()
