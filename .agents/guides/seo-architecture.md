# SEO・配信アーキテクチャ・コア仕様 SSOT ガイド

本ドキュメントは、静的 SEO プリレンダリング・配信ルーティング・YouTube API・アプリコア仕様に関する単一真実源（SSOT）です。

---

## 1. SEO・静的プリレンダリング（`vite.config.ts`）

- **データ駆動生成（`generate-seo-dist` プラグイン）**:
  - ビルド時に `SEO_LOCALES` を参照し、`dist/index.html`、各ロケールの `dist/<locale>/index.html`、図解シナリオガイド（`dist/help/index.html`・`dist/<locale>/help/index.html`、`src/help/` から生成）、`dist/robots.txt`、`dist/sitemap.xml` を自動生成する。
  - **注意**: `dist/index.html`（ルート `/`）の生成は `SEO_LOCALES[0]` が英語（`en`）である前提で動作するため、`SEO_LOCALES` の先頭要素は `en` を維持する（もしくは明示的に `en` を検索する）。
- **生成 HTML の必須要素**:
  - 正しい `<html lang="..." dir="...">`、`canonical`、全言語相互 `hreflang`（+ `x-default`）
  - `og:locale` / `og:locale:alternate`、OGP / Twitter カード（`/og-image.png`, 1200×630）
  - `WebApplication`（`softwareVersion` = `package.json` のバージョン）+ `FAQPage`（5問）の JSON-LD
  - 事前ハイドレーション用 HTML（見出し・機能概要・FAQ・各言語 `lang` / `dir` 付き `<nav>` リンク）
- **静的アセットと `sitemap.xml` の同期**:
  - `vite.config.ts` では `publicDir: false` を設定しているため、開発時は `server.ts` が `public/` を配信し、本番ビルド時は `generate-seo-dist` が `public/` のファイルを `dist/` へコピーする。
  - 言語追加などで `sitemap.xml` が更新された際は、ビルド後に必ず `cp dist/sitemap.xml public/sitemap.xml` を実行し、開発サーバー側とも同期する。
- **外部タグ・所有権確認ファイルの保護**:
  - `index.html` の Google アナリティクス / タグマネージャー スクリプト（`GTM-W8NKMDP7`）を削除・改変しない。
  - `index.html` の Google AdSense スクリプト（`ca-pub-8666829667737106`）は絶対に削除・改変しない。
  - Google Search Console 所有権確認ファイル（`public/googleb5dcf5082a5a4463.html` → ビルド時 `dist/googleb5dcf5082a5a4463.html`、URL `/googleb5dcf5082a5a4463.html`）を削除・改変しない。

---

## 2. 配信ルーティング・YouTube 情報取得 API

- **Node / Express（`server.ts`）**:
  - 開発モードでは `/help/`・`/<locale>/help/` を `src/help/renderHelpHtml.ts` から動的レンダリングして HTTP 200 で配信する。
  - 本番モードでは `dist/help/index.html`・`dist/<locale>/help/index.html` および `/^\/([a-z]{2}(?:-[a-z]{2,4})?)(?:\/|$)/i` により `dist/<locale>/index.html` を自動配信する。
- **Vercel（`vercel.json`）**:
  - 各ロケールの `/<locale>`・`/<locale>/`（→ `index.html`）および `/help`・`/<locale>/help`（→ `help/index.html`）をリライトする（新言語追加時に追記が必要）。
- **YouTube 取得 API（`/api/youtube/info`：`server.ts` および `api/youtube/info.ts`）**:
  - 公開動画のみを対象とした読み取り専用エンドポイント（SSRF 防止のため 11 文字の動画 ID 検証後に固定 YouTube オリジンへアクセス）。
  - クエリパラメータ `hl` で選択言語を受け取り、構造化された `errorCode` / `warningCode` を返却してフロントエンド側で現在言語のメッセージへ展開する。

---

## 3. コア機能仕様（維持すべき不変原則）

- **ローカル完結プライバシー**: ローカル動画ファイル（MP4 / MOV / WebM / MKV / M4V 等）の解析・再生・シーン検出はすべてブラウザ内で完結し、外部へ送信しない。
- **3 秒ルール（バックグラウンド解析移行）**: ローカル動画のフレーム対応リスト構築が 3 秒を超える場合は自動的にバックグラウンド処理へ移行し、解析済み範囲から即座に編集可能にする。
- **2 軸の完全分離**: ユーザーが作成する「マーカー＆チャプター」軸と、映像・音声変化から自動抽出する「内部シーン参考」軸は完全に分離し、内部シーンはチャプター出力へ混入させない。
- **テキスト入力／出力（独立2画面構成）**:
  - **テキスト入力（行単位の自動判定）**: 時刻＋タイトル（`0:00` / `00:00` / `00:00:00`、`-` 区切り、括弧付き、タイトル先行、連番、範囲指定）、2列の表形式（タブ区切り TSV・RFC 4180 準拠 CSV・複数スペース／全角スペース区切り、列順不問・片側空セル対応）、時刻のみ（マーカーのみ登録）、タイトルのみ（時刻未確定タイトル登録）が混在したテキストを行単位・元の並び順を保ったまま一括取り込み可能。
  - **テキスト出力（フォーマット選択式）**: 時刻桁数（自動 / `0:00` / `00:00` / `00:00:00`）× 並び・区切り（`時刻 タイトル` / `時刻 - タイトル` / `タイトル 時刻` / `タイトル - 時刻` / `タイトルのみ（翻訳・差し替え用）`）を選択可能。YouTube チャプター必須条件（`0:00` 開始・3件以上・10秒間隔）チェック、クリップボードコピー、`.txt` 保存に対応。
- **順序維持チャプターデータモデル（`ChapterEntry[]`）と区間ズーム・シークバー**:
  - タイムマーカー付き行・マーカーのみ行・時刻未確定タイトル行を単一の順序配列 `ChapterEntry[]` で統合管理し、「時刻→タイトル」と「タイトル→時刻」の双方向編集を実現する。既存タイムライン機能（一括下シフト・上下移動／入れ替え・D&D・空きマーカー自動割当）はすべて維持する。
  - 時刻未確定の行がフォーカスされ、前後の確定済み時刻によって動画全体より狭い探索区間（例：`A–D`）が定まる場合のみ、通常シークバーの区間ハイライトに加えて横幅 100% の **区間ズーム・シークバー** を自動表示する。
- **表形式で編集（2ペイン切替スプレッドシート・ゼロ依存）**:
  - 動画プレーヤーをマウント維持したまま右ペインをタイムラインとスプレッドシートで切り替え可能（モード別の独立パネル幅を保持）。
  - 外部ライブラリ不使用の独自 2D グリッド（`src/utils/spreadsheetEngine.ts` + `src/components/ChapterSpreadsheetPanel.tsx`、上限 `2000 × 52` セル、計算式なし）。単一常駐入力による IME セーフ直接入力、行単位メモ化（`React.memo`）＋カーソル停止後デバウンス連動、行番号左のクイック操作レール（現在時刻→A列・10秒ループ・行メニュー）＆行番号クリック／右クリックの行メニュー、TSV/CSV クリップボード、Undo/Redo、ダーク／ライトシート切替（固定ヘッダーは完全不透明）、文字サイズ 4 段階、行連動の動画自動シーク／自動 10 秒ループ再生（手動 `Ctrl+Enter` / `Cmd+Enter`）、ゆるい保存チェック＋C列以降メモのセッション保持を備える。
