import json
from collections import Counter

f = open(r'D:\Documents\AI_Work_Temp\Doubao-pp\capture\phaseB_sse.json', 'r', encoding='utf-8')
data = json.load(f)
respBody = data[0]['respBody']

events = []
for block in respBody.split('\n\n'):
    block = block.strip()
    if not block:
        continue
    ev = {'id': None, 'event': None, 'data': None}
    for line in block.split('\n'):
        line = line.strip()
        if line.startswith('id:'):
            ev['id'] = line[3:].strip()
        elif line.startswith('event:'):
            ev['event'] = line[6:].strip()
        elif line.startswith('data:'):
            ev['data'] = line[5:].strip()
    events.append(ev)

print('Total events: %d' % len(events))

event_types = Counter(e['event'] for e in events)
print('Event type counts:')
for name, count in event_types.most_common():
    print('  %s: %d' % (name, count))

print()
print('=== CHUNK_DELTA texts ===')
delta_parts = []
for e in events:
    if e['event'] == 'CHUNK_DELTA':
        d = json.loads(e['data'])
        t = d.get('text', '')
        delta_parts.append(t)
        print('  text: %r' % t)

concatenated = ''.join(delta_parts)
print('Concatenated: %r' % concatenated)

print()
print('=== STREAM_MSG_NOTIFY ===')
first_text = None
for e in events:
    if e['event'] == 'STREAM_MSG_NOTIFY':
        d = json.loads(e['data'])
        blocks_list = d.get('content', {}).get('content_block', [])
        for b in blocks_list:
            first_text = b.get('content', {}).get('text_block', {}).get('text', '')
            print('  text: %r' % first_text)
            break
        break

full_text = (first_text or '') + concatenated
print()
print('=== SSE_REPLY_END events ===')
reply_end_count = 0
for e in events:
    if e['event'] == 'SSE_REPLY_END':
        reply_end_count += 1
        d = json.loads(e['data'])
        brief = d.get('msg_finish_attr', {}).get('brief')
        end_type = d.get('end_type')
        print('  #%d end_type=%s brief=%r' % (reply_end_count, end_type, brief))

print()
brief = None
for e in events:
    if e['event'] == 'SSE_REPLY_END':
        d = json.loads(e['data'])
        brief = d.get('msg_finish_attr', {}).get('brief')
        if brief:
            break

print('=== Key Comparison ===')
print('SSE_REPLY_END.brief:    %r' % brief)
print('CHUNK_DELTA only:       %r' % concatenated)
print('SMN+CHUNK_DELTA:       %r' % full_text)
print()
if brief:
    print('CHUNK_DELTA in brief:  %s' % (concatenated in brief))
    print('full_text == brief:    %s' % (full_text == brief))
    print('brief starts with first_text: %s' % brief.startswith(first_text or ''))
    print('brief[len(first_text):] == concatenated: %s' % (brief[len(first_text or ''):] == concatenated))
