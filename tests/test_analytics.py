import unittest
from unittest.mock import patch
import tempfile
from pathlib import Path
import json
from scripts import collect_analytics
from datetime import date
from scripts.collect_analytics import period_ranges, total_values, rankings, public_channel, build_period

class AggregationTests(unittest.TestCase):
    def test_previous_window_crosses_month(self):
        self.assertEqual(period_ranges(date(2026, 3, 3), 7), [('2026-02-24','2026-03-02'),('2026-02-17','2026-02-23')])
    def test_users_are_period_totals_not_daily_sum(self):
        rows = [{'dateRange':'date_range_1','totalUsers':2},{'dateRange':'date_range_0','totalUsers':3}]
        self.assertEqual(total_values(rows,['totalUsers']), [{'totalUsers':3},{'totalUsers':2}])
    def test_private_searches_never_exported(self):
        raw={'status':'ok','rows':[{'term':'分析','eventCount':4,'dateRange':'date_range_0'}, {'term':'secret@example.com','eventCount':9,'dateRange':'date_range_0'}, {'term':'分析','eventCount':2,'dateRange':'date_range_1'}]}
        out=rankings(raw,lambda r:{'name':r['term']} if r['term']=='分析' else None)
        self.assertEqual(out['rows'],[{'name':'分析','count':4,'previous':2}])
        self.assertEqual(out['withheld'],9)
        self.assertNotIn('secret',str(out))
    def test_unavailable_is_not_empty_success(self):
        raw={'status':'unavailable','rows':[],'reason':'missing'}
        self.assertEqual(rankings(raw,lambda r:r),raw)
    def test_failed_fetch_preserves_last_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory) / 'data.json'
            status = Path(directory) / 'status.json'
            data.write_text('{"previous":"snapshot"}')
            with patch.object(collect_analytics, 'OUTPUT', data), patch.object(collect_analytics, 'STATUS', status), patch.object(collect_analytics, 'collect', side_effect=RuntimeError('not logged')), patch('sys.stderr'):
                self.assertEqual(collect_analytics.main(), 1)
            self.assertEqual(data.read_text(), '{"previous":"snapshot"}')
            self.assertEqual(json.loads(status.read_text())['state'], 'error')
    def test_channels(self):
        self.assertEqual(public_channel('note.com','referral','Referral'),'note')
        self.assertEqual(public_channel('note.com.evil.com','referral','Referral'),'その他')
        self.assertEqual(public_channel('google','organic','Organic Search'),'検索エンジン')
        self.assertEqual(public_channel('(direct)','(none)','Direct'),'直接アクセス')
    def test_missing_event_means_zero_not_missing_period(self):
        class Empty:
            def report(self,*args): return []
            def optional(self,*args): return {'status':'unavailable','rows':[]}
        result=build_period(Empty(), [('2026-09-01','2026-09-07'),('2026-08-25','2026-08-31')], [], {}, {})
        self.assertEqual(len(result['daily']),7)
        self.assertEqual(result['current'],dict(users=0,sessions=0,views=0,searches=0,clicks=0))
        self.assertEqual(result['tools']['status'],'unavailable')

if __name__ == '__main__': unittest.main()
