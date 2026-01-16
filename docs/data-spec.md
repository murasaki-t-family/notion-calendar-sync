# データ仕様

## スプレッドシート設定値

### Control シート

| セル | 項目 | 型 | デフォルト値 | 説明 |
|------|------|-----|-------------|------|
| C5 | NOTION_TOKEN | string | - | Notion Integration のシークレットトークン |
| C6 | NOTION_DATABASE_ID | string | - | 同期先のNotionデータベースID（32文字） |
| C7 | EVENT_IDS | string | `primary` | GoogleカレンダーID（カンマ区切りで複数可） |
| C8 | SYNC_DAYS_FUTURE | number | `30` | 未来何日分を同期するか |
| C9 | SYNC_FREQUENCY_MINUTES | number | `5` | 定期実行の間隔（分） |
| C10 | PERFORM_INITIAL_SYNC | boolean | `false` | 初期同期を実行するか |

## Google Calendar イベント

### 入力データ構造

Google Calendar API v3 から取得するイベントオブジェクト：

```javascript
{
  id: "イベントID",
  summary: "イベント名",
  start: {
    dateTime: "2025-01-15T10:00:00+09:00",  // 時刻指定イベント
    date: "2025-01-15"                       // 終日イベント（どちらか一方）
  },
  end: {
    dateTime: "2025-01-15T11:00:00+09:00",
    date: "2025-01-16"
  },
  updated: "2025-01-14T12:00:00.000Z",
  status: "confirmed" | "cancelled"
}
```

### 同期対象外の判定

```javascript
// 終日イベントの判定
if (event.start.date && !event.start.dateTime) {
  // スキップ
}

// タイトルによるスキップ
if (event.summary && event.summary.startsWith('---')) {
  // スキップ
}
```

## Notion データベース

### 必須プロパティ

スクリプトが自動作成するプロパティ：

| プロパティ名 | 型 | 説明 |
|-------------|-----|------|
| Name | title | イベント名（タイトル） |
| 日付 | date | 開始・終了日時 |
| イベントID | rich_text | GoogleカレンダーのイベントID |
| 最終更新日時(GAS) | date | 最終同期日時 |

### Notion API リクエスト形式

```javascript
{
  'Name': {
    title: [{ text: { content: "イベント名" } }]
  },
  '日付': {
    date: {
      start: "2025-01-15T10:00:00+09:00",
      end: "2025-01-15T11:00:00+09:00"
    }
  },
  'イベントID': {
    rich_text: [{ text: { content: "カレンダーイベントID" } }]
  },
  '最終更新日時(GAS)': {
    date: { start: "2025-01-14T12:00:00.000Z" }
  }
}
```

## Script Properties（状態管理）

| キー | 型 | 説明 |
|------|-----|------|
| `lastSyncTimestamp` | ISO 8601 string | 最後に同期を完了した日時 |
| `isInitialSyncCompleted` | `"true"` / `"false"` | 初期同期が完了したかどうか |
| `eventIndex` | number string | バッチ処理中の進捗インデックス |

### 状態遷移

```
[初期状態]
  isInitialSyncCompleted: null
  eventIndex: null

[初期同期開始]
  isInitialSyncCompleted: null
  eventIndex: "0"

[初期同期中断・再開]
  isInitialSyncCompleted: null
  eventIndex: "50", "100", ...

[初期同期完了]
  isInitialSyncCompleted: "true"
  eventIndex: null
  lastSyncTimestamp: "2025-01-15T10:00:00.000Z"

[増分同期完了]
  lastSyncTimestamp: 更新される
```
