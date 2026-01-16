# アーキテクチャ設計

## 技術スタック

| 項目 | 技術 |
|------|------|
| 実行環境 | Google Apps Script (V8ランタイム) |
| カレンダーAPI | Google Calendar API v3（Advanced Services） |
| 同期先 | Notion API (2022-06-28) |
| 設定管理 | Google スプレッドシート |
| 状態管理 | Script Properties |

## システム構成

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Apps Script                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   コード.gs                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │ 設定読込    │  │ 同期処理    │  │ Notion API  │  │   │
│  │  │ getSettingValue│ syncCalendar│  │ notion.*    │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ スプレッドシート │  │ Google Calendar │  │ Notion Database │
│ (Control シート) │  │ API v3          │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## 処理フロー

### 同期処理の全体フロー

```
onSyncButtonClick()
    │
    ├─► setUpTrigger()          # 定期実行トリガー設定
    │
    └─► syncCalendarToNotion()
            │
            ├─► ensureDatabaseProperties()  # DBプロパティ確認・作成
            │
            ├─► [初期同期未完了 & 初期同期ON]
            │       └─► performInitialSync()
            │
            └─► [初期同期完了済み]
                    └─► performIncrementalSync()
```

### 初期同期フロー

```
performInitialSync()
    │
    ├─► LockService.getScriptLock()  # 排他制御
    │
    ├─► getCalendarEvents()          # 未来N日分を取得
    │
    └─► [バッチ処理ループ]
            │
            ├─► convertEventToNotionFormat()
            │
            ├─► notion.createPage()
            │
            └─► [5分経過?]
                    └─► scheduleNextRun()  # 再スケジュール
```

### 増分同期フロー

```
performIncrementalSync()
    │
    ├─► LockService.getScriptLock()  # 排他制御
    │
    ├─► getCalendarEvents()          # 前回同期以降の変更を取得
    │
    └─► [イベントごと]
            │
            ├─► [status === 'cancelled']
            │       └─► handleDeletedEvent()  # アーカイブ
            │
            └─► [それ以外]
                    └─► syncEvent()           # 作成 or 更新
```

## 主要関数一覧

| 関数名 | 役割 |
|--------|------|
| `getSettingValue(cellAddress)` | スプレッドシートから設定値を取得 |
| `syncCalendarToNotion()` | 同期処理のメイン関数 |
| `performInitialSync()` | 初期同期（全イベント登録） |
| `performIncrementalSync()` | 増分同期（変更分のみ処理） |
| `getCalendarEvents()` | Google Calendar APIからイベント取得 |
| `convertEventToNotionFormat()` | イベントをNotion形式に変換 |
| `syncEvent()` | 個別イベントの同期（作成/更新） |
| `handleDeletedEvent()` | 削除イベントの処理（アーカイブ） |
| `withRetry()` | リトライ機能のラッパー |
| `setUpTrigger()` | 定期実行トリガーの設定 |
| `scheduleNextRun()` | 処理の再スケジュール |

## 設計方針

### 状態管理

Script Propertiesを使用して以下の状態を永続化：

| キー | 用途 |
|------|------|
| `lastSyncTimestamp` | 最後に同期した日時 |
| `isInitialSyncCompleted` | 初期同期完了フラグ |
| `eventIndex` | バッチ処理の進捗インデックス |

### エラーハンドリング

- `withRetry()` による指数バックオフリトライ（最大3回）
- `LockService` による排他制御
- UI表示不可時はコンソールログにフォールバック
