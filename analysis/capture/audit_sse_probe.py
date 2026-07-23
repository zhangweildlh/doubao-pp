# 审计探针：核查 phaseB_sse.json 中 SSE 事件与助手文本重建逻辑
# 目的：验证 collectAssistantText 仅拼 CHUNK_DELTA 是否会漏掉 STREAM_MSG_NOTIFY 携带的助手首段
import json, re

CAP = 'capture/phaseB_sse.json'
cap = json.load(open(CAP, encoding='utf-8'))
first = cap[0] if isinstance(cap, list) else cap
resp = first.get('respBody', '') or ''
req = first.get('reqBody', '') or ''

frames = re.split(r'\r?\n\r?\n', resp)
events = []
for f in frames:
    lines = f.split('\n')
    ev = None
    data_lines = []
    for ln in lines:
        if ln.startswith('event:'):
            ev = ln[6:].strip()
        elif ln.startswith('data:'):
            data_lines.append(ln[5:].strip())
    if ev is None:
        continue
    data = '\n'.join(data_lines)
    try:
        d = json.loads(data)
    except Exception:
        d = data
    events.append((ev, d))

print('=== 事件总数:', len(events))
from collections import Counter
cnt = Counter(e for e, _ in events)
print('=== 各事件类型计数:', dict(cnt))

# 提取助手文本候选
chunk_parts = []
stream_notify_texts = []
full_notify_texts = []
brief = None
for ev, d in events:
    if ev == 'CHUNK_DELTA' and isinstance(d, dict):
        t = d.get('text')
        if isinstance(t, str):
            chunk_parts.append(t)
    if ev == 'STREAM_MSG_NOTIFY' and isinstance(d, dict):
        # 尝试取 content_block[].content.text_block.text
        for msg in d.get('content', {}).get('content_block', []) if isinstance(d.get('content'), dict) else []:
            tb = msg.get('content', {}).get('text_block', {})
            if isinstance(tb, dict) and isinstance(tb.get('text'), str):
                stream_notify_texts.append(tb['text'])
    if ev == 'FULL_MSG_NOTIFY' and isinstance(d, dict):
        for msg in d.get('message', {}).get('content_block', []) if isinstance(d.get('message'), dict) else []:
            tb = msg.get('content', {}).get('text_block', {})
            if isinstance(tb, dict) and isinstance(tb.get('text'), str):
                full_notify_texts.append(tb['text'])
    if ev == 'SSE_REPLY_END' and isinstance(d, dict):
        brief = d.get('msg_finish_attr', {}).get('brief')

assistant_chunk = ''.join(chunk_parts)
assistant_stream_first = ''.join(stream_notify_texts)
assistant_full = ''.join(full_notify_texts)

print('=== CHUNK_DELTA 拼接:', repr(assistant_chunk))
print('=== STREAM_MSG_NOTIFY 文本:', repr(assistant_stream_first))
print('=== FULL_MSG_NOTIFY 文本:', repr(assistant_full))
print('=== SSE_REPLY_END.brief:', repr(brief))
print('--- 仅 CHUNK_DELTA 是否等于 brief:', assistant_chunk == brief)
print('--- brief 是否包含 仅CHUNK拼接:', (brief is not None and assistant_chunk in brief))
print('--- 仅CHUNK拼接 长度:', len(assistant_chunk), ' brief 长度:', len(brief) if brief else 0)
# 若把 STREAM_MSG_NOTIFY 也拼上（顺序：stream_notify 在前，chunk 在后）
rebuilt = assistant_stream_first + assistant_chunk
print('--- STREAM_MSG_NOTIFY+CHUNK_DELTA 拼接:', repr(rebuilt))
print('--- 该拼接 == brief ?', rebuilt == brief)
print('--- brief 是否包含该拼接 ?', (brief is not None and rebuilt in brief))

# 是否存在 STREAM_CHUNK 事件
has_stream_chunk = any(e == 'STREAM_CHUNK' for e, _ in events)
print('=== 是否存在 STREAM_CHUNK 事件:', has_stream_chunk)

# 打印 reqBody 顶层键与用户文本节点
try:
    rb = json.loads(req) if isinstance(req, str) else req
    print('=== reqBody 顶层键:', list(rb.keys()) if isinstance(rb, dict) else type(rb))
    msgs = rb.get('messages', []) if isinstance(rb, dict) else []
    if msgs:
        tb = msgs[0].get('content_block', [{}])[0].get('content', {}).get('text_block', {})
        print('=== reqBody 用户文本节点:', repr(tb.get('text')))
except Exception as ex:
    print('=== reqBody 解析失败:', ex)
