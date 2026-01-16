# Notion Calendar Sync

GoogleカレンダーのイベントをNotionデータベースに自動同期するGoogle Apps Script (GAS) プロジェクト。

## 機能概要

- **自動同期**: 指定間隔（デフォルト5分）でGoogleカレンダーからNotionへイベントを同期
- **複数カレンダー対応**: カンマ区切りで複数のGoogleカレンダーIDを指定可能
- **初期同期**: 初回実行時に未来N日分のイベントを一括登録
- **増分同期**: 2回目以降は変更があったイベントのみを処理
- **イベント削除対応**: Googleカレンダーで削除されたイベントはNotionでアーカイブ

## 同期対象外

以下のイベントは同期されません：
- 終日イベント
- タイトルが `---` で始まるイベント

## セットアップ

### 1. GASプロジェクトの作成

1. [Google Apps Script](https://script.google.com/) で新規プロジェクトを作成
2. `appsscript.json` の内容をマニフェストファイルに貼り付け
3. `コード.gs` の内容をスクリプトファイルに貼り付け

### 2. スプレッドシートの設定

スプレッドシートに「Control」シートを作成し、以下のセルに値を設定：

| セル | 項目 | 説明 |
|------|------|------|
| C5 | Notionトークン | Notion Integration のシークレットトークン |
| C6 | NotionデータベースID | 同期先のNotionデータベースID |
| C7 | GoogleカレンダーID | カンマ区切りで複数指定可（例: `primary,xxx@group.calendar.google.com`） |
| C8 | 同期日数 | 未来何日分を同期するか（デフォルト: 30） |
| C9 | 同期間隔（分） | 定期実行の間隔（デフォルト: 5） |
| C10 | 初期同期実行 | チェックボックス（初回一括同期を行うか） |

### 3. Notion側の準備

1. [Notion Integrations](https://www.notion.so/my-integrations) でIntegrationを作成
2. 同期先データベースにIntegrationを接続
3. 以下のプロパティが自動作成されます：
   - `Name`（タイトル）: イベント名
   - `日付`（日付）: 開始・終了日時
   - `イベントID`（テキスト）: GoogleカレンダーのイベントID
   - `最終更新日時(GAS)`（日付）: 同期時刻

## 実行方法

### 手動実行

- `onSyncButtonClick()`: 同期を開始し、定期実行トリガーを設定
- `manualInitialSync()`: 初期同期を再実行
- `resetSettings()`: 設定とトリガーをリセット

### 自動実行

`onSyncButtonClick()` を一度実行すると、指定間隔で自動的にトリガーが設定されます。

## 技術仕様

- **ロック機構**: 同時実行を防止
- **リトライ機能**: API呼び出し失敗時に指数バックオフで最大3回リトライ
- **実行時間制限対応**: 5分を超える処理は自動的に中断・再開
- **バッチ処理**: 50件ずつ処理してAPI制限に対応

## ファイル構成

```
notion-calendar-sync/
├── appsscript.json    # GASマニフェスト
├── コード.gs           # メインスクリプト
└── README.md          # このファイル
```
