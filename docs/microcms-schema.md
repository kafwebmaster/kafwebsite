# microCMS API スキーマ設計書

作成日: 2026-08-01
対象: KADOMA ART FES 公式サイト(Astro + microCMS 移行 第 2 週)
関連: `docs/technical-design.md` 3 章(データ取得層)

本書は microCMS の管理画面に登録する API とフィールドの定義書。
**無料枠は API 5 個まで。本設計は 4 個で全要件を満たし、1 枠を将来用に残す。**

---

## 0. 登録の進め方(推奨手順)

microCMS には **API スキーマの JSON インポート機能**があり、手入力を大幅に省ける。
ただしインポート JSON の正確な形式は公開ドキュメントで確認できなかったため、
**実物からフォーマットを取得する**方式を採る。

1. ~~**API①「news」を管理画面から手作業で作成**~~ → **完了**(2026-08-01)
2. ~~その API の **スキーマを JSON でエクスポート**して共有~~ → **完了**。形式を確認済み
3. ~~その形式に合わせて **残り 3 API のスキーマ JSON を生成**~~ → **完了**
   → `docs/microcms-schemas/` に配置(`site-settings.json` / `editions-archive.json` / `sponsors.json`)
4. API 作成時に **インポート**する ← **いまここ**

### 確認済みのスキーマ JSON 形式

```json
{
  "apiFields": [
    { "fieldId": "date", "name": "日付", "kind": "text",
      "description": null, "required": true }
  ],
  "customFields": []
}
```

- セレクトのみ `selectItems: [{ "id": "...", "value": "..." }]` と `multipleSelect` を伴う
- 生成した JSON は **必須キー(fieldId / name / kind / description / required)のみ**とし、
  種類ごとの詳細設定(文字数制限など)は microCMS の既定値に任せている
  (誤ったキーを送るより、省略して既定値を使う方が安全なため)

### ⚠️ インポートは `site-settings` から試すこと

`text` と `select` は news の実物で形式を確認済みだが、
**`number` / `media` / `file` / `textArea` / `mediaList` は未検証**。
最も項目数の多い `site-settings` を最初にインポートし、
フィールドが正しく作られるか(特に画像 8 項目が「画像」型になっているか)を確認する。

うまくいかない場合は、その API を削除して作り直せばよい(コンテンツ投入前なら影響なし)。

### 注意: スキーマとコンテンツは別物

インポートで省けるのは**フィールド定義(スキーマ)の登録**まで。
**中身(コンテンツ)の初期値投入は別作業**になる。投入方法は次の 3 択:

**採用: Cloudflare のビルド内で投入スクリプトを 1 回だけ走らせる方式。**

無料プランは **API キーを 1 個しか作成できない**(2026-08-01 実機で確認)ため、
投入専用キーを別途発行できない。また `site-settings` は必須項目が多く
**空のままでは公開できない**ため、手入力を避けるには自動投入が必要になる。

そこで **Cloudflare に既に設定済みの `MICROCMS_API_KEY` をビルド内で使う**。
キーが環境変数の外に出ないため、チャット等で共有する必要がない。

#### 手順(`scripts/seed-microcms.mjs`)

| # | 場所 | 操作 |
|---|---|---|
| 1 | microCMS | `site-settings` を**空のまま「下書き保存」**(オブジェクト形式は初回保存を管理画面で行う必要があるため。全項目が任意なので空で保存できる) |
| 2 | microCMS | 既存 API キーに **POST / PATCH 権限を一時的に付与** |
| 3 | Cloudflare | 環境変数 **`SEED_MICROCMS` = `1`** を追加 |
| 4 | Cloudflare | **Retry deployment**(ビルド前に投入が走る) |
| 5 | Cloudflare | ログの `[seed] ===== 投入結果 =====` で 3 件 OK を確認 → **`SEED_MICROCMS` を削除** |
| 6 | microCMS | **POST / PATCH 権限を外し GET のみに戻す** |

投入対象は **テキスト・数値・セレクトの 36 項目 + news 7 件 + 協賛 34 件**。
**画像 8 枚と応募 PDF は管理画面から手動アップロード**する(15 分程度)。
未アップロードの間も取得層が現行のローカル画像へフォールバックするため表示は壊れない。

#### 安全設計

- `SEED_MICROCMS=1`(または `--yes`)が無ければ**一切書き込まない**。通常のビルドでは即終了する
- 投入前に news / sponsors の件数を確認し、既存コンテンツがあれば**中止**(二重投入防止)
- 投入に失敗してもビルドは止めない(取得層がローカルデータで成立させる)

---

## 1. API 一覧

| # | API 名(エンドポイント) | 種類 | 用途 |
|---|---|---|---|
| ① | `news` | リスト形式 | お知らせ / 活動報告 |
| ② | `site-settings` | オブジェクト形式 | 年度依存の全設定(開催日・大会名など) |
| ③ | `editions-archive` | リスト形式 | 過去大会アーカイブ【新機能】 |
| ④ | `sponsors` | リスト形式 | 協賛一覧 |

---

## 2. API① `news`(リスト形式)

現行 `data.json` の news 配列 + トップページの活動報告に対応。**最初に手作業で作る API。**

| フィールドID | 表示名 | 種類 | 必須 | 備考 |
|---|---|---|---|---|
| `date` | 日付 | テキストフィールド | ✅ | 表示どおりの文字列。例: `2026/02/05` |
| `category` | カテゴリ | セレクトフィールド | ✅ | 選択肢: `イベント` / `コンテスト` / `メディア掲載情報` |
| `text` | 本文 | テキストフィールド | ✅ | 一覧に表示される文章 |
| `link` | リンク先 | テキストフィールド | | 空欄可。例: `contest.html`(空ならリンクなしで表示) |

> 日付を「日時フィールド」ではなく文字列にしているのは、現行表記(`2026/02/05`)を
> そのまま維持するため。

### ⚠️ 表示順と登録順について(重要)

microCMS の既定の並び順は「**登録(公開)が新しいものが先頭**」。
サイトには先頭から表示するため、**初期データは下表の一番下(最も古いもの)から順に登録すること**。
上から登録すると表示が古い順に逆転する。
(今後の運用では「新しいお知らせを普通に追加する」だけで先頭に表示される)

### 初期データ(7 件・表示順 = この表の順。**登録は下から**)

| date | category | text | link |
|---|---|---|---|
| 2026/02/05 | メディア掲載情報 | アートフェス作品審査会にてご紹介いただきました！ | media.html |
| 2026/02/05 | コンテスト | KADOMA ART FES CONTEST KAF5受賞作品を発表しました | contest.html |
| 2026/01/25 | イベント | KADOMA ART FES 5 イベント情報を更新いたしました。 | contest_entry.html |
| 2025/12/01 | コンテスト | KADOMA ART FES 5 CONTESTの応募が終了しました。たくさんの応募ありがとうございました。 | contest_entry.html |
| 2025/10/20 | コンテスト | KADOMA ART FES 5 CONTESTの応募締め切り日が変更になりました | contest_entry.html |
| 2025/06/20 | コンテスト | 【募集終了】KADOMA ART FES 5 CONTESTの応募が開始されました | (空欄) |
| 2025/06/20 | イベント | KADOMA ART FES 5開催日時を発表しました | (空欄) |

---

## 3. API② `site-settings`(オブジェクト形式)

**年度更新時に触るのは基本的にこの API だけ。** 全 45 項目。
フィールド ID は現行 `data.json` の階層をアンダースコアで平坦化した命名。

### ⚠️ 全項目を「任意」にしている(必須にしない)

当初 30 項目を必須に設定していたが、以下の理由で**全項目を任意**に変更した
(2026-08-02)。

1. **オブジェクト形式は初回の保存を管理画面で行う必要がある**
   (API の PATCH は `Content is not exists` で拒否される)。
   必須項目があると**下書き保存すらできず**、自動投入の前提が崩れる
2. **取得層が未入力項目を現行値で補完する**設計のため、CMS 側で必須にする
   意味がない。むしろ「一部だけ直して保存」ができる方が運用しやすい

> `news` / `sponsors` / `editions-archive`(リスト形式)は POST で値ごと作成する
> ため、必須設定を維持している(編集者の入力漏れ防止として有効)。

### 3-1. 大会情報(edition)

| フィールドID | 表示名 | 種類 | 現在値 | 表示 |
|---|---|---|---|---|
| `edition_name` | 大会名(正式) | テキスト | KADOMA ART FES 5 | 使用 |
| `edition_nameShort` | 大会名(短縮) | テキスト | KAF5 | 使用 |
| `edition_fiscalYear` | 年度ラベル | テキスト | 2025年度 | 使用 |
| `edition_eventYear` | 開催年 | 数値 | 2026 | 使用 |
| `edition_yearsRunning` | 開催回数(◯年目) | 数値 | 5 | 使用 |
| `edition_slug` | 内部識別子 | テキスト | kaf5 | 予備 |
| `edition_number` | 大会番号 | 数値 | 5 | 予備 |
| `edition_nameCompact` | 大会名(スペースなし) | テキスト | KADOMAARTFES5 | 予備 |

### 3-2. 開催情報(event)

| フィールドID | 表示名 | 種類 | 現在値 |
|---|---|---|---|
| `event_dateRange` | 開催日(短) | テキスト | 2026年3月6日 (金) - 3月8日 (日) |
| `event_dateRangeLong` | 開催日(長) | テキスト | 2026年03月06日 (金) 〜 03月08日 (日) |
| `event_time` | 開催時間 | テキスト | 10:00 〜 16:00 |
| `event_timeShort` | 開催時間(短) | テキスト | 10:00-16:00 |
| `event_venue` | 開催場所 | テキスト | 大和田駅前広場 / 大和田南商店街 周辺 |
| `event_admission` | 入場料 | テキスト | 無料 |

> 日付の表記ゆれ(短/長)は現行サイトの表示に合わせて別項目で保持する。
> **年度更新時は 2 つとも直す必要がある**ため、管理画面の説明文にその旨を記載する。

### 3-3. コンテスト情報(contest)

| フィールドID | 表示名 | 種類 | 現在値 |
|---|---|---|---|
| `contest_statusLabel` | 募集ステータス表示 | テキスト | 募集終了 |
| `contest_deadlineFull` | 応募締切(曜日付) | テキスト | 2025年11月30日(日) |
| `contest_deadline` | 応募締切(短) | テキスト | 2025年11月30日 |
| `contest_exhibPeriod` | 展示期間 | テキスト | 2026年3月7日 (土) 〜 3月8日 (日) |
| `contest_exhibFull` | 展示期間(時間込) | テキスト | 2026年3月7日（土）8日（日）10:00～16:00 |
| `contest_delivery` | 作品搬入時期 | テキスト | 2026年1月中旬 |
| `contest_entryPdf` | 応募用紙PDF | ファイル | KAF5entry.pdf |
| `contest_entryFormUrl` | 応募フォームURL | テキスト | https://forms.gle/tN6MJoqWRJoSHwF18 |
| `contest_status` | 募集状態(内部) | セレクト | closed(選択肢: open / closed) |

> **PDF の配信方式**: 応募 PDF は 14.5MB あり、microCMS から直接配信すると無料枠の
> 転送量(20GB/月)を圧迫する。画像と同様に**ビルド時に取得して Cloudflare 側から配信**し、
> 既存 URL `/KAF5entry.pdf`(フライヤー等に記載されている可能性がある)も維持する。
> 実装は第 2 週の取得層で対応(編集者の操作は「管理画面にアップロードするだけ」で変わらない)。

### 3-4. マルシェ情報(marche)

| フィールドID | 表示名 | 種類 | 現在値 |
|---|---|---|---|
| `marche_name` | マルシェ名称 | テキスト | カドマアート・マルシェ in 大和田 2026 |
| `marche_dateRange` | 開催日 | テキスト | 2026年3月7日 (土) 〜 3月8日 (日) |
| `marche_time` | 開催時間 | テキスト | 10:00 〜 16:00 |
| `marche_venue` | 開催場所 | テキスト | 大和田駅前広場/ハッピービーンズカフェ |

### 3-5. 画像(images)

**種類はすべて「画像」**(管理画面からドラッグ&ドロップで差し替え可能)。

| フィールドID | 表示名 | 現在のファイル | 表示 |
|---|---|---|---|
| `images_flyerFront` | フライヤー(表) | KAF5_flyer_omote.jpg | 使用(トップ) |
| `images_flyerFull` | フライヤー(全体) | KAF5_flyer.jpg | 使用(イベント詳細) |
| `images_mainVisual` | メインビジュアル | KAF5.jpg | 使用(協賛/マルシェ) |
| `images_supportList` | 協賛一覧画像 | KAF5_support.jpg | 使用(協賛) |
| `images_entryThumb` | 応募要項サムネイル | KAF5entry-img.png | 使用(募集) |
| `images_contestBanner` | 募集バナー | entry.jpg | 使用(募集) |
| `images_flyerBack` | フライヤー(裏) | KAF5_flyer_ura.jpg | 予備 |
| `images_webBanner` | Webバナー | KAF5web_banner2.jpg | 予備 |

> **配信方式の方針**: microCMS の画像配信は無料枠の転送量(20GB/月)を消費するため、
> ビルド時に画像を取得して Cloudflare 側から配信する方式を第 2 週に実装する。
> 編集者は管理画面からアップロードするだけでよく、操作は変わらない。

### 3-6. ギャラリー / 連絡先 / 主催 / SNS

| フィールドID | 表示名 | 種類 | 現在値 |
|---|---|---|---|
| `gallery_latestPage` | 最新ギャラリーのリンク先 | テキスト | 2024gallery.html |
| `gallery_latestLabel` | 最新ギャラリーの表示名 | テキスト | 2024イベント風景Photoギャラリー |
| `gallery_latestYear` | 最新ギャラリーの年 | 数値 | 2024(予備) |
| `contact_email` | 問い合わせメール | テキスト | kadoma.art.fes2021@gmail.com |
| `contact_entryEmail` | 応募用メール | テキスト | kadomaartfes.oubo@gmail.com |
| `organization_host` | 主催 | テキスト | 門真市文化芸術推進基本計画パイロットプロジェクト実行委員会 |
| `organization_coHost` | 共催 | テキスト | 門真市・NPO法人トイボックス |
| `organization_support` | 後援 | テキスト | 京阪ホールディングス株式会社 |
| `social_youtube` | YouTube URL | テキスト | https://www.youtube.com/@kadomaartfes |
| `social_instagram` | Instagram URL | テキスト | https://www.instagram.com/pilot_kadoma/ |

---

## 4. API③ `editions-archive`(リスト形式)【新機能】

過去大会を年度別ページとして自動生成するためのデータ。
**1 件登録すると `/archive/{year}.html` が 1 ページ生成される。**

| フィールドID | 表示名 | 種類 | 必須 | 備考 |
|---|---|---|---|---|
| `year` | 開催年 | 数値 | ✅ | URL とソートに使用。例: `2024` |
| `title` | 大会名 | テキスト | ✅ | 例: KADOMA ART FES 4 |
| `dateRange` | 開催期間 | テキスト | | 例: 2024年11月30日 〜 12月1日 |
| `description` | 紹介文 | テキストエリア | | その年の展示の説明 |
| `heroImage` | 代表画像 | 画像 | | 一覧ページのサムネイルに使用 |
| `gallery` | ギャラリー画像 | 複数画像 | | 年度ページに並べる写真 |
### 運用上の注意 (アーカイブ実装済み・2026-08-02)

- **写真 (gallery) が空の登録は「準備中」として無視される**。翌年大会を先行登録しても
  写真をアップロードするまで最新枠は切り替わらない (安全設計)
- **登録の推奨タイミングは「開催後・写真が揃ってから」**
- year は開催年の整数 (KAF5 = 2026)。小数や重複は警告されて無視される
- Webhook は **4 API すべて** (site-settings / news / sponsors / editions-archive) に
  設定すること。editions-archive に無いと、大会を登録しても自動反映されない
- 管理画面で editions-archive の「ギャラリー画像」フィールドが**複数画像**として
  表示されているか、初回登録時に確認すること

### 受賞作品フィールドは第 3 週に追加する

当初「繰り返しフィールド(`awardWinners`)」を含める設計だったが、
繰り返しフィールドとカスタムフィールドの JSON 形式が未検証であり、
形式を誤ると **API 全体のインポートが失敗する**リスクがある。

そのため **初回インポートには含めず**、アーカイブ機能を実装する第 3 週に、
形式を確認した上で追加する(既存 API へのフィールド追加は容易)。

第 3 週に追加する構成(予定):

| フィールドID | 表示名 | 種類 |
|---|---|---|
| `awardWinners` | 受賞作品 | 繰り返しフィールド |
| └ `awardName` | 賞の名称 | テキスト |
| └ `artistName` | 作家名 | テキスト |
| └ `workTitle` | 作品名 | テキスト |
| └ `image` | 作品画像 | 画像 |

> 初期データとして KAF4(2024)を 1 件登録する(素材は既存の `2024gallery.html` /
> `contest2024.html` から流用可能)。KAF1〜3 の遡及はオプション(別途見積)。

---

## 5. API④ `sponsors`(リスト形式)

現行 `kaf_support.html` にハードコードされている協賛者 34 件を管理画面で編集可能にする。

| フィールドID | 表示名 | 種類 | 必須 | 備考 |
|---|---|---|---|---|
| `name` | 協賛者名 | テキスト | ✅ | 例: 板垣治療院 |
| `order` | 表示順 | 数値 | | 未指定なら登録順 |

### 初期データ(34 件・現行の掲載順)

板垣治療院 / （株）エヌ・ワイ・ティ / 大倉寺 / 大阪国際大学 / 門真エコネットワーク連絡会 /
門真市民劇団“いっぽ” / 門真新モータープール / 門真ロータリークラブ / きらぼし保育園 /
光亜興産（株） / 珈琲館 大和田店 / サンローレル森川ビル / 柴田昌彦 / 常光寺 /
Studio Canaliy / smile campus / （株）創緑舎 / タルキ堂 / 地域猫見守り隊 /
（有）日本ビル管理 / 橋本一行税理士事務所 / HAPPY BEANS CAFE / 花工房 井川園芸 /
PAJERO / （株）beleef / フジイハウス産業（株） / ぶらっと / 本町ピーコック /
益民山月庵 / （株）マルエイ工務店 / （有）三喜興産 / リサイクル工房 布くらふと /
（株）Roots / 和謡会

---

## 6. 登録後に必要な設定

| 項目 | 内容 | 担当 |
|---|---|---|
| API キー発行 | 読み取り(GET)権限のキーを発行 | 人間 |
| Cloudflare 環境変数 | `MICROCMS_SERVICE_DOMAIN` / `MICROCMS_API_KEY` を検証用プロジェクトに登録 | 人間 |
| Webhook | コンテンツ公開時に Cloudflare を再ビルドさせる設定 | 人間(第 3 週) |
| 取得層の実装 | `src/lib/content.js` を microCMS 対応に拡張 | Claude |
| 画像のビルド時取得 | 転送量対策の実装 | Claude |

> **API キーは読み取り専用で十分。** 書き込み権限は不要(サイトから CMS へ書き込まないため)。
> キーの値はチャット等に貼らず、Cloudflare の環境変数に直接入力すること。

---

## 7. 命名・設計上の判断メモ

- **フィールド ID を平坦化**(`edition_name` 等)したのは、カスタムフィールドの
  入れ子を減らして登録作業と編集画面を単純にするため。コード側で階層構造へ復元する
- **フィールド ID は 20 文字以内**(2026-08-01、インポート時の実機エラーで確認された制限)。
  このため site.json のキー名と一部異なる短縮 ID を採用している。対応は取得層
  (`src/lib/content.js`)が吸収する。短縮した 11 件:
  | site.json | CMS フィールドID |
  |---|---|
  | edition.displayName | `edition_name` |
  | edition.displayNameShort | `edition_nameShort` |
  | edition.displayNameCompact | `edition_nameCompact` |
  | edition.fiscalYearLabel | `edition_fiscalYear` |
  | contest.entryDeadline | `contest_deadlineFull` |
  | contest.entryDeadlineShort | `contest_deadline` |
  | contest.exhibitionPeriod | `contest_exhibPeriod` |
  | contest.exhibitionPeriodFull | `contest_exhibFull` |
  | contest.deliveryPeriod | `contest_delivery` |
  | images.entryThumbnail | `images_entryThumb` |
  | marche.displayName | `marche_name` |
  ⚠️ `contest_deadline`(短い表記)と `contest_deadlineFull`(曜日付)の対応に注意
- **日付を文字列で保持**しているのは、現行サイトの多様な表記(`2026年3月6日 (金)` /
  `2026年03月06日 (金)` 等)を 1 文字も変えずに再現するため
- **予備フィールド**(表示に使われていない 7 項目)も登録するのは、データを失わないため。
  スキーマはインポートで登録するため追加コストはほぼゼロ(値の投入は 0 章の方法 b で自動化)
- **フィールド数の上限**: microCMS はフィールド数に明示的な制限を設けていないことを
  公式ヘルプで確認済み(2026-08-01)。site-settings の 45 項目は問題ない
- **協賛一覧を API 化**したのは、現行のハードコード 34 件が毎年変わるため。
  第 2 週で `kaf_support.html` の該当箇所をこの API から生成するよう差し替える
