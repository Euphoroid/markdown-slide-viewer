# Markdown Presentation (Static Web App)

Markdownファイルをプレゼンスライドとして表示する、ビルド不要の静的Webアプリです。`index.html` をGitHub Pagesで公開して使えます。

## 対応している変換ルール

- `#` (H1): タイトルスライド
- タイトルスライド内の箇条書きメタデータ:
  - `author:`
  - `organization:`
  - `position:`
  - `date:`
  - `footer:` (共通フッター)
- `##` (H2): 1ページ（ページタイトル）
- `###` 以降: ページ内の段落分け
- 箇条書き（番号/点）、表、画像（Markdown記法）を表示

## 使い方

1. `index.html` をブラウザで開く（またはGitHub Pagesで公開して開く）
2. 次のどちらかでMarkdownを読み込む
   - `.md を開く`: 単一Markdown
   - `フォルダを開く`: Markdown + 画像などを含むフォルダ全体
3. フォルダ読込時に `Markdown選択` から対象 `.md` を選ぶ
4. `PDF出力（印刷）` を押してブラウザ印刷からPDF保存

## 画像パスについて

- フォルダ読み込み時、Markdown内の相対パス画像（例: `./images/a.png`）を表示できます。
- 単一 `.md` 読み込み時は、ローカル相対パス画像はブラウザ制約で解決できないため、URL画像またはフォルダ読み込みを使ってください。

## GitHub Pages 公開手順（簡易）

1. このリポジトリをGitHubへpush
2. GitHubの `Settings` → `Pages`
3. `Deploy from a branch` を選択
4. ブランチ（例: `main`）/ ルート `/` を指定して保存
5. 数分後に公開URLへアクセス

## サンプル

- `/sample/presentation.md`
- `/sample/images/sample-diagram.svg`

フォルダ読み込みで `sample` フォルダを選択すると、画像付きの表示を確認できます。
