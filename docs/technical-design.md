# 技術設計書: Astro + microCMS 移行

作成日: 2026-07-31
対象: KADOMA ART FES 公式サイト (https://kadoma-artfes.jp/)
関連: `docs/headless-cms-migration-plan.md`(計画)/ `docs/cloudflare-settings.md`(インフラ)

本書は 2026-07-31 実施のリポジトリ全数調査(全 18 HTML + 共通パーツ 4 + JS 6 + CSS 3 + 全アセット)に基づく。

---

## 1. 現況サマリ(調査結果)

### 1-1. ページ構成

**現役ページ(9 + PDF 1)= 新サイトで URL を維持する対象**

| # | URL | 用途 | data-field 化 |
|---|---|---|---|
| 1 | `/index.html` | トップ | 済 |
| 2 | `/kaf_info.html` | KAF とは | 済 |
| 3 | `/kaf_mmg.html` | イベント開催情報 | 済 |
| 4 | `/contest.html` | KAF5 受賞作品 | 未 |
| 5 | `/media.html` | メディア掲載情報 | 未 |
| 6 | `/contest_entry.html` | コンテスト作品募集 | 済 |
| 7 | `/2024gallery.html` | 2024 Photo ギャラリー | 未 |
| 8 | `/kaf_support.html` | 協賛・応援 | 済 |
| 9 | `/contest2024.html` | 2024 受賞作品(contest.html / media.html から被リンク) | 未 |
| 10 | `/KAF5entry.pdf` | 応募要項 PDF | — |

**特殊: `/kaf_marche.html`** — data-field 化済みだがナビ・本文のどこからもリンクされていない孤立ページ(ナビ追加漏れの疑い)。**URL は維持して移行する**が、ナビに載せるかは委員会判断(未決事項)。

**非移行(新サイトに含めない)**: `welcome.html` `check.html` `test01.html` `template.html` `entry.html` `keihin.html` `stamp#U2017rally.html` `kaf_support2024.html` `images/contest/contest_2025.html` `ka5test/` — すべてテスト用・旧版・重複で、被リンクなし(entry.html は check.html からのみ)。→ 新サイトでは 404 になる。要委員会承認(未決事項)。

### 1-2. 共通パーツ(include.js による動的挿入 → ビルド時挿入に置換)

| パーツ | 内容 |
|---|---|
| header.html | サブページ用ヘッダー(Vivus ロゴ SVG + #mainimg) |
| menubar.html | グローバルナビ 8 項目 + SNS アイコン(data-field 6 箇所) |
| hbpinfo.html | H.B.P GALLERY バナー |
| footer.html | 主催・後援表記 + コピーライト |

### 1-3. JS / CSS 資産

- JS 6 ファイル 391 行: `include.js`(40) / `data-loader.js`(123) → **廃止対象**。`main.js`(162) / `jquery.inview_set.js`(36) / `slick-thumbnail.js`(20) / `slick.js`(10) → **無変更で継続使用**
- CSS 3 ファイル 1,083 行: `style.css` / `sub-page.css` / `inview.css` → **1 バイトも変更しない**(CLAUDE.md 制約)
- CDN 依存: jQuery 3.6.0 / Lightbox2 2.10.0 / Swiper @11(未固定) / Slick 1.8.1 / jquery.inview 1.1.2 / Vivus 0.4.6 / FontAwesome 5.15.4(css内) / sanitize.css(未固定・css内) / Google Fonts Zen Maru Gothic(css内)

### 1-4. data.json 連携の現況

- 全 45 フィールド + news 7 件。HTML 側の data-* 属性は **74 箇所**(index 5 / kaf_mmg 11 / kaf_marche 11 / contest_entry 26 / kaf_support 15 / menubar 6)— 行番号付き完全対応表は調査ログ参照
- 未参照フィールド: `edition.slug` `edition.number` `edition.displayNameCompact` `contest.status` `images.flyerBack` `images.webBanner` `gallery.latestYear` `contact.email` `contact.entryEmail` `organization.support`(後3者はハードコードのまま残存)

### 1-5. 調査で発見した既知問題(→ 5 章で対処方針)

| # | 問題 | 影響 |
|---|---|---|
| A | kaf_info / contest / media / 2024gallery が data-loader.js 未読込 | この 4 ページだけナビの「KAF5」「募集終了」等が固定値のまま。data.json 更新から取り残される |
| B | `id="include-footer"` が 5 ページで重複定義 | 2 つ目の footer が挿入されず空 div のまま(現状の表示が「footer 1 つ」で成立している) |
| C | index.html:127 に `aaaaa` デバッグ文字列 | include 失敗時に画面へ露出 |
| D | kaf_marche.html:163 の画像参照が 404(U+2017 ファイル名不一致) | 出展情報画像が表示されない |
| E | media.html:136 のリンク先が contest2024.html(テキストと不一致) | 誤誘導 |
| F | index.html は Swiper 未読込だが main.js(全ページ共通)が `new Swiper` を実行 | index でスクリプトエラー(以降の course-item / grayDisplay 処理が停止。現状の見た目はこの状態で成立) |
| G | jQuery 二重ロード(lightbox-plus-jquery が jQuery 同梱) | 動作はしている(後着が上書き) |
| H | Swiper / sanitize.css のバージョン未固定 | CDN 側更新で挙動が変わり得る |
| I | keihin.html = stamp#U2017rally.html(完全同一)、images/thumb = images/gallery/thumb(完全重複) | 混乱の元(非移行なので自然解消) |

---

## 2. ターゲットアーキテクチャ

```
リポジトリ構成(移行後)

kafwebsite/
├── astro.config.mjs        # build.format:'file' で .html URL を維持
├── package.json            # astro ^7.1(バージョン固定)
├── src/
│   ├── layouts/
│   │   └── Base.astro      # <head> + 共通スクリプト + 開閉メニュー等の共通骨格
│   ├── components/
│   │   ├── HeaderSub.astro     # includeHTML/header.html 相当
│   │   ├── HeaderHome.astro    # index.html 固有の大型ヘッダー
│   │   ├── Menubar.astro       # includeHTML/menubar.html 相当(値はビルド時差し込み)
│   │   ├── HbpInfo.astro       # includeHTML/hbpinfo.html 相当
│   │   ├── Footer.astro        # includeHTML/footer.html 相当
│   │   └── NewsList.astro      # news 配列 → <dt>/<dd> 展開(ビルド時)
│   ├── lib/
│   │   └── content.js      # データ取得層(下記 3 章)
│   ├── data/
│   │   └── site.json       # ローカルデータ(microCMS 未接続時のソース)
│   └── pages/
│       ├── index.astro
│       ├── kaf_info.astro
│       ├── kaf_mmg.astro
│       ├── kaf_marche.astro
│       ├── contest.astro
│       ├── contest2024.astro
│       ├── contest_entry.astro
│       ├── media.astro
│       ├── 2024gallery.astro
│       ├── kaf_support.astro
│       └── archive/            # 新機能(第 3 週)
│           ├── index.astro     # → /archive.html 相当(要 URL 設計確認)
│           └── [year].astro    # → /archive/2024.html 等
├── public/                 # ビルド時に dist/ へそのままコピーされる静的資産
│   ├── css/  (style.css / sub-page.css / inview.css — 無変更コピー)
│   ├── js/   (main.js / slick.js / slick-thumbnail.js / jquery.inview_set.js)
│   ├── images/ , images_gallery/  (無変更コピー)
│   └── KAF5entry.pdf
├── kadoma-artfes.jp/       # ★現行サイト。切替完了まで一切変更しない(main の配信元)
└── docs/
```

### 決定事項

| 項目 | 決定 | 理由 |
|---|---|---|
| Astro 配置 | リポジトリ直下に共存 | `kadoma-artfes.jp/` を温存し main の本番配信を壊さない |
| URL 維持 | `build.format: 'file'` | `src/pages/kaf_mmg.astro` → `/kaf_mmg.html`。全 URL が現行と 1:1 一致 |
| HTML 圧縮 | `compressHTML: false` | 現行 HTML との diff 比較を容易にし、表示一致検証を確実にする |
| include.js / data-loader.js | 廃止 | サーバーサイド(ビルド時)挿入に置換。FOUC 解消・JS 無効環境でも完全表示・SEO 向上 |
| data.json | 廃止(役割を `src/data/site.json` → 将来 microCMS に移管) | 公開ファイルとしての data.json は不要になる |
| CSS | 無変更で public/ へコピー | CLAUDE.md 制約(見た目を一切変えない) |
| jQuery 系 JS | 無変更で public/ へコピー | 同上 |
| CDN スクリプト | 現行と同一 URL・同一順序で読み込み | 挙動を 1 ミリも変えないため(バージョン固定は 5-H 参照) |
| git 上の重複 | 問題なし | public/ へのコピーは同一 blob として保存されるため実質サイズ増ゼロ |

---

## 3. データ取得層の設計

```
src/lib/content.js の動作

ビルド時:
  if (import.meta.env.MICROCMS_SERVICE_DOMAIN && MICROCMS_API_KEY) {
      microCMS API から取得(site-settings / news / editions-archive / sponsors)
  } else {
      src/data/site.json から取得(現 data.json と同一構造)
  }
  → どちらでも同じ形のオブジェクトを返す
```

- **microCMS 未開設でも全ページの実装・検証が可能**(ローカル JSON で動く)。microCMS 開設後は Cloudflare の環境変数を設定するだけで切り替わる
- 環境変数: `MICROCMS_SERVICE_DOMAIN` / `MICROCMS_API_KEY`(検証用 Pages プロジェクトに登録)
- microCMS スキーマ(4 API)は計画書 3 章のとおり。**スキーマ登録用の設計書(フィールド定義一覧)は第 2 週に別ファイルで出力する**

### data.json → site.json 移行時の整理

- 未参照フィールドも**そのまま維持**(microCMS スキーマにも含める)。ハードコードされている `contact.email` / `contact.entryEmail` / `organization.support` は移行時にビルド時差し込みへ置換(5-J)
- news の 7 件は microCMS `news` API の初期データとなる

---

## 4. ページ移植の方針

### 4-1. 基本ルール

1. **DOM 構造を現行と同一に保つ**。class / id / 属性 / 要素順序を変えない(CSS・jQuery プラグインが現行のまま動く前提を守る)
2. data-* 属性(74 箇所)は**属性ごと維持**し、中身のテキスト/src/href をビルド時に `content.js` の値で埋める(属性は無害であり、変更箇所のトレーサビリティになる)
3. 各ページの `<head>` 構成・CDN 読み込みは**現行と同一**(index だけ Swiper なし等の差異も維持 → 5-F)
4. インライン `<style>` ブロック(ページ固有 CSS)は**そのままページ内に維持**
5. インライン `<script>`(Vivus 初期化 / ギャラリー動的生成)も**そのまま維持**

### 4-2. ページ別の要点

| ページ | 移植時の要点 |
|---|---|
| index | HeaderHome / NewsList 使用。news はビルド時展開(dl 内の dt/dd を生成)。`aaaaa` 除去(5-C) |
| kaf_info | 変更なしの静的移植 + Menubar がビルド時値になる(5-A 解消) |
| kaf_mmg | data-* 11 箇所をビルド時差し込み。ギャラリー動的生成 script 維持 |
| kaf_marche | 同上 11 箇所。404 画像の扱いは 5-D |
| contest / contest2024 | 静的移植(作品画像・受賞情報は年次コンテンツのため CMS 化しない。将来はアーカイブ機能で代替) |
| contest_entry | data-* 26 箇所をビルド時差し込み |
| media | 静的移植。リンク不一致は 5-E |
| 2024gallery | 静的移植(28 枚ベタ書きのまま。将来はアーカイブ機能で代替) |
| kaf_support | data-* 15 箇所をビルド時差し込み。協賛一覧はビルド時に sponsors データから生成(microCMS 移行後は管理画面で編集可能に) |

### 4-3. 新機能(第 3 週)

- `/archive.html`(一覧)+ `/archive/{year}.html`(年度別)を `editions-archive` API から生成
- Instagram フィード: 埋め込みサービス(案 6-a)のコードを Footer 上部 or 専用セクションに配置(コード取得は人間タスク)
- menubar への「アーカイブ」導線追加

---

## 5. 既知問題への対処方針

**原則: 「現在ユーザーに見えている表示」を正とし、見た目を変えずに構造の欠陥だけ直す。**

| # | 問題 | 対処 |
|---|---|---|
| A | 4 ページで data-loader 未読込 | **ビルド時差し込みで構造的に解消**(全ページのナビが常に正しい値になる)。見た目変化: ナビの表記が data 由来の正値に揃う(現状も同じ値なので実質無変化) |
| B | include-footer 重複 | ビルド時挿入では**現行の表示と同じ位置に footer を 1 つだけ**出力。空の重複 div は出力しない(表示は不変) |
| C | `aaaaa` 残留 | 除去(現状も画面には出ていないため表示不変) |
| D | marche の 404 画像 | **既に 404 で非表示なので、img タグごと出力しない**か、正しいファイル名(`KAF2024#U2017marche.jpg` は実在)への修正を委員会に確認。**暫定: 現状維持(404 のまま出力)で見た目不変を優先** |
| E | media.html のリンク不一致 | コンテンツ修正のため**委員会確認事項**。暫定: 現状維持 |
| F | index の Swiper エラー | **現状の挙動を維持**(index に Swiper を追加しない)。将来の改善候補としてメモ |
| G | jQuery 二重ロード | **現状維持**(動作している構成を変えない) |
| H | Swiper / sanitize.css 未固定 | Swiper は現行同一 URL を維持(HTML 側)。sanitize.css は CSS 内 @import のため**触らない**(CSS 無変更の制約) |
| J | contact.email 等のハードコード | ビルド時差し込みに置換(値は同一なので表示不変) |

---

## 6. ビルド・デプロイ設計

| 項目 | 値 |
|---|---|
| Node | 22 系(Cloudflare Pages Build v3 で利用可能) |
| ビルド | `npm run build`(= `astro build`)→ `dist/` |
| 検証用プロジェクト | Production branch = `develop`、上記ビルド設定(cloudflare-settings.md 3 章) |
| 本番切替(11月) | 本番プロジェクトの Build command / output を変更 + develop→main マージ |
| microCMS Webhook | コンテンツ公開時 → Cloudflare Deploy Hook(検証用は任意、本番は切替時に設定) |
| 環境変数 | `MICROCMS_SERVICE_DOMAIN` / `MICROCMS_API_KEY`(未設定ならローカル JSON で動作) |

ローカル検証: `npm run dev`(開発サーバー)/ `npm run build && npm run preview`。
表示一致検証: `node scripts/dom-compare.mjs`(下記)+ スクリーンショット比較(第 4 週)。

### 6-1. URL 挙動の検証結果(2026-08-01 実測)

Cloudflare Pages は `.html` 付き URL を拡張子なし URL へ 308 リダイレクトする。
**現行本番サイトも既に同じ挙動**であり、移行による変化はない。

| リクエスト | 現行本番 | 検証環境(Astro 版) |
|---|---|---|
| `/kaf_mmg.html` | 308 → `/kaf_mmg` | 308 → `/kaf_mmg` |
| `/kaf_mmg` | 200 | 200 |
| `/index.html` | 308 → `/` | 308 → `/` |

→ 受入基準 1(URL 一致)は**リダイレクト挙動を含めて満たしている**。
`build.format: 'file'` により `dist/` 側のファイル名も現行と 1:1 で一致する。

### 6-2. DOM 等価性の自動検証(`scripts/dom-compare.mjs`)

parse5(ブラウザ同等の HTML5 パーサ)で以下を比較する回帰テスト。

- 比較対象 A: 現行 HTML に include.js と data-loader.js の処理をシミュレート適用した DOM
  (= 移行前にユーザーが実際に見ている状態)
- 比較対象 B: `dist/` のビルド結果
- 判定: タグ / id / class / src / href / data-* の構造ツリーと、全テキストの完全一致
- 意図した差分のみ許容: フッター組織名の誤記是正、空の重複 include-footer div の非出力

実行結果(2026-08-01): **全 10 ページで構造・テキストとも一致**。

### 6-3. デプロイ検証(2026-08-01 実測)

検証環境 `kadoma-artfes-staging.pages.dev` にて確認済み。

- 全 10 ページ + CSS 3 / JS 4 / 画像 / PDF がすべて 200
- 旧 `include.js` / `data-loader.js` への参照は 0 件
- **デプロイされた HTML 10 件すべてがローカル `dist/` と SHA256 完全一致**
  → ローカルで検証した DOM 等価性が、そのまま本番同等環境でも成立していることを確認

---

## 7. 受入基準(検収条件の技術的定義)

1. **URL 一致**: 1-1 の表の全 URL が dist/ に存在する(`/index.html` 〜 `/kaf_support.html`、`/contest2024.html`、`/kaf_marche.html`、`/KAF5entry.pdf`)
2. **表示一致**: 全現役ページについて、現行本番とのスクリーンショット比較で意図しない差異がない(意図した差異 = 5 章で承認されたもののみ)
3. **動作一致**: ハンバーガーメニュー / スムーススクロール / ページトップ / フェードイン / パララックス / Slick スライド / Lightbox / Vivus ロゴアニメが全ページで現行同等に動作
4. **CMS 反映**: microCMS(または site.json)の値変更 → 再ビルドで全ページへ反映
5. **新機能**: /archive 一覧・年度別ページが editions-archive から生成される。Instagram フィードが表示される
6. **JS 無効環境**: JS を切っても全文・ナビの文言が完全表示される(現行より改善)

---

## 8. 未決事項(委員会確認)

| # | 事項 | 暫定方針 |
|---|---|---|
| 1 | kaf_marche.html をナビに載せるか | 載せない(現状維持)。URL は維持 |
| 2 | 非移行ページ(welcome / check / test01 / template / entry / keihin / stamp‗rally / kaf_support2024)が新サイトで 404 になることの承認 | 404 で問題ない想定(全て被リンクなしのテスト・旧版) |
| 3 | media.html:136 のリンク先修正(contest2024 → 正しい先) | 現状維持のまま移行、修正は別途 |
| 4 | marche の 404 画像の扱い | 現状維持(404)のまま移行 |
| 5 | /archive の URL 形式(`/archive.html` + `/archive/2024.html` の混在で良いか) | この形式で実装 |
