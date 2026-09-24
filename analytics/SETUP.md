# Compass利用レポートの接続

画面: `https://ashes-tribirth.github.io/note-tools-site/analytics/`

この実装には実データを同梱していません。未接続を0件として表示しません。

## 初回に必要な設定

1. GA4の「管理 → プロパティの詳細」で、数字のみのプロパティIDを確認する。Measurement ID `G-Z4E1HBRD0J` とは別。
2. Google CloudでGoogle Analytics Data APIを有効化し、専用サービスアカウントを作る。GA4の「プロパティのアクセス管理」にそのメールアドレスを**閲覧者**として追加する。Google Cloudプロジェクトの編集者権限は不要。
3. 専用サービスアカウントのJSON鍵をGitHubリポジトリの **Settings → Secrets and variables → Actions → Secrets** に `GA4_SERVICE_ACCOUNT_JSON` として保存する。鍵はチャット・コード・CSVに貼らない。Variablesに `GA4_PROPERTY_ID` を保存する。
4. GA4「カスタム定義」で下表のイベントスコープのディメンションを登録する。表示名は任意、イベントパラメータ名は完全一致。作成後は反映待ちが発生する。過去に送信した値の遡及取得を前提にしない。
5. GitHub Actionsの **Compass analytics → Run workflow** を実行する。定期実行は4時間ごと。画面上の最終取得日時とActionsの結果を確認する。

|イベントパラメータ|用途|
|---|---|
|tool_name|ツールランキング|
|author|作者照合|
|search_term|公開対象の検索語ランキング|
|search_scope|0件検索の条件あり・なし|
|filter_type|カテゴリ・料金等の区別|
|filter_value|選択条件|

`result_count` はイベントに追加済み。0件集計は新イベント `compass_search_zero` を使い、数値パラメータのカスタムディメンション化は不要。0件検索はこの変更の反映後から記録される。検索は入力停止700msごとの操作で、確定検索数ではない。

## データの扱い

- 公開対象は期間合計・日別合計・公開中の掲載情報に照合できたランキング。
- 検索語は `public-keywords.json` の**完全一致**のみ公開する。対象外は件数のみ。未掲載需要の網羅性には制約がある。新しい需要を調べるために自由入力全件を見たい場合は、認証付きの保管・画面を別途用意する。
- ユーザーID、クライアントID、IP、自由入力原文、流入元URLは保存しない。検索語の簡易マスキングは万能ではなく、公開JSONでは許可リストが最後の防壁となる。
- 生レスポンスや秘密鍵をファイル・Actionsログに書かない。APIエラーも型名のみ出力。
- API失敗時は前回の `data.json` を維持し、`status.json` に失敗状態のみ記録。画面で古い値であることを表示する。初回取得前はデータなし。
- 公開JSONは公開git履歴にも残る。非公開分析にはならない。noindexはアクセス制御ではない。
- 専用画面自体にはGA4タグを置かず、本体パスとホストで集計を限定する。

## 指標・期間

利用者は `totalUsers`。日別人数の足し算で期間人数を作らず、GA4に期間全体の重複を除かせる。訪問は `sessions`、PVは `screenPageViews`。記事クリックは送客操作であり、記事読了・ツール利用の実績ではない。

過去7日/30日は昨日まで。今日と昨日は完了した時間帯をそろえる。プロパティのタイムゾーンをAPIから取得する。0時台の今日集計は待機。GA4の処理遅延、しきい値、サンプリング、その他行は画面に注意を示す。初回と再訪は重複があり合計しない。

ランキングの不明・照合失敗は内訳非表示とするため、TOP10の合計は総数と一致しない。検索結果0件は、条件なしと絞り込みありを区別する。

## 公開方式

現在のmainブランチからのGitHub Pages公開を維持。Actionsが集計JSONと状態だけをコミット後、Pages Build APIで再ビルドを依頼する（GITHUB_TOKENのpushだけではPagesが更新されないため）。Pages source設定の切り替えは不要。Actionsにはcontents:write/pages:writeが必要。ブランチ保護が直接pushを禁じる環境では、その制約に合わせたデータ公開経路が必要。

## 検証

`python -m unittest discover -s tests -p 'test_*.py'`

実接続後に今日/7日/30日、GA4同期間の総ユーザー/セッション/PV/イベント数との照合、TOP10の実名、検索語公開制限、0件検索、Actions失敗と復旧、Pages反映を確認する。実データ接続前の画面テストは実計測の検証ではない。

参照: [Data API公式クイックスタート](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart)、[APIスキーマ](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)、[カスタム定義](https://support.google.com/analytics/answer/14240153)、[Pages Build API](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build)
