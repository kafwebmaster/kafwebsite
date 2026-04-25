# kafwebsite

「KADOMA ART FES」公式サイトの更新用リポジトリー

## サイト概要

- **サイト名**: KADOMA ART FES 公式サイト
- **URL**: https://kadoma-artfes.jp/
- **主催**: 門真市文化芸術推進基本計画パイロットプロジェクト実行委員会
- **現在の大会**: KADOMA ART FES 5 (KAF5)、2026年3月開催
- **ホスティング**: ヘテムル(GMOペパボ)、FTP による手動アップロード運用

## 技術スタック

- HTML5 + CSS3(プリプロセッサなし、ビルドプロセスなし）
- jQuery 3.6.0 (CDN)
- Slick Carousel 1.8.1 / Lightbox2 2.10.0 / Swiper 11 / Vivus / jquery.inview (CDN)
- 共通パーツは jQuery の `$.get()` によるクライアントサイド include (`js/include.js`)
- 年度依存データは `data.json` + `js/data-loader.js` で一元管理（後述）

## ディレクトリ構成(主要ファイル)

```
kafwebsite/
├── CLAUDE.md                    # Claude Code 用プロジェクト方針書
├── README.md                    # このファイル
├── readme.txt                   # 共通化処理の技術メモ(旧)
├── docs/
│   ├── refactoring-plan.md      # リファクタリング計画書
│   └── prompts.md               # 各フェーズの指示テンプレート
└── kadoma-artfes.jp/            # 本番デプロイ対象
    ├── data.json                # 年度依存データ(一元管理)
    ├── index.html               # トップページ
    ├── kaf_mmg.html             # メインイベント詳細
    ├── kaf_marche.html          # マルシェ情報
    ├── contest_entry.html       # コンテスト募集要項
    ├── kaf_support.html         # 協賛・応援
    ├── contest.html             # 受賞作品(アーカイブ、改修対象外)
    ├── includeHTML/
    │   ├── header.html          # 共通ヘッダー
    │   ├── menubar.html         # 共通ナビ
    │   ├── hbpinfo.html         # H.B.P ギャラリー案内
    │   └── footer.html          # 共通フッター
    ├── js/
    │   ├── include.js           # 共通パーツ読み込み(Promise 化済み)
    │   ├── data-loader.js       # data.json ローダー
    │   ├── main.js              # メインスクリプト(変更不可)
    │   ├── slick.js             # スライドショー設定(変更不可)
    │   ├── slick-thumbnail.js   # サムネイルスライド(変更不可)
    │   └── jquery.inview_set.js # inview アニメーション設定(変更不可)
    ├── css/
    │   ├── style.css            # メインスタイル(変更不可)
    │   ├── sub-page.css         # サブページスタイル(変更不可)
    │   └── inview.css           # inview アニメーション(変更不可)
    └── images/                  # 画像ファイル
```

## リファクタリング: data.json による年度情報の一元管理

### 背景と目的

年度ごとに更新が必要な情報(開催日、大会番号、画像パス、募集状況など)が複数の HTML ファイルにハードコードされており、更新漏れが発生していた(例: kaf_marche.html が 2024 年のまま放置)。

`data.json` に年度依存情報を集約し、`data-loader.js` で各ページに差し込むことで、年度更新時に編集すべきファイルを 1 つに集中させた。

### 仕組み

1. **`data.json`**: 年度依存の全情報(大会名、日程、募集状況、画像パス、ニュース等)を保持
2. **`js/include.js`**: 共通パーツ(header, menubar, footer 等)を非同期で読み込み、完了後に `includes:loaded` カスタムイベントを発火
3. **`js/data-loader.js`**: `includes:loaded` イベントを待ってから `data.json` を取得し、以下の属性を持つ HTML 要素にデータを差し込む

| 属性名 | 動作 | 例 |
|---|---|---|
| `data-field="path"` | 要素のテキストを上書き | `<td data-field="edition.displayName">KADOMA ART FES 5</td>` |
| `data-src-field="path"` | 要素の `src` 属性を上書き | `<img src="..." data-src-field="images.flyerFront">` |
| `data-href-field="path"` | 要素の `href` 属性を上書き | `<a href="..." data-href-field="contest.entryPdf">` |
| `data-alt-field="path"` | 要素の `alt` 属性を上書き | `<img alt="..." data-alt-field="edition.displayNameShort">` |
| `data-news-list` | `data.json` の `news` 配列を `<dt>/<dd>` ペアで展開 | `<dl class="news" data-news-list>` |

パスはドット区切り記法に対応(例: `event.dateRange` → `data.event.dateRange`)。

### フォールバック設計

HTML 側にも正しい値がハードコードされている。これは意図的な設計で、以下の理由による:

- **JS 実行前の初期表示**: 非同期読み込み完了前にページが一瞬表示される際のちらつき防止
- **JS 無効/失敗時のフォールバック**: ブラウザで JS が無効な場合やネットワークエラー時にも正しい情報が表示される
- **SEO/クローラ対策**: 検索エンジンが JS を実行しない場合にも正しい情報がインデックスされる

年度更新時は `data.json` のみを更新すれば、JS が古いフォールバック値を最新値で上書きする。

## 実施済みの作業

### フェーズ 1: 基盤構築

| PR | 内容 |
|---|---|
| #2 | `data.json` を新規作成(年度依存データの集約) |
| #3 | `include.js` を Promise 化(`includes:loaded` イベント発火) |
| #3 | `data-loader.js` を新規作成(data-field / data-src-field / data-href-field / data-alt-field / data-news-list 対応) |

### フェーズ 2: index.html の data-field 化

| PR | 内容 |
|---|---|
| #4 | 開催日時 1 箇所を data-field 化(動作検証用の最小変更) |
| #6 | フライヤー画像 / news リスト / title の「テスト」削除 |

### フェーズ 3: 各ページへの横展開

| PR | 対象ファイル | 変更箇所数 | 修正したバグ |
|---|---|---|---|
| #7 | `kaf_mmg.html` | 10 箇所 | alt="KAF2024" → KAF5、マルシェ年号 2025→2026、FES5 スペース統一 |
| #8 | `kaf_marche.html` | 10 箇所 | 2024 年のまま放置されていた全情報を KAF5 に正規化 |
| #9 | `contest_entry.html` | 25 箇所 | 曜日バグ (金→日)、展示期間フォーマット乱れ |
| #10 | `kaf_support.html` | 12 箇所 | alt="KAF2025" → KAF5、組織名の誤記修正 |

### data.json に追加した拡張フィールド(CLAUDE.md のスキーマ以外)

| フィールド | 用途 |
|---|---|
| `contest.exhibitionPeriodFull` | 展示期間の詳細表記(時間入り) |
| `contest.deliveryPeriod` | 作品搬入時期 |
| `contest.entryFormUrl` | オンライン応募フォーム URL |
| `images.contestBanner` | コンテスト募集バナー画像 |
| `contact.entryEmail` | 応募用メールアドレス |
| `marche.venue` | マルシェ固有の会場 |

## 未対応の作業

### フェーズ 3 残り

- **`includeHTML/menubar.html`**: 共通ナビ内の大会番号文字列の data-field 化が未実施

### フェーズ 4: 画像の整理

- 現在 `images/` 直下に散在している大会関連画像を `images/editions/kaf5/` のように大会番号フォルダ + 固定ファイル名で整理する計画あり(未着手)
- 詳細は `docs/refactoring-plan.md` を参照

### フェーズ 5-7

- 統合テスト / 本番デプロイ / `docs/update-guide.md`(年度更新手順書)の作成

### 各ページの h2 fade-in-text アニメーション

- 複数ページの `<h2>` 内にある fade-in-text アニメーション用 span(例: `KADOMAARTFES5開催情報`)は、`main.js` の文字分割アニメーションと干渉するリスクがあるため、フェーズ 3 では全て保留としている
- 年度更新時はこれらの箇所を手動で更新する必要がある(対象: kaf_mmg.html, kaf_marche.html)

## ローカルでの動作確認

共通パーツ(`include.js`)と `data.json` の読み込みは AJAX を使用するため、ローカルサーバを使用して確認してください。

```bash
cd kadoma-artfes.jp
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

ファイルパスを直接ブラウザで開くと、CORS エラーにより共通パーツと data.json の読み込みが行われません。
