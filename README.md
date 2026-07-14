# Text Review Studio v1

変更前と修正後の原稿を左右に並べ、CMS原稿を含む差分確認・簡易整形・コピー・Excel出力をブラウザ内だけで行う静的Webアプリです。

## v1で整理したこと

- 原稿名、こだわりセット、旧確認レールを実行中のUIから削除
- `index.html`とJavaScriptが同じDOM構造を参照するように再構成
- 非表示の互換DOMを作る`pre-app-compat.js`を読み込まない構成へ変更
- 旧比較画面と後付け比較画面の二重描画を廃止
- 定期的な`setInterval`、`MutationObserver`による再比較を廃止
- 入力変更時だけ差分を計算し、結果を`state.comparison`へ保存
- ページとExcelが同じ行対応を使用
- 表示設定を1つのダイアログに統一
- サンプルテキストを1つの定義に統一
- コピーのメニューを固定ヘッダーより前面に表示
- 保存キーを`text-review-studio-v1`に統一
- 基本差分、CMS行分類、空行をまたぐ行対応、構造タグ除外を`diff-engine-v1.js`へ統合

旧ファイルは移行確認のためリポジトリに残していますが、現在の`index.html`からは読み込まれません。

## 基本操作

1. 「変更前」と「修正後」に原稿を貼り付けます。
2. 「左右で比較」を押します。
3. 中央の`↔ / ＋ / −`、または「前の差分」「次の差分」で確認します。
4. 必要に応じて、修正後の原稿へ整形やCMSタグを反映します。
5. 右上の「コピー」から、本文・HTML・差分記録・Excelを出力します。

上部の「原稿を編集」「左右で比較」はスクロール中も固定されます。

## HTMLタグの扱い

「HTMLタグを差分から除外」がONの場合、本文内容を優先して対応付けます。

```html
<span class="info24-t2">販売対象試合</span>
```

```text
◆販売対象試合
```

この2行は見出し同士として対応させます。

次のような本文を持たない構造行は、ページとExcelの通常差分から除外します。

```html
<img>
<div>
<table>
<tbody>
<tr>
<td>
<picture>
<source>
<hr>
```

タグの内側に本文がある場合は、本文だけを比較します。「表示」から「HTMLタグを表示」をONにすると、対応する原稿位置のタグをチップとして確認できます。

「HTMLタグを差分から除外」をOFFにすると、タグと属性を含む原文を比較します。

## 差分エンジン

現在の比較処理は`diff-engine-v1.js`だけで実行します。

処理順：

```text
原稿
↓
行をCMS-aware Unitへ分類
↓
表示文字列と対応付け用文字列を分離
↓
本文・見出し・ラベルを先に対応付け
↓
空行を近い本文行の間へ戻す
↓
行内の文字差分を生成
```

主なUnit：

```text
heading
label
text
link
blank
asset
layout
```

比較結果には、画面表示用テキスト、原文、行種別、差分パーツ、差分集計を含みます。

## Excel出力

コピーのメニューにある「Excelで差分確認」から`.xlsx`を出力します。

- A列：変更前
- B列：差分記号
- C列：修正後
- 変更文字は左右とも赤文字
- 左側は淡い赤背景、右側は淡い緑背景
- 文字数は表示しない
- 差分件数、置換・追加・削除件数を表示
- 見出し4行を固定
- 横向き、1ページ幅の印刷設定

Excelは`TextReviewApp.getComparison()`から、画面と同じ比較結果を受け取ります。

## データ保存

入力内容と表示設定は、ブラウザの`localStorage`へ保存します。

```text
text-review-studio-v1
```

旧バージョンの保存データがある場合は、`baseline`と`working`をそれぞれ変更前・修正後へ移行します。

入力内容は外部APIへ送信しません。外部CDN、外部フォント、アクセス解析も使用しません。

## 現在の実行ファイル

```text
index.html
app-v1.css
app-v1.js
diff-engine-v1.js
xlsx-export-v1.js
```

次の旧ファイルは現在のページから読み込まれません。

```text
app.js
styles.css
pre-app-compat.js
cms-tag-tools.js
workspace-ui.js
difff-rail-view.js
diff-core.js
diff-core-hunk-bridge.js
diff-ignore-assets.js
xlsx-export.js
```

## テスト

```bash
node --check diff-engine-v1.js
node --check app-v1.js
node --check xlsx-export-v1.js
node tests/diff-tests.js
node tests/line-alignment.test.js
node tests/ui-contract.test.js
```

`tests/ui-contract.test.js`は、比較エンジンが1本だけ読み込まれていること、旧ランタイムが`index.html`から外れていること、必要なDOMが存在すること、ポーリングが戻っていないこと、Excelがページの比較モデルを使用することを確認します。

## GitHub Pages

1. **Settings > Pages**を開きます。
2. **Deploy from a branch**を選びます。
3. Branchを`main`、Folderを`/(root)`にします。
4. 保存後、公開URLをハードリロードします。

ビルド処理は不要です。
