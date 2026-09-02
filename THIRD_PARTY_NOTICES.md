# Third-Party Notices

OtoCanvasは、以下のオープンソースソフトウェアを利用しています。正確な導入バージョンと推移的依存関係は`package-lock.json`を参照してください。

## 実行時依存関係

| ソフトウェア | 用途 | ライセンス |
|---|---|---|
| React | UIコンポーネント | MIT |
| React DOM | ブラウザ描画 | MIT |

## 開発・テスト依存関係

| ソフトウェア | 用途 | ライセンス |
|---|---|---|
| TypeScript | 型検査・コンパイル | Apache-2.0 |
| Vite | 開発サーバー・本番ビルド | MIT |
| `@vitejs/plugin-react` | React用Viteプラグイン | MIT |
| Vitest | ユニットテスト | MIT |
| Playwright | ブラウザE2Eテスト | Apache-2.0 |
| `@types/react` / `@types/react-dom` | TypeScript型定義 | MIT |

各パッケージの著作権表示と完全なライセンス本文は、配布パッケージ内の`LICENSE`ファイルおよび各プロジェクトの公式リポジトリにあります。

## 音・画像素材

現在のOtoCanvasはWeb Audio APIによるリアルタイム合成音を使用し、第三者の録音済み音源を同梱していません。アプリアイコンと画面上の図形はプロジェクト内で生成したものです。今後、外部素材を追加する場合は、公開前に素材名・作者・入手元・ライセンス・改変内容をこのファイルへ追記してください。

## OtoCanvas本体

OtoCanvas本体はMIT Licenseで提供されます。詳細は`LICENSE`を参照してください。
