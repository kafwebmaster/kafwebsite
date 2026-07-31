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

### 課題
Cloudflare Pages のビルド設定(コマンド・出力先)が **Production と Preview で共通の可能性**がある。
共通の場合、本番稼働中に設定を Astro 用へ変更すると、**Astro の準備完了前に本番サイトが表示不能になる**。

### 対策: 検証用の別プロジェクトを作成する(推奨)

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

**本番切替(M8)の手順**
1. 検証用プロジェクトで全ページの表示を確認・承認
2. `develop` を `main` へマージ
3. 本番プロジェクトの Build command / Build output を Astro 用に変更
4. 本番サイトの表示を確認
5. 問題があれば本節 1 の値に戻す(即座に復旧可能)

### 代替案: Preview 環境の個別設定を使う
画面上部の **「Choose Environment」** を `Preview` に切り替えた際、Build configuration を Production と別に設定できる場合は、検証用プロジェクトを作らずに Preview 環境だけ Astro 用の設定にする方法も取れる。
**着手時に、この切り替えが可能かどうかを確認すること。** 可能なら手順が簡略化できる。

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
