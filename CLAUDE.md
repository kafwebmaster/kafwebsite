# KADOMA ART FES 公式サイト 運用方針

このドキュメントは、Claude Code がこのプロジェクトに関わる際に最初に参照すべき基本方針書です。
作業を開始する前に必ず全文を読み、以下の制約と方針に従ってください。

> 2026-09 改訂: Astro + microCMS + Cloudflare Pages への移行が**完了**し、本番公開済みです。
> 移行前(素の HTML + data.json 計画)を前提とした旧版の内容は Git 履歴を参照してください。

## プロジェクト概要

- **サイト名**: KADOMA ART FES 公式サイト
- **URL**: https://kadoma-artfes.jp/ (本番) / https://kadoma-artfes-staging.pages.dev/ (確認用)
- **主催**: 門真市文化芸術活動推進基本計画パイロットプロジェクト実行委員会
- **現在の大会**: KADOMA ART FES 6 (KAF6)
  - 会期: 2026年9月26日(土)〜10月25日(日)、森川ビル / 大和田南商店街 周辺
  - コンテストなし(過去受賞者作品の展示)。サブイベント: ギャラリートーク、カドマアート・アートラウンジ
- **並行運用中**: KADOMA ART FES 7 CONTEST 作品募集
  - 受付: 2026年11月20日(金)〜2027年2月20日(土) / 展示: 2027年4月29日〜5月5日、京阪古川橋駅前周辺地域

## 技術スタック(現状)

- **Astro 7.1.6** による静的ビルド (`build.format:'file'` で .html URL を維持、`compressHTML:false`)
- **microCMS** (サービスID `kadoma-artfes`、無料プラン): site-settings / news / editions-archive / sponsors の 4 API
- **Cloudflare Pages**:
  - 本番プロジェクト `kafwebsite` … main ブランチ、`npm run build` → `dist/`
  - 検証プロジェクト `kadoma-artfes-staging` … develop ブランチ、同設定
  - どちらも環境変数 `MICROCMS_SERVICE_DOMAIN` / `MICROCMS_API_KEY`(Secret)を保持
- フロントは移行前と同一の jQuery 3.6.0 + Slick + Lightbox2 + Swiper + Vivus + inview(すべて CDN)
- 文字コード UTF-8(BOM なし)、改行 LF

## データ管理の分担(重要)

| 種類 | 置き場所 | 例 |
|---|---|---|
| 年度更新される値 | **microCMS**(`src/lib/content.js` の FIELD_MAP に対応表) | 大会名・開催日・締切・画像 |
| 文章・構造化コンテンツ | **src/data/site.json** の JSON 専用キー(FIELD_MAP 外はパススルーで通る) | 募集要項の文面・規約・店舗一覧 |
| 過去の記録 | ページに固定値で保持 | media.html の掲載記録、協賛の KAF5 実績 |

- CMS 未入力・取得失敗時は site.json へフォールバックする(ビルドは決して失敗しない設計)
- 文中に CMS 値を差し込む場合は差込み記法 `{contest.entryDeadlineShort}` を使う(`fillFields()`)。
  **日付等を文章に直書きしない**(CMS 更新に追従しなくなる事故が実際に起きた)
- メディア(画像/PDF)はビルド前に `scripts/sync-cms-assets.mjs` がローカルへミラーする(転送量対策)。
  **応募用紙 PDF は microCMS に置かず**(ファイルアップロードは有料) `public/KAF7entry.pdf` を Git 管理する
- メールアドレスの使い分け: `contact.email`(渉外・協賛) / `contact.entryEmail`(作品応募。応募ページには現在非表示)

## 厳守すべき制約

1. **既存の CSS ファイル(public/css/style.css, sub-page.css, inview.css)には手を入れない**。
   ページ固有の調整は各ページの `<style is:inline>` ブロックに追記する
2. **既存のアニメーション処理(main.js, jquery.inview_set.js, slick*.js)には手を入れない**
3. **見た目・レイアウトを指示なく変えない**。既存クラスの再利用を優先する
4. **日本語テキストを機械的に言い換えない**。原文・確定した指示の文言を一字一句そのまま使う
5. **UTF-8(BOM なし)・LF を維持する**
6. **`kadoma-artfes.jp/` フォルダ(移行前の旧サイト一式)には触らない**(歴史的記録として残置)
7. 未確定情報は【要確認】マーカー付きで掲載し、確定後に外す
8. microCMS のフィールド ID は 20 文字以内。スキーマ変更は docs/microcms-schema.md と FIELD_MAP を必ず同期させる

## ブランチ運用(ユーザーとの合意事項・厳守)

1. **develop・main へ直接コミットしない**。必ず feature ブランチ → PR
2. feature PR → **develop**(マージはユーザーが承認)→ ステージングで確認
3. 本番反映は **develop → main のリリース PR**(マージはユーザー)。マージで自動デプロイされる
4. マージ済み PR のブランチに追いコミットしない(新しいブランチ + 新しい PR にする)
5. 内容変更にはビルド+テスト(`node scripts/test-content-mapping.mjs`)を通し、
   規模の大きい変更は独立した監査(別エージェント等)で検証してから PR を出す

## リポジトリ構成(要点)

- `src/pages/*.astro` … 全 11 ページ + `archive/[year].astro`(CMS 登録で自動生成)
- `src/components/` … HeaderSub / Menubar / Footer / NewsList / HbpInfo / DevBanner(開発中バナー。
  *.pages.dev と localhost のみ表示され、本番ドメインには出ない)
- `src/lib/content.js` … データ取得層(FIELD_MAP・フォールバック・fillFields・アーカイブ正規化)
- `scripts/` … seed-microcms(初期投入・使用済) / sync-cms-assets(メディアミラー) /
  postbuild-redirects(旧URL転送 + 受賞作品ページの非公開 302) / test-content-mapping(テスト) / dom-compare(移行時の検証)
- `public/` … CSS/JS/画像(無変更コピー)+ 応募用紙 PDF
- 表示のオン/オフは `site.json` の `visibility` フラグ(受賞作品メニュー・メディアページ末尾の開催情報)

## ドキュメント

- `docs/update-guide.md` … **運営スタッフ向けの更新手順**(平易な日本語)
- `docs/technical-design.md` … 移行時の技術設計
- `docs/microcms-schema.md` … CMS スキーマとフィールド対応表(FIELD_MAP と同期必須)
- `docs/cloudflare-settings.md` … Cloudflare 設定記録・復旧手順
- `docs/archive-feature-design.md` … アーカイブ機能の設計(既知の課題: KAF5/KAF6 が同じ開催年 2026 で衝突する)

## 直近の予定(2026-09 時点)

| 時期 | 予定 | 主な作業 |
|---|---|---|
| 〜10月 | KAF7 向け CMS フィールド接続(JSON 専用キーの CMS 化) | 開発 |
| 〜10月 | アーカイブの年衝突(KAF5/KAF6=2026)の解決 | 開発 |
| 11/20 | KAF7 応募受付開始 | CMS: フォーム URL 入力・ステータス「募集中」 |
| 11月 | KAF6 写真のアーカイブ登録 | CMS |
| 2027/2/20 | KAF7 応募締切 → ステータス「募集終了」 | CMS |

## コミット・PR の書き方

- コミットメッセージは日本語で「何を・なぜ」が分かるように
- PR には、変更内容・検証結果・ユーザー側で必要な CMS 操作を明記する
- 判断に迷った表記・仕様は勝手に確定せず、PR に「判断した点」として明示する
