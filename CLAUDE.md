# KADOMA ART FES 公式サイト リファクタリング方針

このドキュメントは、Claude Code がこのプロジェクトに関わる際に最初に参照すべき基本方針書です。
作業を開始する前に必ず全文を読み、以下の制約と方針に従ってください。

## プロジェクト概要

- **サイト名**: KADOMA ART FES 公式サイト
- **URL**: https://kadoma-artfes.jp/
- **主催**: 門真市文化芸術活動推進基本計画パイロットプロジェクト実行委員会
- **性質**: 年1回開催のアートイベント公式サイト。年度ごとに開催日・大会番号・画像・募集情報などが更新される
- **ホスティング**: ヘテムル(GMOペパボ)、FTPによる手動アップロード運用
- **現在の大会**: KADOMA ART FES 5 (KAF5)、2026年3月7日〜8日開催

## 技術スタック(現状)

- 素の HTML5 + CSS3(プリプロセッサなし)
- jQuery 3.6.0(CDN)
- Slick Carousel 1.8.1、Lightbox2 2.10.0、Swiper 11、Vivus、jquery.inview(すべて CDN)
- ビルドプロセスなし
- 共通パーツは jQuery の `.load()` によるクライアントサイド include
- 文字コード: UTF-8(BOM なし)
- 改行コード: LF

## 今回の作業の目的

年度依存情報(開催日、大会番号、画像パス、募集状況など)を `data.json` に集約し、
年度更新時に編集すべき箇所を 1 ファイルに集中させる。これにより:

- 年度更新作業の所要時間を「半日〜1日」から「10〜20分」に短縮する
- 複数ファイルにまたがる更新漏れ(例: 過去に kaf_marche.html が 2024 年のまま放置された事故)を防ぐ
- 将来的な静的サイトジェネレータ(Astro 等)への移行の下地を作る

## 厳守すべき制約

以下は **絶対に変更してはいけない** 項目です。指示があっても、これらを侵す場合は必ず確認を求めてください。

1. **リニューアルはしない**。既存の jQuery + 素の HTML 構成を維持する
2. **ビルドプロセスを導入しない**。Node.js、npm、Webpack、Vite、Tailwind、React、Vue、Next.js、Astro 等の導入は今回のスコープ外
3. **既存の CSS ファイル(css/style.css, css/sub-page.css, css/inview.css)には手を入れない**。見た目は一切変えない
4. **既存のアニメーション処理(jquery.inview_set.js, slick.js, main.js)には手を入れない**
5. **FTP アップロードでヘテムルに置く運用を前提とする**。デプロイ手段は変更しない
6. **ファイル文字コードは UTF-8(BOM なし)、改行は LF を維持する**
7. **既存の HTML の見た目・レイアウト・デザインを一切変えない**。変わるのは「ハードコードされた値が data-field 属性経由で差し込まれる」という裏の仕組みだけ
8. **日本語テキストを機械的に翻訳・言い換えしない**。data.json への移植時は原文を一字一句そのままコピーする

## 実装方針

### データ集約の方針

- `data.json` をルート(`kadoma-artfes.jp/data.json`)に配置
- 現大会の情報のみを保持する(過去大会のアーカイブは Git 履歴に任せる)
- スキーマは後述の「data.json スキーマ」セクションを参照
- 日付の表記バリエーション(例: `2026年3月7日` と `2026年03月07日`)は統一せず、表記ごとに別キーで持つ

### ローダの方針

- `js/data-loader.js` を新規作成
- jQuery の `$.getJSON()` で `data.json` を取得
- `data-field` 属性を持つ要素にテキストを差し込む
- `data-src-field` 属性を持つ要素に src を差し込む
- `data-href-field` 属性を持つ要素に href を差し込む
- `data-news-list` 属性を持つ要素に news 配列を展開する
- ドット区切りパス記法に対応(例: `data-field="event.dateRange"`)

### include.js の Promise 化

- 既存の `js/include.js` を Promise 化し、すべての共通パーツの読み込み完了後に `includes:loaded` カスタムイベントを発火する
- `data-loader.js` はこのイベントを待ってから data-field の差し込み処理を行う
- これにより、共通パーツ(includeHTML/header.html など)内の data-field も正しく動作する

### 画像の整理方針

- 現在ルート `images/` 直下に散乱している大会関連画像を、`images/editions/kaf5/` のように **大会番号フォルダ + 固定ファイル名** で整理する
- 固定ファイル名は以下の通り(スキーマと一致):
  - `flyer_front.jpg` - フライヤー表
  - `flyer_back.jpg` - フライヤー裏
  - `flyer_full.jpg` - フライヤー全体
  - `main_visual.jpg` - メインビジュアル
  - `support_list.jpg` - 協賛一覧
  - `web_banner.jpg` - Web バナー
  - `entry_thumbnail.png` - 応募要項サムネイル
- 共通画像(ロゴなど)は `images/common/` に隔離
- **既存の画像ファイルは削除せず、新しい場所にコピーする**(参照を段階的に切り替えるため)

## data.json スキーマ

```json
{
  "edition": {
    "slug": "kaf5",
    "number": 5,
    "displayName": "KADOMA ART FES 5",
    "displayNameShort": "KAF5",
    "displayNameCompact": "KADOMAARTFES5",
    "fiscalYearLabel": "2025年度",
    "eventYear": 2026,
    "yearsRunning": 5
  },
  "event": {
    "dateRange": "2026年3月7日 (土) - 3月8日 (日)",
    "dateRangeLong": "2026年03月07日 (土) 〜 03月08日 (日)",
    "time": "10:00 〜 16:00",
    "timeShort": "10:00-16:00",
    "venue": "大和田駅前広場 / 大和田南商店街 周辺",
    "admission": "無料"
  },
  "contest": {
    "status": "closed",
    "statusLabel": "募集終了",
    "entryDeadline": "2025年11月30日(日)",
    "entryDeadlineShort": "2025年11月30日",
    "exhibitionPeriod": "2026年3月7日 (土) 〜 3月8日 (日)",
    "entryPdf": "KAF5entry.pdf"
  },
  "marche": {
    "displayName": "カドマアート・マルシェ in 大和田 2026",
    "dateRange": "2026年3月7日 (土) 〜 3月8日 (日)",
    "time": "10:00 〜 16:00"
  },
  "images": {
    "flyerFront": "images/editions/kaf5/flyer_front.jpg",
    "flyerBack": "images/editions/kaf5/flyer_back.jpg",
    "flyerFull": "images/editions/kaf5/flyer_full.jpg",
    "mainVisual": "images/editions/kaf5/main_visual.jpg",
    "supportList": "images/editions/kaf5/support_list.jpg",
    "webBanner": "images/editions/kaf5/web_banner.jpg",
    "entryThumbnail": "images/editions/kaf5/entry_thumbnail.png"
  },
  "gallery": {
    "latestYear": 2024,
    "latestPage": "2024gallery.html",
    "latestLabel": "2024イベント風景Photoギャラリー"
  },
  "contact": {
    "email": "kadoma.art.fes2021@gmail.com"
  },
  "organization": {
    "host": "門真市文化芸術活動推進基本計画パイロットプロジェクト実行委員会",
    "coHost": "門真市・NPO法人トイボックス",
    "support": "京阪ホールディングス株式会社"
  },
  "social": {
    "youtube": "https://www.youtube.com/@kadomaartfes",
    "instagram": "https://www.instagram.com/pilot_kadoma/"
  },
  "news": [
    {
      "date": "2026/02/05",
      "category": "メディア掲載情報",
      "text": "アートフェス作品審査会にてご紹介いただきました",
      "link": "media.html"
    }
  ]
}
```

## 作業の進め方

- **小さく刻むこと**。1 プロンプト 1 ファイル、あるいは 1 プロンプト 1 機能を原則とする
- ファイル編集前には必ず差分を提示し、人間の承認を得てから書き込む
- 複数ファイルにまたがる機械的な置換でも、最初の 1 ファイルで動作確認してから残りに展開する
- 作業の具体的な順序は `docs/refactoring-plan.md` を参照
- 各ステップで使う指示テンプレートは `docs/prompts.md` を参照
- 不明な点があれば作業を進める前に必ず人間に確認する

## 対象ファイル

### 改修対象(優先順)
1. `index.html` — トップページ
2. `kaf_mmg.html` — メインイベント詳細
3. `kaf_marche.html` — マルシェ情報(現状 2024 年のまま取り残されているので特に注意)
4. `contest_entry.html` — コンテスト募集要項
5. `kaf_support.html` — 協賛案内
6. `includeHTML/menubar.html` — 共通ナビ(大会番号を含む文字列あり)

### 改修対象外(触らない)
- `contest.html`, `contest2024.html` — 受賞作品アーカイブ(年ごとに内容自体が変わる性質)
- `2024gallery.html` — 過去のギャラリー(固定)
- `welcome.html`, `check.html`, `test01.html`, `template.html` — テスト・テンプレート用
- `ka5test/` フォルダ配下全体 — テスト環境のミラー
- ルート直下の旧版ファイル群 — 旧バックアップ

## 作業完了後の引き継ぎ

すべての改修が完了したら、以下を必ず更新してください:

- `docs/update-guide.md` に「次回の年度更新手順」を運営スタッフ向けに平易な日本語でまとめる
- `CLAUDE.md` の「現在の大会」セクションを最新情報に合わせる
- コミットメッセージは日本語で、何を・なぜ変更したかが分かるように書く
