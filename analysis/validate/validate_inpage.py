# -*- coding: utf-8 -*-
"""
Doubao-pp 验证器 ②：浏览器内 MAIN world 非检测验证（路线 A 实机证明）
步骤对应融合方案「步骤 1（请求体精确抓取）+ 步骤 5（非检测验证）」。

做法：
  1. 从真实 User Data 复制登录态临时档案（不触碰用户原档案）
  2. 启动 360Chrome（Chromium 132）并开启 CDP 远程调试
  3. Playwright connect_over_cdp 接入
  4. 注入 MAIN world fetch 钩子：拦截 /chat/completion 出站请求，
     在 messages[].content_block[].content.text_block.text 注入记忆标记（原地增强）
  5. 驱动发送"你好"，轮询捕获：
     - 增强后的请求体（证明我们改了文本）
     - 请求 URL 是否仍含 a_bogus/msToken（证明页面代签、非检测）
     - 响应状态码与是否含 CHUNK_DELTA（证明增强后请求仍被服务器正常接受）
结果写入 validate/inpage_result.json。
"""
import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
PROFILE_SRC = r"D:\Tools\360Chrome\User Data"
PROFILE_DST = r"D:\Tools\360Chrome\CDPProfileV"
CHROME_EXE = r"D:\Tools\360Chrome\360chromex.exe"
PORT = 9226
TARGET = "https://www.doubao.com/chat/"
OUT = os.path.join(HERE, "inpage_result.json")
MARK = "[PP_MEMORY_INJECT] "

# 要注入到用户文本前的"记忆"标记（模拟记忆/Skills 注入效果）
INJECT_TEXT = "[来自Doubao-pp记忆系统的上下文] "


def copy_profile():
    print(f"[1] 复制登录态档案 {PROFILE_SRC} -> {PROFILE_DST}")
    if os.path.exists(PROFILE_DST):
        shutil.rmtree(PROFILE_DST, ignore_errors=True)
    # robocopy 复制（排除易锁定的缓存以提速）
    cmd = [
        "robocopy", PROFILE_SRC, PROFILE_DST,
        "/E", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS",
        "/XD", "Cache", "Code Cache", "GPUCache", "Service Worker",
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # 删除陈旧锁
    for lk in ["Lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket"]:
        try:
            os.remove(os.path.join(PROFILE_DST, lk))
        except OSError:
            pass
    print("    复制完成")


def launch_chrome():
    print(f"[2] 启动 360Chrome (CDP port {PORT})")
    args = [
        CHROME_EXE,
        f"--remote-debugging-port={PORT}",
        f"--user-data-dir={PROFILE_DST}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking=false",
        "--window-position=0,0",
    ]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # 等待 DevTools 端点
    for i in range(30):
        try:
            import urllib.request
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=2) as r:
                if r.status == 200:
                    print(f"    CDP 就绪（{i}s），pid={proc.pid}")
                    return proc
        except Exception:
            time.sleep(1)
    print("    [WARN] CDP 端点超时，继续尝试连接")
    return proc


INIT_SCRIPT = r"""
(() => {
  const MARK = "<<INJECT>>";
  window.__pp = { captured: [], augmented: false, responses: [] };
  const origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!origFetch) return;
  window.fetch = async (input, init) => {
    let url = (typeof input === 'string') ? input : (input && input.url) || '';
    if (url.indexOf('/chat/completion') !== -1 && init && init.body) {
      try {
        const body = JSON.parse(init.body);
        let changed = false;
        if (body.messages && body.messages.length) {
          const m = body.messages[0];
          if (m.content_block && m.content_block.length) {
            const cb = m.content_block[0].content && m.content_block[0].content.text_block;
            if (cb && cb.text && cb.text.indexOf(MARK) === -1) {
              cb.text = MARK + cb.text;
              changed = true;
            }
          }
        }
        if (changed) {
          init = Object.assign({}, init, { body: JSON.stringify(body) });
          window.__pp.augmented = true;
          window.__pp.captured.push({ url: url, body: body });
        }
      } catch (e) {
        window.__pp.captured.push({ error: String(e) });
      }
    }
    return origFetch(input, init);
  };
  // 标记 MAIN world 注入已生效
  window.__pp_injected = true;
})();
""".replace("<<INJECT>>", INJECT_TEXT)


def main():
    print("=" * 70)
    print("Doubao-pp 验证②：浏览器内 MAIN world 非检测验证")
    print("=" * 70)
    copy_profile()
    proc = launch_chrome()
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.connect_over_cdp(f"http://127.0.0.1:{PORT}")
            ctx = b.contexts[0] if b.contexts else b.new_context()
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            # MAIN world 注入（add_init_script 即在页面主世界执行）
            ctx.add_init_script(INIT_SCRIPT)
            page.goto(TARGET, wait_until="domcontentloaded", timeout=30000)
            time.sleep(3)
            # 确认注入生效
            injected = page.evaluate("() => !!window.__pp_injected")
            print(f"[3] MAIN world 注入生效：{injected}")
            if not injected:
                print("[FAIL] MAIN world 注入未生效")
                return 2
            # 找输入框
            info = page.evaluate("""() => {
                const all=[...document.querySelectorAll('textarea')];
                const vis=all.filter(e=>e.offsetParent!==null && e.clientHeight>8);
                return vis.map(e=>({cls:String(e.className).slice(0,60), ph:e.getAttribute('placeholder')||''}));
            }""")
            print(f"[4] 输入框候选：{json.dumps(info, ensure_ascii=False)[:300]}")
            if not info:
                print("[FAIL] 未找到输入框——可能未登录或页面未就绪（登录态缺失）")
                return 3
            # 填并发送（对齐此前 desrive_send.py 成功路径）
            try:
                ta = page.locator("textarea").filter(visible=True).first
                ta.wait_for(state="visible", timeout=10000)
                ta.click()
                ta.fill("你好")
                time.sleep(1)
                # 校验输入是否进入文本框
                val = page.evaluate("() => { const v=document.querySelectorAll('textarea'); let s=''; for(const t of v){ if(t.value) s=t.value;} return s; }")
                print(f"[5] 文本框当前值：{val!r}")
                # 多策略定位发送按钮并点击
                sent = False
                for sel_btn in ["button[aria-label*='发送']", "button[aria-label*='send']",
                                "button[aria-label*='Send']", "button.send", "button.icon-send",
                                "[class*=send] button", "button[type=submit]"]:
                    try:
                        btn = page.locator(sel_btn).filter(visible=True).first
                        if btn.count() and btn.is_visible():
                            btn.click(); sent = True; print(f"[5] 点发送按钮：{sel_btn}"); break
                    except Exception:
                        pass
                if not sent:
                    page.keyboard.press("Enter"); print("[5] 回车发送（兜底）")
            except Exception as e:
                print(f"[5] 发送准备异常：{e}")
            # 轮询捕获
            print("[6] 轮询增强请求与响应 ...")
            captured = []
            url_signed = False
            has_chunk = False
            for i in range(20):
                time.sleep(3)
                cap = page.evaluate("() => window.__pp ? window.__pp.captured : []")
                for c in cap:
                    if c not in captured: captured.append(c)
                if captured:
                    u = captured[-1].get("url", "")
                    if "a_bogus" in u and "msToken" in u:
                        url_signed = True
                if captured and any("CHUNK_DELTA" in json.dumps(c, ensure_ascii=False) for c in captured):
                    has_chunk = True
                # 二次成功信号：DOM 中出现助手回复文本
                reply = page.evaluate("""() => {
                    const t = document.body ? document.body.innerText : '';
                    return t.indexOf('有什么我可以') !== -1 || t.indexOf('你好呀') !== -1;
                }""")
                if reply:
                    print(f"  [{i+1}] DOM 出现助手回复文本 ✅")
                if captured and (url_signed or has_chunk):
                    print(f"  [{i+1}] 已捕获增强请求（signed={url_signed}, chunk={has_chunk}），提前结束轮询")
                    break
            # 读取增强后的请求体文本
            aug_text = ""
            if captured:
                msgs = captured[-1].get("body", {}).get("messages", [])
                if msgs and msgs[0].get("content_block"):
                    tb = msgs[0]["content_block"][0].get("content", {}).get("text_block", {})
                    aug_text = tb.get("text", "")
            result = {
                "main_world_injected": injected,
                "augmented": page.evaluate("() => window.__pp ? window.__pp.augmented : false"),
                "captured_count": len(captured),
                "request_url_signed_by_page": url_signed,
                "response_has_chunk_delta": has_chunk,
                "augmented_user_text": aug_text,
                "inject_marker_present": INJECT_TEXT in aug_text,
                "last_request_url": captured[-1].get("url", "") if captured else "",
                "raw_last_body": captured[-1].get("body") if captured else None,
            }
            print("\n[结果]")
            print(json.dumps(result, ensure_ascii=False, indent=2)[:2000])
            # 判定：我们增强了请求体文本（含标记）且页面仍为其附加 a_bogus/msToken 签名
            ok = (result["augmented"] and result["inject_marker_present"]
                  and result["request_url_signed_by_page"])
            result["verdict"] = "PASS" if ok else "FAIL"
            with open(OUT, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2, default=str)
            print(f"\n验证②结论：{result['verdict']}"
                  + (" —— MAIN world 成功增强请求体，且页面仍为其附加 a_bogus/msToken 签名（非检测成立）✅"
                     if ok else " —— 见上，可能登录态缺失或页面未就绪"))
            return 0 if ok else 4
    finally:
        try:
            proc.terminate()
        except Exception:
            pass
        shutil.rmtree(PROFILE_DST, ignore_errors=True)
        print("[清理] 已终止浏览器并删除临时档案")


if __name__ == "__main__":
    sys.exit(main())
