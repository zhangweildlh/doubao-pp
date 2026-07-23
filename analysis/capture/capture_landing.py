# -*- coding: utf-8 -*-
"""通过 CDP 连接已运行的 360Chrome，捕获豆包网页版落地页的
网络请求/响应、DOM、Cookie、localStorage，供协议逆向分析。"""
import json, time, os, sys

OUT = "D:/Documents/AI_Work_Temp/Doubao-pp/capture"
os.makedirs(OUT, exist_ok=True)
URL = "https://www.doubao.com/chat/"

records = {
    "meta": {"url": URL, "captured_at": time.strftime("%Y-%m-%d %H:%M:%S")},
    "requests": [],
    "responses": [],
    "console": [],
    "pageerrors": [],
    "js_bundles": [],
    "fetch_bodies": [],
    "dom": None,
    "title": None,
    "cookies": [],
    "localStorage": {},
}

# 注入：包装 fetch/XHR，捕获 API 响应体（用于分析请求/响应协议）
INIT = r"""
(() => {
  const MAX = 200000;
  function record(tag, data){
    try { window.__cap = window.__cap || []; window.__cap.push({tag, data}); } catch(e){}
  }
  const origFetch = window.fetch;
  window.fetch = function(...args){
    const [u, opt] = args;
    const url = (typeof u === 'string') ? u : (u && u.url);
    const method = (opt && opt.method) || 'GET';
    let body = null;
    try { if(opt && opt.body){ body = (typeof opt.body === 'string') ? opt.body : String(opt.body); } } catch(e){}
    return origFetch.apply(this, args).then(async (resp) => {
      try {
        const clone = resp.clone();
        let txt = '';
        try { txt = await clone.text(); } catch(e){ txt = '[read body failed]'; }
        if (txt && txt.length > MAX) txt = txt.slice(0, MAX) + '...[truncated]';
        record('fetch', {url, method, status: resp.status, reqBody: body, respBody: txt});
      } catch(e){}
      return resp;
    }).catch(err => { record('fetcherr', {url, method, err: String(err)}); throw err; });
  };
  const OrigXHR = window.XMLHttpRequest;
  // 保持简单：仅 hook open/send 记录请求，响应体较难同步读取，略过
})();
"""

def main():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page = context.new_page()
        page.add_init_script(INIT)

        def on_request(req):
            try: post = req.post_data
            except Exception: post = None
            records["requests"].append({
                "url": req.url, "method": req.method,
                "headers": dict(req.headers), "postData": post,
            })
        def on_response(resp):
            rec = {"url": resp.url, "status": resp.status, "headers": dict(resp.headers)}
            records["responses"].append(rec)
            if resp.url.split("?")[0].endswith(".js"):
                if resp.url not in records["js_bundles"]:
                    records["js_bundles"].append(resp.url)
        def on_console(msg):
            records["console"].append({"type": msg.type, "text": msg.text[:4000]})
        def on_error(err):
            records["pageerrors"].append(str(err)[:4000])

        page.on("request", on_request)
        page.on("response", on_response)
        page.on("console", on_console)
        page.on("pageerror", on_error)

        try:
            page.goto(URL, wait_until="domcontentloaded", timeout=45000)
        except Exception as e:
            records["pageerrors"].append("goto exception: " + str(e)[:2000])
        time.sleep(12)

        try: records["title"] = page.title()
        except Exception as e: records["pageerrors"].append("title: " + str(e))
        try: records["dom"] = page.content()
        except Exception as e: records["pageerrors"].append("dom: " + str(e))
        try: records["cookies"] = context.cookies()
        except Exception as e: records["pageerrors"].append("cookies: " + str(e))
        try:
            records["localStorage"] = page.evaluate("""() => {
                const o = {};
                for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i);
                  try { o[k] = localStorage.getItem(k); } catch(e){} }
                return o;
            }""")
        except Exception as e: records["pageerrors"].append("localStorage: " + str(e))
        # 读取注入捕获的 fetch 响应体
        try:
            caps = page.evaluate("() => window.__cap || []")
            records["fetch_bodies"] = caps
        except Exception as e: records["pageerrors"].append("cap: " + str(e))

        with open(os.path.join(OUT, "phaseA_landing.json"), "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2, default=str)

        print("DONE requests=%d responses=%d js=%d console=%d dom_len=%d" % (
            len(records["requests"]), len(records["responses"]),
            len(records["js_bundles"]), len(records["console"]),
            len(records["dom"] or "")))
        browser.close()

if __name__ == "__main__":
    main()
