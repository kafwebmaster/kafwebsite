# リファクタリング作業手順

## フェーズ 0: 準備

- [x] `kadoma-artfes.jp/` フォルダのフルバックアップ(作業前の zip)
- [x] GitHub プライベートリポジトリの作成
- [x] 初期コミット(基準点として `baseline-original` タグを打つ)
- [ ] `CLAUDE.md`, `docs/refactoring-plan.md`, `docs/prompts.md` を配置してコミット + `baseline-kaf5` タグ

## フェーズ 1: 基盤コードの作成

### 1-1. data.json の作成
- `CLAUDE.md` のスキーマに従い、現行サイトから KAF5 の値を正確に移植
- 日本語原文は一字一句そのまま転記(勝手に表記を統一しない)
- `prompts.md` の「data.json 初期作成」テンプレートを使用

### 1-2. include.js の Promise 化
- 既存の 6 行の実装を Promise 化
- すべての .load() 完了後に `includes:loaded` カスタムイベントを発火
- 既存の動作を一切変えない(イベント発火だけ追加)
- `prompts.md` の「include.js Promise 化」テンプレートを使用

### 1-3. data-loader.js の新規作成
- `js/data-loader.js` として新規作成
- data-field, data-src-field, data-href-field, data-news-list の 4 種類に対応
- `includes:loaded` イベントを待ってから処理開始
- ドット区切りパス記法に対応
- `prompts.md` の「data-loader.js 作成」テンプレートを使用

## フェーズ 2: index.html での検証

### 2-1. 最小限の検証(開催日時のみ)
- `index.html` の「開催日時」行 1 箇所だけを data-field 方式に置換
- `<script src="js/data-loader.js"></script>` を追加
- ローカルサーバー(`python -m http.server` 等)で動作確認
- ブラウザ DevTools のコンソールにエラーが出ないことを確認

### 2-2. index.html 全体の改修
- 開催場所、入場料、画像パス、お知らせ一覧(dl.news)、大会名などを data-field 方式に置換
- デザイン・見た目が一切変わっていないことを目視確認
- alt="KAF2024" のような古い痕跡もこのタイミングで汎用的な説明文に修正

## フェーズ 3: 残りのページへ横展開

index.html での動作確認が取れた後、以下を 1 ファイルずつ順に改修する。
各ファイルで必ず動作確認してから次に進むこと。

- [ ] kaf_mmg.html
- [ ] kaf_marche.html(現在 2024 年のまま放置されているので、このタイミングで KAF5 の情報に正常化)
- [ ] contest_entry.html(更新量最大、年度・大会番号・募集状態などが複雑に絡むので慎重に)
- [ ] kaf_support.html
- [ ] includeHTML/menubar.html(共通パーツなので、Promise 化された include.js との連携を最終確認)

## フェーズ 4: 画像の整理

### 4-1. 新しいフォルダ構造の作成
- `images/editions/kaf5/` を作成
- 既存の KAF5 関連画像をコピー(削除はしない)、固定ファイル名にリネーム
- `images/common/` を作成し、ロゴなどの大会非依存画像をコピー

### 4-2. data.json の画像パスを新構造に変更
- 動作確認後、古いパスは旧ファイルとして残したまま、data.json 内の参照を新パスに切り替える
- 切り替え後に全ページで画像が正しく表示されることを確認

### 4-3. 旧画像ファイルの整理(任意・後回しでよい)
- 動作が十分安定した後、古いパスの画像ファイルを削除するかどうか判断
- すぐに削除せず、しばらく残しておく方が安全

## フェーズ 5: ローカルとテスト環境での総合確認

- ローカルサーバーで全ページを巡回確認
- ヘテムルの ka5test/ 領域にアップロードして実機確認
- PC/スマホ両方で表示確認(900px 未満のレスポンシブも必ず確認)
- 各ページのコンソールエラー有無確認

## フェーズ 6: 本番反映

- `kadoma-artfes.jp/` 本番へ FTP アップロード
- 本番環境で最終確認
- Git に tag `v5-data-json-migration` を打つ
- `docs/update-guide.md` を最新化

## フェーズ 7: ドキュメント整備

- 運営スタッフ向けの「年度更新マニュアル」を `docs/update-guide.md` に記述
- 次の大会(KAF6)の更新作業で実際に使えるレベルの手順書にする
- スクリーンショット付きだとなお良い
