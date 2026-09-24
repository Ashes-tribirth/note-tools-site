"""GA4 -> public, aggregate-only snapshot. Never log raw API responses/search text."""
import csv
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'analytics/data.json'
STATUS = ROOT / 'analytics/status.json'
METRICS = ['totalUsers', 'sessions', 'screenPageViews']
EVENTS = {'compass_search': 'searches', 'tool_article_click': 'clicks'}

def exact(name, value):
    return {'filter': {'fieldName': name, 'stringFilter': {'matchType': 'EXACT', 'value': value}}}

def in_list(name, values):
    return {'filter': {'fieldName': name, 'inListFilter': {'values': values}}}

def normalize(value):
    import unicodedata
    return unicodedata.normalize('NFKC', value).strip().casefold()

def period_ranges(today, days):
    end = today - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    return [(start.isoformat(), end.isoformat()),
            ((start - timedelta(days=days)).isoformat(), (start - timedelta(days=1)).isoformat())]

def public_channel(source, medium, group):
    source = source.lower()
    if source == 'note' or source == 'note.com' or source.endswith('.note.com'):
        return 'note'
    if group == 'Organic Search':
        return '検索エンジン'
    if source == '(direct)' and medium in ('(none)', '(not set)', ''):
        return '直接アクセス'
    return 'その他'

def write_json(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)

class Reporter:
    def __init__(self, token, property_id):
        self.token = token
        self.base = f'https://analyticsdata.googleapis.com/v1beta/properties/{property_id}'
        self.warnings = set()
        self.timezone = None
        self.scope = [exact('hostName', 'ashes-tribirth.github.io'),
                      in_list('pagePath', ['/note-tools-site/', '/note-tools-site/index.html'])]
        meta = self.request('/metadata')
        self.dimensions = {x['apiName'] for x in meta['dimensions']}

    def request(self, suffix, data=None):
        body = None if data is None else json.dumps(data).encode()
        request = Request(self.base + suffix, data=body, headers={
            'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        with urlopen(request, timeout=60) as response:
            return json.load(response)

    def report(self, ranges, dims, metrics, filters=()):
        body = {'dateRanges': [{'startDate': a, 'endDate': b} for a, b in ranges],
                'dimensions': [{'name': d} for d in dims],
                'metrics': [{'name': m} for m in metrics],
                'dimensionFilter': {'andGroup': {'expressions': self.scope + list(filters)}},
                'limit': 10000}
        result = self.request(':runReport', body)
        metadata = result.get('metadata', {})
        if metadata.get('timeZone'):
            self.timezone = metadata['timeZone']
        for flag, label in [('subjectToThresholding', '少数データの非表示が適用される場合があります'),
                            ('dataLossFromOtherRow', '種類が多い項目の一部が「その他」にまとめられています')]:
            if metadata.get(flag): self.warnings.add(label)
        if metadata.get('samplingMetadatas'): self.warnings.add('一部の集計にサンプリングが適用されています')
        if result.get('rowCount', 0) > 10000:
            raise ValueError('Report exceeds safe row limit; do not publish incomplete rankings')
        names = [d['name'] for d in result.get('dimensionHeaders', [])]
        metric_names = [m['name'] for m in result.get('metricHeaders', [])]
        rows = []
        for row in result.get('rows', []):
            values = dict(zip(names, (v['value'] for v in row.get('dimensionValues', []))))
            values.update(zip(metric_names, (int(float(v['value'])) for v in row['metricValues'])))
            rows.append(values)
        return rows

    def optional(self, ranges, dims, filters):
        missing = [d for d in dims if d not in self.dimensions]
        if missing:
            return {'status': 'unavailable', 'reason': 'GA4のカスタム定義が未登録です', 'rows': []}
        return {'status': 'ok', 'rows': self.report(ranges, dims, ['eventCount'], filters)}

def total_values(rows, metrics):
    # No per-day summation: users are deduplicated by GA4 over each whole period.
    out = [{m: 0 for m in metrics}, {m: 0 for m in metrics}]
    for row in rows:
        i = int(row.get('dateRange', 'date_range_0').rsplit('_', 1)[-1])
        for metric in metrics: out[i][metric] = row[metric]
    return out

def rankings(raw, label_fn):
    if raw['status'] != 'ok': return raw
    grouped = {}
    hidden = [0, 0]
    for row in raw['rows']:
        i = int(row.get('dateRange', 'date_range_0').rsplit('_', 1)[-1])
        label = label_fn(row)
        if label is None:
            hidden[i] += row['eventCount']
            continue
        key = json.dumps(label, ensure_ascii=False, sort_keys=True)
        item = grouped.setdefault(key, {**label, 'count': 0, 'previous': 0})
        item['count' if i == 0 else 'previous'] += row['eventCount']
    items = sorted(grouped.values(), key=lambda r: (-r['count'], r['name']))
    return {'status': 'ok', 'rows': [r for r in items if r['count'] > 0][:10], 'withheld': hidden[0]}

def build_period(api, ranges, hour_filters, catalog, allowed):
    filters = hour_filters
    base = total_values(api.report(ranges, [], METRICS, filters), METRICS)
    totals = [dict(zip(['users', 'sessions', 'views'], (x[m] for m in METRICS))) for x in base]
    for x in totals: x.update(searches=0, clicks=0)
    for row in api.report(ranges, ['eventName'], ['eventCount'], filters + [in_list('eventName', list(EVENTS))]):
        i = int(row.get('dateRange', 'date_range_0').rsplit('_', 1)[-1])
        totals[i][EVENTS[row['eventName']]] = row['eventCount']
    days = {}
    a, b = map(datetime.fromisoformat, ranges[0])
    while a <= b:
        days[a.strftime('%Y%m%d')] = {'date': a.date().isoformat(), 'users': 0, 'views': 0, 'searches': 0, 'clicks': 0}
        a += timedelta(days=1)
    for row in api.report(ranges[:1], ['date'], ['totalUsers', 'screenPageViews'], filters):
        days[row['date']].update(users=row['totalUsers'], views=row['screenPageViews'])
    for row in api.report(ranges[:1], ['date', 'eventName'], ['eventCount'], filters + [in_list('eventName', list(EVENTS))]):
        days[row['date']][EVENTS[row['eventName']]] = row['eventCount']
    tools = api.optional(ranges, ['customEvent:tool_name', 'customEvent:author'], filters + [exact('eventName', 'tool_article_click')])
    def tool_label(row):
        return catalog.get((row['customEvent:tool_name'], row['customEvent:author']))
    searches = api.optional(ranges, ['customEvent:search_term'], filters + [exact('eventName', 'compass_search')])
    zero = api.optional(ranges, ['customEvent:search_term', 'customEvent:search_scope'], filters + [exact('eventName', 'compass_search_zero')])
    def keyword(row):
        name = allowed.get(normalize(row['customEvent:search_term']))
        return {'name': name} if name else None
    def zero_keyword(row):
        label = keyword(row)
        scope = row['customEvent:search_scope']
        return {**label, 'scope': scope} if label and scope in ('all', 'filtered') else None
    categories = api.optional(ranges, ['customEvent:filter_type', 'customEvent:filter_value'], filters + [exact('eventName', 'compass_filter')])
    category_values = {x['category'] for x in catalog.values()}
    prices = {'無料', '条件付き無料', '1～500円', '501～1,000円', '1,001～3,000円', '3,001円以上', '月額・メンバーシップ', '価格不明'}
    def filter_label(row):
        kind, value = row['customEvent:filter_type'], row['customEvent:filter_value']
        if kind == 'category' and value in category_values: return {'name': value, 'kind': 'カテゴリ'}
        if kind == 'price' and value in prices: return {'name': value, 'kind': '料金'}
        if kind == 'favorites' and value in ('on', 'off'): return {'name': 'お気に入りのみ：' + value, 'kind': '表示条件'}
        return None
    channels = {k: 0 for k in ['note', '検索エンジン', '直接アクセス', 'その他']}
    for row in api.report(ranges[:1], ['sessionSource', 'sessionMedium', 'sessionDefaultChannelGroup'], ['sessions'], filters):
        channels[public_channel(row['sessionSource'], row['sessionMedium'], row['sessionDefaultChannelGroup'])] += row['sessions']
    audience = {'new': 0, 'returning': 0}
    for row in api.report(ranges[:1], ['newVsReturning'], ['totalUsers'], filters):
        if row['newVsReturning'] in audience: audience[row['newVsReturning']] += row['totalUsers']
    return {'start': ranges[0][0], 'end': ranges[0][1], 'previousStart': ranges[1][0], 'previousEnd': ranges[1][1],
            'current': totals[0], 'previous': totals[1], 'daily': list(days.values()),
            'tools': rankings(tools, tool_label), 'keywords': rankings(searches, keyword),
            'zeroSearches': rankings(zero, zero_keyword), 'filters': rankings(categories, filter_label),
            'sources': [{'name': k, 'count': v} for k, v in channels.items()], 'audience': audience}

def collect():
    property_id = os.environ.get('GA4_PROPERTY_ID', '')
    credentials = os.environ.get('GA4_SERVICE_ACCOUNT_JSON', '')
    if not re.fullmatch(r'\d+', property_id) or not credentials:
        return 'setup_required'
    # Imported only for live collection. No credentials are ever written to disk.
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request as GoogleRequest
    auth = service_account.Credentials.from_service_account_info(json.loads(credentials), scopes=['https://www.googleapis.com/auth/analytics.readonly'])
    auth.refresh(GoogleRequest())
    api = Reporter(auth.token, property_id)
    api.report([('yesterday', 'yesterday')], [], ['totalUsers'])
    if not api.timezone: raise ValueError('Missing GA4 timezone')
    now = datetime.now(ZoneInfo(api.timezone))
    today = now.date()
    with (ROOT / 'note tools.csv').open(encoding='utf-8-sig', newline='') as f:
        rows = list(csv.reader(f))[1:]
    catalog = {(r[0][:100], r[1][:100]): {'name': r[0], 'author': r[1], 'category': r[2]} for r in rows if len(r) >= 7}
    allowed = {normalize(s): s for s in json.loads((ROOT / 'analytics/public-keywords.json').read_text())}
    periods = {}
    for days in (7, 30): periods[str(days)] = build_period(api, period_ranges(today, days), [], catalog, allowed)
    if now.hour:
        ranges = [(today.isoformat(), today.isoformat()), ((today - timedelta(days=1)).isoformat(), (today - timedelta(days=1)).isoformat())]
        periods['today'] = build_period(api, ranges, [in_list('hour', [f'{h:02}' for h in range(now.hour)])], catalog, allowed)
        periods['today']['throughHour'] = now.hour
    else:
        periods['today'] = {'status': 'pending', 'reason': '今日の最初の1時間が終わると集計します'}
    write_json(OUTPUT, {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
                        'timezone': api.timezone, 'periods': periods, 'warnings': sorted(api.warnings)})
    return 'ok'

def main():
    state = 'error'
    try:
        state = collect()
    except Exception as error:
        # Exception messages can contain request/search data. Log only type.
        print('Collection failed: ' + type(error).__name__, file=sys.stderr)
    write_json(STATUS, {'state': state, 'attemptedAt': datetime.now(timezone.utc).isoformat()})
    print('Analytics collection: ' + state)
    return 0 if state in ('ok', 'setup_required') else 1

if __name__ == '__main__': sys.exit(main())
