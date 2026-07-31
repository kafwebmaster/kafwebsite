# Cloudflare Pages 設定記録・移行手順

最終更新: 2026-07-24
目的: 移行前の設定を記録し、問題発生時に元の状態へ復旧できるようにする

---

## 1. 移行前の設定(2026-07-24 時点)

**この設定が移行前の正となる状態。復旧が必要な場合はこの値に戻すこと。**

### Build

| 項目 | 値 |
|---|---|
| Git repository | `kafwebmaster/kafwebsite` |
| **Build command** | **(空欄)** |
| **Build output directory** | **`kadoma-artfes.jp`** |
| Root directory | (空欄 = リポジトリ直下) |
| Build comments | Enabled |
| Build cache | Disabled |
| Production branch | `main` |
| Automatic deployments | Enabled |
| Build watch paths | Include paths: `*` |
| Build system version | Version 3 |
| Deploy Hooks | 未定義 |

### Variables and secrets
- 未設定

### Bindings
- 未設定

### Runtime

| 項目 | 値 |
|---|---|
| Placement | Default |
| Compatibility date | Apr 11, 2026 |
| Compatibility flags | 未定義 |
| Fail open/closed | Fail open |

### 現在の動作
ビルドコマンドが空のため、**ビルド処理を行わず `kadoma-artfes.jp/` フォルダの中身をそのまま配信**している。
`main` ブランチへの push で自動デプロイされる。

---

## 2. Astro 導入後に必要となる設定

| 項目 | 移行前 | 移行後 |
|---|---|---|
| Build command | (空欄) | `npm run build` |
| Build output directory | `kadoma-artfes.jp` | `dist` |
| Root directory | (空欄) | (空欄・変更なし) |
| Build cache | Disabled | **Enabled 推奨**(ビルド時間短縮) |
| Deploy Hooks | 未定義 | **1 件追加**(microCMS の Webhook 連携用) |
| Variables and secrets | 未設定 | microCMS の接続情報を追加 |

> 変更するのは実質 **Build command と Build output directory の 2 項目のみ**。

---

## 3. 【重要】移行中の安全な進め方

### 調査結果(2026-07-24 確認)

**Cloudflare Pages では、ビルド設定(Build command / Build output directory)を UI 上で環境ごとに分けることはできない。**

- 画面上部の「Choose Environment(Production / Preview)」の切り替えが適用されるのは **環境変数(Variables and secrets)などであり、ビルドコマンドや出力先ではない**
- Build command / Build output directory は **プロジェクト全体で 1 つの共通設定**
- ビルドコマンドのみ、公式に案内された回避策(`CF_PAGES_BRANCH` を使った条件分岐スクリプト)でブランチ別に変えられる。ただし**出力先ディレクトリは共通のまま**

参考:
- [Build configuration · Cloudflare Pages docs](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Set build commands per branch · Cloudflare Pages docs](https://developers.cloudflare.com/pages/how-to/build-commands-branches/)

### 課題
本番稼働中に本番プロジェクトの設定を Astro 用へ変更すると、**Astro の準備完了前に本番サイトが正しく表示されなくなる**。

### 対策の選択肢

| | 案A: 検証用プロジェクトを別途作成(推奨) | 案B: 条件分岐ビルドスクリプト |
|---|---|---|
| 概要 | 同じリポジトリを見る 2 つ目の Pages プロジェクトを作り、そこで検証する | `build.sh` で `CF_PAGES_BRANCH` を判定し、ブランチごとに処理を分ける |
| 本番設定の変更時期 | **切替時(最後)のみ** | **着手時(最初)から** |
| 開発中の本番リスク | **なし** | 低いが存在する(スクリプト不具合時) |
| 管理するプロジェクト数 | 2 | 1 |
| 切替作業 | 管理画面で 2 項目を変更 | コード変更(PR で確認・巻き戻し可) |

**案A を推奨。** 開発中に本番プロジェクトへ一切触れないため、リスクが構造的にゼロになる。

> 案B を採る場合は、Build command を `bash build.sh`、Build output を `dist` に変更した上で、
> `main` では既存の静的ファイルを `dist` へ複製、`develop` では Astro をビルドする分岐を書く。
> 切替が PR ベースになる利点はあるが、着手時点で本番設定に手を入れる必要がある。

### 案A の具体的な構成

本番プロジェクトには一切触れず、**同じリポジトリを参照する 2 つ目の Pages プロジェクト**を作って検証する。

| | 本番プロジェクト(既存) | 検証用プロジェクト(新規作成) |
|---|---|---|
| プロジェクト名 | kadoma-artfes(現行) | 例: `kadoma-artfes-staging` |
| Git リポジトリ | `kafwebmaster/kafwebsite` | 同左(同じリポジトリ) |
| Production branch | `main` | **`develop`** |
| Build command | (空欄・変更しない) | `npm run build` |
| Build output | `kadoma-artfes.jp`(変更しない) | `dist` |
| 公開 URL | kadoma-artfes.jp | `*.pages.dev`(検証用) |

**利点**
- 移行作業中、本番サイトの設定を一切変更しないため**本番が壊れるリスクがゼロ**
- 検証用 URL で完成形を確認してから本番へ切り替えられる
- 検証用プロジェクトも無料枠で作成可能

**本番切替の手順(2026 年 11 月上旬に実施)**
1. 検証用プロジェクトで全ページの表示を確認・承認
2. `develop` を `main` へマージ
3. 本番プロジェクトの Build command / Build output を Astro 用に変更
4. 本番サイトの表示を確認
5. 問題があれば本書 1 章の値に戻す(即座に復旧可能)

> **切替までの間(2026 年 8 月〜10 月末)、本番プロジェクトの設定は一切変更しない。**
> そのため現行サイトは通常どおり公開され続ける。

**検証用プロジェクトの作成手順(担当者作業)**
1. Cloudflare ダッシュボード → Workers & Pages → **Create** → **Pages** → **Connect to Git**
2. リポジトリ `kafwebmaster/kafwebsite` を選択
3. プロジェクト名を入力(例: `kadoma-artfes-staging`)
4. **Production branch** に `develop` を指定
5. Build command に `npm run build`、Build output directory に `dist` を入力
6. 保存してデプロイ(初回は `develop` に Astro がまだ無いため失敗する場合があるが問題ない)

> 検証用プロジェクトは移行完了後に削除してよい。

---

## 4. 補足・改善提案(任意)

| 項目 | 内容 |
|---|---|
| Build cache | 現在 Disabled。Astro 導入後は有効化するとビルド時間を短縮できる |
| Build watch paths | 現在 `*`(全ファイル)。`docs/` の更新でも再デプロイが走るため、除外設定を入れると無駄なビルドを減らせる |
| Deploy Hooks | microCMS でコンテンツを公開した際に自動再ビルドさせるため、移行時に 1 件作成する |

---

## 5. 復旧手順(緊急時)

本番サイトに問題が発生した場合:

1. Cloudflare の本番プロジェクト → Settings → Build configuration を開く
2. 本書「1. 移行前の設定」の値に戻す
   - Build command: **空欄**
   - Build output directory: **`kadoma-artfes.jp`**
3. Deployments タブから、移行前の正常なデプロイを選び **Rollback** を実行する
   (設定変更より Rollback の方が復旧が速い)
