# Text Review Studio v1

変更前と修正後の原稿を左右に並べ、CMS原稿を含む差分確認・検索置換・簡易整形・コピー・Excel出力をブラウザ内だけで行う静的Webアプリです。

## v1で整理したこと

- 原稿名、こだわりセット、旧確認レールを実行中のUIから削除
- `index.html`とJavaScriptが同じDOM構造を参照するように再構成
- 非表示の互換DOMを作る`pre-app-compat.js`を読み込まない構成へ変更
- 旧比較画面と後付け比較画面の二重描画を廃止
- 定期的な`setInterval`、`MutationObserver`による再比較を廃止
- 入力変更時だけ差分を計算し、結果を`state.comparison`へ保存
- CMS-awareな比較処理を`diff-engine-v1.js`へ統合
- 構造タグ除外、行対応、差分集計を比較エンジンだけで処理
- アプリはエンジンの`rows`、`summary`、`beforeRaw / afterRaw`を直接使用
- ページとExcelが同じ行対応を使用
- 修正後の検索・1件置換・一括置換・全角英数記号の半角変換を追加
- 置換と一括整形の操作履歴をタブ単位で保持
- 表示設定を1つのダイアログに統一し、「表示を反映」で確定
- サンプルテキストを1つの定義に統一
- コピーのメニューを固定ヘッダーより前面に表示
- 保存キーを`text-review-studio-v1`に統一

旧ファイルは移行確認のためリポジトリに残していますが、現在の`index.html`からは読み込まれません。

## 基本操作

1. 「変更前」と「修正後」に原稿を貼り付けます。
2. 「左右で比較」を押します。
3. 中央の`↔ / ＋ / −`、または「前の差分」「次の差分」で確認します。
4. 必要に応じて、修正後の原稿へ検索・置換・整形・CMSタグ追加を行います。
5. 右上の「コピー」から、本文・HTML・差分記録・Excelを出力します。

上部の「原稿を編集」「左右で比較」はスクロール中も固定されます。

## 修正後の検索・置換

左メニューの「修正後を検索・置換」から、修正後だけを対象に操作します。

- 検索結果の前後移動
- 現在選択中、または次に見つかった1件を置換
- 一致する文字列をすべて置換
- 置換後を空欄にして一括削除
- Enterで「次を置換」、Shift+Enterで「すべて置換」
- 全角スペース、全角英数字、全角記号を半角へ一括変換

全角変換では日本語・カナは変更しません。

### 今回の置換履歴

次の操作は「今回の置換履歴」へ記録します。

- 次を置換
- すべて置換
- 全角英数・記号を半角へ
- 空白を整理
- 記号を統一
- 表記を統一
- 空行を整理

履歴は`sessionStorage`を使うため、同じタブの再読み込み後も残り、タブを閉じると終了します。最大50件です。本文自体の直前操作は右上の「↶」で元に戻せます。

## HTMLタグの扱い

「HTMLタグを差分から除外」がONの場合、本文内容を優先して対応付けます。

例：

```html
<span class="info24-t2">販売対象試合</span>
```

```text
◆販売対象試合
```

この2行は見出し同士として対応させます。`<img>`や`<div>`、`<table>`、`<picture>`など本文を持たない構造タグは、比較エンジンの段階でページとExcelの通常差分から除外します。

「表示」から「HTMLタグを表示」をONにすると、比較エンジンが各行へ保持した元のHTMLをタグチップとして確認できます。比較結果自体は変わりません。

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

Excelは`TextReviewApp.getComparison()`から、画面と同じ比較結果を受け取ります。Excel側では再比較しません。

## データ保存

入力内容と表示設定は、ブラウザの`localStorage`へ保存します。

```text
text-review-studio-v1
```

置換履歴は、現在のタブだけで使う`sessionStorage`へ保存します。

```text
text-review-studio-v1-replace-history
```

旧バージョンの保存データがある場合は、`baseline`と`working`をそれぞれ変更前・修正後へ移行します。

入力内容は外部APIへ送信しません。外部CDN、外部フォント、アクセス解析も使用しません。

## ファイル構成

現在の実行ファイル：

```text
index.html
app-v1.css
app-v1.js
replace-tools-v1.css
replace-tools-v1.js
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
xlsx-export.js
diff-core.js
diff-core-hunk-bridge.js
diff-ignore-assets.js
```

## テスト

```bash
node --check app-v1.js
node --check replace-tools-v1.js
node --check xlsx-export-v1.js
node --check diff-engine-v1.js
node tests/diff-tests.js
node tests/line-alignment.test.js
node tests/replace-tools.test.js
node tests/ui-contract.test.js
```

`tests/replace-tools.test.js`は、1件置換、一括置換、先頭への折り返し、全角英数・記号の半角化を確認します。`tests/ui-contract.test.js`は、置換UIと履歴モジュールが読み込まれていること、旧ランタイムが戻っていないこと、アプリとExcelが統一比較モデルを使っていることを確認します。

## GitHub Pages

1. **Settings > Pages**を開きます。
2. **Deploy from a branch**を選びます。
3. Branchを`main`、Folderを`/(root)`にします。
4. 保存後、公開URLをハードリロードします。

ビルド処理は不要です。
