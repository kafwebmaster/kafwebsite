# アーカイブ機能 設計書(第 3 週)

作成日: 2026-08-02
関連: `docs/technical-design.md` / `docs/microcms-schema.md`(API③ editions-archive)

---

## 1. 要件(委員会確認済み)

1. **最新イベントの訴求枠**: メニューの「◯◯◯◯イベント風景Photoギャラリー」は
   **最新 1 大会**を大きく見せる枠として維持する(現行の 2024 の位置に KAF5/2026 が入る)
2. **アーカイブ**: 最新より**過去の大会**を一覧で見られる別枠を新設する
3. **年次運用の自動化**: microCMS に翌年の大会を 1 件登録するだけで、
   - メニューのラベルとリンク先が新年度に切り替わる
   - 旧・最新だった大会が自動でアーカイブ一覧へ降りる
4. 公開時(11 月)には **KAF5(2026)= 最新枠、KAF4(2024)= アーカイブ**が
   最初から揃った状態にする
5. 年の表記は**開催年**(KAF5 = 2026。2025 は存在しない年になる)

## 2. URL 設計

| URL | 内容 | 生成条件 |
|---|---|---|
| `/archive.html` | アーカイブ一覧(最新を除く過去大会のカード) | 常に生成 |
| `/archive/{year}.html` | 年度別詳細(例 `/archive/2024.html`, `/archive/2026.html`) | CMS の editions-archive 1 件につき 1 ページ |

- **最新大会の詳細ページも `/archive/{year}.html` に生成する**
  (メニューの「2026イベント風景Photoギャラリー」のリンク先 = `/archive/2026.html`。
   一覧には載せないだけで、ページ自体は同じ仕組みで作る)
- 既存 `/2024gallery.html` は**当面そのまま残す**(URL 維持)。
  CMS に 2024 が登録されてビルドされた場合のみ、`_redirects` により
  `/2024gallery.html → /archive/2024.html` の 301 を出力する(7 章)

## 3. データ設計

### 3-1. 使用スキーマ(登録済みの editions-archive をそのまま使用)

| フィールド | 用途 |
|---|---|
| `year`(数値・必須) | URL・並び順・「最新」の判定 |
| `title`(必須) | 大会名(例: KADOMA ART FES 5) |
| `dateRange` | 開催期間の表示 |
| `description` | 紹介文 |
| `heroImage` | 一覧カードと詳細ページの代表画像 |
| `gallery`(複数画像) | 詳細ページの写真グリッド |

**受賞作品(awardWinners 繰り返しフィールド)は v1 に含めない。**
繰り返し/カスタムフィールドのインポート形式が未検証のため、後続改修とする
(スキーマへのフィールド追加は後からでも既存データに影響しない)。

### 3-2. 取得と派生値(`src/lib/content.js`)

```
archives = editions-archive 全件を year 降順で取得
latest   = archives[0]            (year 最大 = 最新大会)
past     = archives.slice(1)      (アーカイブ一覧に載せる過去大会)
```

### 3-3. メディアの転送量対策

`heroImage` / `gallery` の画像も **sync-cms-assets.mjs でビルド時ミラー**の対象に
加える(site-settings と同じ仕組み。microCMS 無料枠 20GB/月 の保護)。
ファイル名衝突を避けるため `public/cms-assets/archive/{year}/` 配下に保存する。

## 4. 表示の切り替えロジック(最重要)

### 4-1. メニュー(Menubar.astro)

| 状態 | 「イベント風景Photoギャラリー」枠 | 「アーカイブ」項目 |
|---|---|---|
| **CMS にアーカイブ 0 件**(現在) | 現行どおり site-settings の `gallery.latestPage` / `latestLabel`(= 2024gallery.html) | **出さない** |
| **1 件以上** | `/archive/{latest.year}.html` / `{latest.year}イベント風景Photoギャラリー` | 「アーカイブ」→ `/archive.html` を**ギャラリー枠の直後に追加** |

- **0 件のときは現行とビット単位で同一の出力**になる(機能が「眠っている」状態)。
  これにより既存の DOM 等価性検証(dom-compare)が壊れず、コンテンツ登録前に
  マージ・デプロイしても表示に一切影響しない
- site-settings の `gallery_latestPage` / `gallery_latestLabel` は
  アーカイブ運用開始後は**使われなくなる**(フォールバックとしてのみ残す)

### 4-2. アーカイブ一覧(/archive.html)

- `past` をカード形式(heroImage + 年 + 大会名 + 期間)で年降順に表示
- `past` が 0 件(= 大会が 1 件しか無い)の場合は「アーカイブは準備中です」を表示
- CMS 未接続・0 件でもページ自体は生成する(リンク切れを作らない)

### 4-3. 年度別詳細(/archive/[year].html)

- `getStaticPaths` で archives 全件からページ生成
- 構成(既存 2024gallery.html の見た目を踏襲、CSS は既存クラスのみ使用):
  1. HeaderSub(共通ヘッダー)
  2. `section.bg1`: h2(blur スタイルで「{year}イベント風景Photoギャラリー」)+ title + dateRange + description + heroImage
  3. `section.course.gallery`: gallery 画像のグリッド(`.course-item` パターン)
     → クリックで拡大表示(main.js の `#grayDisplay` モーダルを利用)
  4. Menubar / Footer / pagetop(既存コンポーネント)

## 5. サブディレクトリのパス問題と解決策

`/archive/2024.html` は**サブディレクトリ配下**のため、既存コンポーネントの
相対パス(`href="index.html"`、`xlink:href="images/logo.png"` 等)がそのままでは
`/archive/index.html` を指して壊れる。

**解決策: コンポーネントに `base` プロパティを追加する(既定値 `""`)**

- `Menubar` / `HeaderSub` / `Footer` の内部リンク・画像参照を `{base}index.html` の形に変更
- 既存 10 ページは props を渡さない → `base=""` → **出力は現状と 1 文字も変わらない**
- アーカイブ配下のページだけ `base="/"` を渡す → ルート絶対パスになり正しく解決

`<base href>` タグ案は却下(href="#" の解決が変わるなど副作用があるため)。

## 6. 詳細ページのスクリプト構成

既存 2024gallery.html と**同一のスクリプトセット**を読み込む(CDN の URL・順序も同じ)。

理由: main.js は全ページ共通で `new Swiper(...)` を実行するため、
Swiper CDN を読まないページでは ReferenceError で後続処理
(`#grayDisplay` モーダルの click バインド等)が停止する(既知問題 F)。
2024gallery と同じセットなら、モーダル拡大まで既存挙動どおり動く。

ローカル JS / CSS への参照はすべて `/js/...` `/css/...` のルート絶対パスで書く
(新規ページなので既存 DOM との一致制約は無い)。

## 7. 旧 URL のリダイレクト

ビルド後スクリプト(`scripts/postbuild-redirects.mjs`)で、
**CMS に year=2024 のアーカイブが存在するビルドのときだけ** `dist/_redirects` に

```
/2024gallery.html /archive/2024.html 301
```

を出力する(Cloudflare Pages の `_redirects` 機能)。
存在しないビルド(現在)ではリダイレクトを出さず、既存ページがそのまま生きる。
→ どの時点のビルドでも「2024 のギャラリー URL」が必ず生きている状態を保つ。

## 8. 段階的ロールアウト(壊れる瞬間が無いことの確認)

| 段階 | CMS の状態 | サイトの見え方 |
|---|---|---|
| 今回のマージ直後 | アーカイブ 0 件 | **現行と完全一致**(機能は眠っている) |
| KAF4(2024)登録 | 1 件 | メニュー最新枠 =「2024…」(/archive/2024.html)、アーカイブ項目出現(一覧は準備中表示)、2024gallery→301 |
| KAF5(2026)登録 | 2 件 | メニュー最新枠 =「2026…」、アーカイブ一覧に 2024 |
| 来年 KAF6(2027)登録 | 3 件 | 最新枠 = 2027、一覧に 2026・2024(**手作業ゼロ**) |

推奨登録順: **KAF4 → KAF5**(先に 2026 を入れても壊れないが、上記の順が自然)。

## 9. テスト計画

1. **休眠状態の回帰**: 環境変数なしビルド → dom-compare 全 10 ページ一致(現行どおり)
2. **フィクスチャテスト**: アーカイブ 2 件(2024/2026)のモックで:
   - `/archive.html` に 2024 のみ(2026 は載らない)
   - `/archive/2024.html` `/archive/2026.html` が生成される
   - メニューが「2026イベント風景Photoギャラリー」+「アーカイブ」になる
   - 詳細ページ内のリンク・CSS・JS 参照がすべて絶対パスで解決する
   - `_redirects` が出力される
   - 1 件のみのモックで一覧が「準備中」表示になる
3. **マッピング単体テスト**: mapArchives(year 降順ソート・latest/past 分割)を追加

## 10. スコープ外(将来)

- 受賞作品(awardWinners)表示 — スキーマ形式検証後に追加
- KAF1〜3 の遡及登録(オプション)
- 一覧カードのデザイン装飾強化(v1 は既存クラスの範囲で構成)
