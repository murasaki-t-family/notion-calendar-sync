# Project Rules

## セカンドブレイン連携（必読）

### コンテキスト参照
- **ユーザー情報**: C:/Users/fcs/2nd-Brain/00_システム/00_UserProfile/

### コンテキスト蓄積（書き込み時の注意）
学びやメモを保存する際は、必ず以下の**絶対パス**を使用すること：
- **日誌**: `C:/Users/fcs/2nd-Brain/05_日誌/YYYY-MM-DD.md`
- **知識ベース**: `C:/Users/fcs/2nd-Brain/03_知識ベース/`

### ワークフロー実行
`/today-start` や `/today-finish` 等のワークフローを実行する際：
1. ワークフロー定義: `C:/Users/fcs/2nd-Brain/.agent/workflows/` を参照
2. 相対パス（`.\05_日誌`等）は `C:/Users/fcs/2nd-Brain/05_日誌` に読み替えて実行

---

## 開発ルール
- 日本語コミットメッセージ
