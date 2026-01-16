# セットアップ手順

## 1. Google Apps Script プロジェクトの作成

### 1.1 新規プロジェクト作成

1. [Google Apps Script](https://script.google.com/) にアクセス
2. 「新しいプロジェクト」をクリック
3. プロジェクト名を設定（例: `Notion Calendar Sync`）

### 1.2 マニフェストファイルの設定

1. エディタ左側の「プロジェクトの設定」（歯車アイコン）をクリック
2. 「「appsscript.json」マニフェスト ファイルをエディタで表示する」にチェック
3. エディタに戻り、`appsscript.json` を開く
4. 以下の内容に置き換える：

```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {
    "enabledAdvancedServices": [{
      "userSymbol": "Calendar",
      "serviceId": "calendar",
      "version": "v3"
    }]
  },
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
```

### 1.3 スクリプトの追加

1. `コード.gs` を開く（または新規作成）
2. プロジェクトの `コード.gs` の内容を貼り付け

## 2. スプレッドシートの設定

### 2.1 スプレッドシートの作成

1. [Google スプレッドシート](https://sheets.google.com/) で新規作成
2. シート名を「Control」に変更

### 2.2 設定値の入力

以下のセルに値を設定：

| セル | 項目 | 値の例 |
|------|------|--------|
| C5 | Notionトークン | `ntn_xxxxxxxxxxxx` |
| C6 | NotionデータベースID | `19dc8cc4bc5081c0984ed42bc9f29753` |
| C7 | GoogleカレンダーID | `primary` または `example@gmail.com,work@company.com` |
| C8 | 同期日数 | `90` |
| C9 | 同期間隔（分） | `5` |
| C10 | 初期同期実行 | チェックボックス |

### 2.3 GASとスプレッドシートの連携

1. スプレッドシートのメニュー「拡張機能」→「Apps Script」
2. 作成済みのスクリプトをここに配置するか、新規作成したスクリプトをコピー

## 3. Notion の設定

### 3.1 Integration の作成

1. [Notion Integrations](https://www.notion.so/my-integrations) にアクセス
2. 「New integration」をクリック
3. 名前を設定（例: `Calendar Sync`）
4. 関連付けるワークスペースを選択
5. 「Submit」をクリック
6. 表示される「Internal Integration Secret」をコピー（C5セルに設定）

### 3.2 データベースの準備

1. Notionでデータベースを作成（または既存のものを使用）
2. データベースを開き、URLからデータベースIDを取得
   - URL例: `https://www.notion.so/xxxxx?v=yyyyy`
   - `xxxxx` の部分がデータベースID（32文字）
3. データベースIDをC6セルに設定

### 3.3 Integration の接続

1. データベースページ右上の「...」→「コネクトを追加」
2. 作成したIntegrationを選択
3. 「確認」をクリック

## 4. 初回実行

### 4.1 手動実行

1. GASエディタで `onSyncButtonClick` 関数を選択
2. 「実行」ボタンをクリック
3. 初回は権限の承認が求められるので許可

### 4.2 確認事項

- Notionデータベースにイベントが登録されているか確認
- GASの「実行数」でエラーがないか確認
- 「トリガー」に定期実行が設定されているか確認

## トラブルシューティング

### 権限エラーが発生する場合

- Google Calendar API が有効になっているか確認
- Notion Integration がデータベースに接続されているか確認

### イベントが同期されない場合

- GoogleカレンダーIDが正しいか確認
- 終日イベントや `---` で始まるイベントは同期対象外

### トリガーが動作しない場合

- `resetSettings()` を実行してリセット後、再度 `onSyncButtonClick()` を実行
