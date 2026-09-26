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

「ふわり」は以下のCC0音源を使用します。ぽんぽんの楽器・きらりの電子音は合成音です。アイコンと図形はプロジェクト内で生成しています。

| 図形 / 用途 | 素材・作者・配布元 | 原音ファイル |
|---|---|---|
| 丸 / あーの声 | [ahh.wav — filmbetrachterin](https://freesound.org/people/filmbetrachterin/sounds/414227/) | `voice-ah.mp3` |
| 三角 / 口でポッ | [Mouth pop — fleurescence](https://freesound.org/people/fleurescence/sounds/573153/) | `mouth-pop.mp3` |
| 線 / ぽよん | [Boing.wav — davidou](https://freesound.org/people/davidou/sounds/88451/) | `cartoon-boing.mp3` |
| 四角 / あひるのおもちゃ | [Rubber Duck — Slothfully_So](https://freesound.org/people/Slothfully_So/sounds/685067/) | `toy-duck.mp3` |
| ひし形 / びよーん | [boing.wav — suzenako](https://freesound.org/people/suzenako/sounds/537060/) | `cartoon-twang.mp3` |
| 星 / キュッ | [Toy Squeak Sound — NightDrawr](https://freesound.org/people/NightDrawr/sounds/819531/) | `toy-squeak.mp3` |
| 六角形 / ボールぽん | [boing.wav — BranRainey](https://freesound.org/people/BranRainey/sounds/108737/) | `toy-ball.mp3` |
| 輪 / ヒューの笛 | [Slide Whistle.wav — WalliumVA](https://freesound.org/people/WalliumVA/sounds/672965/) | `slide-whistle.mp3` |
| ペン / ハミング | [2 notes female humming — owstu](https://freesound.org/people/owstu/sounds/727698/) | `voice-hum.mp3` |

全9点とも各配布ページの **CC0 1.0** 表記を2026-09-26に確認しました。[CC0概要](https://creativecommons.org/publicdomain/zero/1.0/) / [法的条文](https://creativecommons.org/publicdomain/zero/1.0/legalcode)。作者による本アプリの推薦・公認を意味しません。

取得したのはログインなしで公開されているHQ MP3プレビューです。`assets/audio-sources/`に取得したMP3、`sources.json`に取得URL・SHA-256・切り出し区間を保存しています。アプリ用の改変は、短い区間の抽出、無音除去、モノラル化、22,050Hz PCM化、70Hzハイパス・8,500Hzローパス、DC除去、ピーク/RMS調整、前後フェード、実行時の移調です。元の曲のメロディーは使用せず、ハミングは最初の短い発声区間を使用します。CC0素材はアプリ本体のMITライセンスと区別して扱います。

2026-09-26追記：ふわりの環境音風合成を、声・おもちゃ・まんがの同梱PCM素材へ変更。

## OtoCanvas本体

OtoCanvas本体はMIT Licenseで提供されます。詳細は`LICENSE`を参照してください。
