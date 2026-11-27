# AGENTS.md — YouTube Video Chapter Marker

本プロジェクトで作業するエージェントおよび開発者は、作業開始時に本ファイルを確認し、該当領域の SSOT ガイド（`.agents/guides/`）を参照してください。

---

## 1. プロジェクト基本情報（不変）

- **アプリ名**: YouTube Video Chapter Marker（※ `metadata.json` の `"name"` は変更しない）
- **本番 URL**: `https://youtube-video-chapter-marker.vercel.app/`
- **GitHub OSS**: `https://github.com/jakenjarvis/YouTubeVideoChapterMarker`（Apache-2.0）
- **スタック**: React 19 / TypeScript / Vite 8 / Tailwind CSS v4 / Express (`server.ts`) / Vercel Serverless (`api/youtube/info.ts`)
- **動作原則**: ローカル動画の解析・再生・シーン検出はブラウザ内で完結させ外部送信しない。YouTube URL 読み込みは公開動画対象の **読み取り専用**（API キー・ログイン不要）。

---

## 2. 常時遵守ルール

1. **バージョン更新を忘れない**
   - 機能追加・言語追加・仕様変更などリリース単位の変更では、必ず `package.json` の `"version"` を更新する（ヘッダーの `Ver x.y.z` と JSON-LD `softwareVersion` に自動反映）。
2. **1ステップずつ実装し、確認してから次へ進む**
   - 複数言語追加や大規模改修をまとめて行わず、1対象ごとに **実装 → 検証 → 表示確認** のサイクルを守る。
3. **既存タグ・設定の保護**
   - `index.html` の Google アナリティクス / タグマネージャー（`GTM-W8NKMDP7`）および Google AdSense スクリプト（`ca-pub-8666829667737106`）を削除・改変しない。
   - Google Search Console 所有権確認ファイル（`public/googleb5dcf5082a5a4463.html`）を削除・改変しない。
   - `metadata.json` のアプリ名・権限や、既存言語・編集ワークフローを破壊しない。
4. **変更後の必須検証**
   - `npm run lint`（`tsc --noEmit`）、`npm test`、`npm run build`、`npm run test:build` のすべてをエラーゼロで通す（GitHub Actions `.github/workflows/ci.yml` でも同じチェックが実行される）。
   - 言語・SEO・ルーティング変更時は、`public/sitemap.xml` 同期および開発サーバーの HTTP 200 まで確認する。

---

## 3. SSOT ガイド参照マップ（`.agents/guides/`）

作業内容に応じて、以下の SSOT ドキュメントを必ず先に読み込むこと。仕様を変更した場合は対応するガイドも同時に更新する。

| ガイド | 主な内容（SSOT） | 読み込みタイミング |
| :--- | :--- | :--- |
| [`.agents/guides/i18n.md`](./.agents/guides/i18n.md) | 翻訳ポリシー、対応11言語一覧（アルファベット順・BCP 47表記）、言語解決・複数形・新言語追加手順 | 翻訳・文言修正、言語追加、言語切替UI、複数形・数値整形を扱うとき |
| [`.agents/guides/ui-rtl.md`](./.agents/guides/ui-rtl.md) | ダークスタジオ UI、ヘッダー3ゾーン（OSSリンク）、RTL反転とLTR隔離、BiDi、ショートカット、サンプル動画 | UI・レイアウト変更、RTL/BiDi確認、ショートカットや Canvas 処理を触るとき |
| [`.agents/guides/seo-architecture.md`](./.agents/guides/seo-architecture.md) | 静的SEO生成、`sitemap.xml`同期、配信ルーティング、YouTube API、コア機能仕様（3秒ルール・2軸分離等） | `vite.config.ts`、`index.html`、`server.ts`、`vercel.json`、YouTube連携やコア動作を触るとき |
