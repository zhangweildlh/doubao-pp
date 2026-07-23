# 审计探针②：dump 关键事件的原始 data，确认 brief 位置与 STREAM_MSG_NOTIFY/CHUNK_DELTA 文本
import json, re
cap = json.load(open('capture/phaseB_sse.json', encoding='utf-8'))
first = cap[0] if isinstance(cap, list) else cap
resp = first.get('respBody', '') or ''
frames = re.split(r'\r?\n\r?\n', resp)
for f in frames:
    lines = f.split('\n'); ev = None; dl = []
    for ln in lines:
        if ln.startswith('event:'):
            ev = ln[6:].strip()
        elif ln.startswith('data:'):
            dl.append(ln[5:].strip())
    if ev in ('SSE_REPLY_END', 'STREAM_MSG_NOTIFY', 'STREAM_CHUNK'):
        raw = '\n'.join(dl)
        try:
            d = json.loads(raw)
        except Exception:
            d = raw
        print('===', ev)
        print(json.dumps(d, ensure_ascii=False)[:600])
