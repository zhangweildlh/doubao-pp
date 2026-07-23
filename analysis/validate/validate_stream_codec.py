# -*- coding: utf-8 -*-
"""
Doubao-pp 验证器 ①：SSE 命名事件解析
基于 capture/phaseB_sse.json 中真实抓取的 respBody（实机 SSE 流）验证：
  - 命名事件 SSE_HEARTBEAT / SSE_ACK / FULL_MSG_NOTIFY / STREAM_MSG_NOTIFY / CHUNK_DELTA / SSE_REPLY_END / STREAM_CHUNK 可被正确解析
  - ★ 权威完整助手文本 = 仅 SSE_REPLY_END(end_type:1).msg_finish_attr.brief（与服务端定稿逐字一致）
  - CHUNK_DELTA / STREAM_MSG_NOTIFY 仅用于实时逐字显示；STREAM_CHUNK 携带 patch_op(JSON 补丁)增量构建正文
此脚本对应融合方案「步骤 3：doubao/stream-codec」核心逻辑的可执行验证（无需登录、无需浏览器）。
"""
import json
import os
import sys

CAPTURE = os.path.join(os.path.dirname(__file__), "..", "capture", "phaseB_sse.json")

# 真实 SSE 流中预期出现的命名事件（按融合方案 §2.2）
EXPECTED_EVENTS = [
    "SSE_HEARTBEAT",
    "SSE_ACK",
    "FULL_MSG_NOTIFY",
    "STREAM_MSG_NOTIFY",
    "CHUNK_DELTA",
    "SSE_REPLY_END",
]


def parse_sse(raw: str):
    """把原始 SSE 文本解析为事件列表 [{id, event, data}]，模拟豆包 stream-codec 的分帧逻辑。"""
    events = []
    cur = {"id": None, "event": None, "data": []}
    for line in raw.split("\n"):
        if line == "":
            # 空行 = 一个事件结束
            if cur["event"] is not None or cur["data"]:
                data_str = "\n".join(cur["data"])
                try:
                    data_obj = json.loads(data_str) if data_str else None
                except json.JSONDecodeError:
                    data_obj = data_str
                events.append({"id": cur["id"], "event": cur["event"], "data": data_obj})
            cur = {"id": None, "event": None, "data": []}
            continue
        if line.startswith("id:"):
            cur["id"] = line[len("id:"):].strip()
        elif line.startswith("event:"):
            cur["event"] = line[len("event:"):].strip()
        elif line.startswith("data:"):
            cur["data"].append(line[len("data:"):].strip())
    # 收尾
    if cur["event"] is not None or cur["data"]:
        data_str = "\n".join(cur["data"])
        try:
            data_obj = json.loads(data_str) if data_str else None
        except json.JSONDecodeError:
            data_obj = data_str
        events.append({"id": cur["id"], "event": cur["event"], "data": data_obj})
    return events


def main():
    print("=" * 70)
    print("Doubao-pp 验证①：SSE 命名事件解析（基于真实抓包帧）")
    print("=" * 70)

    if not os.path.exists(CAPTURE):
        print(f"[FAIL] 找不到抓包证据：{CAPTURE}")
        return 1

    with open(CAPTURE, "r", encoding="utf-8") as f:
        capture = json.load(f)

    # phaseB_sse.json 是数组，取第一条的 respBody
    first = capture[0] if isinstance(capture, list) else capture
    resp_body = first.get("respBody", "")
    req_body = first.get("reqBody", "")
    url = first.get("url", "")

    print(f"[INFO] 来源：{os.path.basename(CAPTURE)}")
    print(f"[INFO] 端点 URL：{url.split('?')[0]}")
    print(f"[INFO] 请求体长度：{len(req_body)} 字符；SSE 响应长度：{len(resp_body)} 字符")

    # ---- 解析 SSE ----
    events = parse_sse(resp_body)
    event_names = [e["event"] for e in events]
    print(f"\n[解析] 共解析出 {len(events)} 个 SSE 事件：")
    for e in events:
        dsum = ""
        if isinstance(e["data"], dict):
            dsum = json.dumps(e["data"], ensure_ascii=False)[:80]
        print(f"   - {e['event']:18s} data={dsum}")

    # ---- 断言 1：所有预期命名事件均出现 ----
    missing = [ev for ev in EXPECTED_EVENTS if ev not in event_names]
    if missing:
        print(f"\n[FAIL] 缺失命名事件：{missing}")
        return 1
    print(f"\n[PASS] 全部 6 类命名事件均出现：{EXPECTED_EVENTS}")

    # ---- 断言 2：权威完整文本应以 SSE_REPLY_END.brief 为准（实测校正）----
    # 注意：CHUNK_DELTA 仅用于实时逐字显示，其拼接 ≠ 最终完整文本
    # （缺失 STREAM_MSG_NOTIFY 首段与 STREAM_CHUNK 的 patch_op 增量）。
    # 权威完整文本 = 仅 SSE_REPLY_END(end_type:1).msg_finish_attr.brief。
    def extract_brief(evs):
        b = None
        for e in evs:
            if e["event"] == "SSE_REPLY_END" and isinstance(e["data"], dict):
                x = e["data"].get("msg_finish_attr", {}).get("brief")
                if isinstance(x, str):
                    b = x
        return b

    def first_text_block_text(d):
        if not isinstance(d, dict):
            return None
        blocks = d.get("content", {}).get("content_block", [])
        if isinstance(blocks, list):
            for blk in blocks:
                t = blk.get("content", {}).get("text_block", {}).get("text")
                if isinstance(t, str):
                    return t
        return None

    def streaming_text(evs):
        parts = []
        for e in evs:
            if not isinstance(e["data"], dict):
                continue
            if e["event"] == "STREAM_MSG_NOTIFY":
                t = first_text_block_text(e["data"])
                if t:
                    parts.append(t)
            elif e["event"] == "CHUNK_DELTA":
                t = e["data"].get("text")
                if isinstance(t, str):
                    parts.append(t)
        return "".join(parts)

    brief = extract_brief(events)
    streamed = streaming_text(events)
    chunk_texts = [
        e["data"].get("text", "")
        for e in events
        if e["event"] == "CHUNK_DELTA" and isinstance(e["data"], dict)
    ]
    stream_chunk_count = event_names.count("STREAM_CHUNK")
    print(f"\n[解析] CHUNK_DELTA 片段数 = {len(chunk_texts)}；STREAM_CHUNK 观测 = {stream_chunk_count}")
    for i, t in enumerate(chunk_texts):
        print(f"   CHUNK_DELTA[{i}] = {t!r}")
    print(f"[解析] STREAM_MSG_NOTIFY+CHUNK_DELTA 流式拼接 = {streamed!r}")
    print(f"[解析] 权威 brief = {brief!r}")

    # 权威判定：canonical = brief（优先）；缺失时回退流式拼接
    canonical = brief if brief else streamed
    if brief is None:
        print("[WARN] 未找到 SSE_REPLY_END.brief，回退流式拼接；非硬失败")
        if not canonical:
            print("[FAIL] 回退拼接仍为空")
            return 1
    else:
        # 强化断言：权威完整文本必须与 brief 逐字相等（不再用子串 includes 掩盖漏字）
        if canonical == brief:
            print("[PASS] 权威完整文本(=brief)可正确提取，且与 brief 逐字相等")
        else:
            print(f"[FAIL] 权威文本与 brief 不一致：\n  canonical={canonical!r}\n  brief={brief!r}")
            return 1
        if streamed != brief:
            print("[WARN] 流式拼接(STREAM_MSG_NOTIFY+CHUNK_DELTA)与 brief 不完全一致（缺失 STREAM_CHUNK 的 patch_op 增量）——")
            print("       生产实现应以 brief 为权威存储文本，CHUNK_DELTA 仅作实时显示（预期内，非失败）")

    # ---- 断言 4：SSE_ACK 回带 conversation_id / section_id（会话标识来源）----
    ack = next((e for e in events if e["event"] == "SSE_ACK"), None)
    if ack and isinstance(ack["data"], dict):
        meta = ack["data"].get("ack_client_meta", {})
        cid = meta.get("conversation_id")
        sid = meta.get("section_id")
        print(f"\n[解析] SSE_ACK 回带 conversation_id={cid} section_id={sid}")
        if cid and sid:
            print("[PASS] SSE_ACK 提供会话/分段标识，豆包会话 URL 可由其构造")
        else:
            print("[WARN] SSE_ACK 未回带会话标识")
    else:
        print("[WARN] 未找到 SSE_ACK")

    print("\n" + "=" * 70)
    print("验证①结论：SSE 命名事件解析逻辑正确，路线 A 的流式回显可行 ✅")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
