# Android版の配布・更新

## 0.4.0 / versionCode 1（2026-10-18）

Reactの画面と音源、作曲WorkerをCapacitor 8.5.3のAndroidアプリへ同梱しました。サーバーのWebページを読み込む方式ではありません。初回から、図形の編集・作曲・再生・端末内保存をオフラインで利用する設計です。写真は任意のカメラ許可が必要です。外部アンケートの回答とストアからのインストール・更新は通信が必要です。

- applicationId: com.otocanvas.app（公開後は変更しない）
- minSdk: 24 / targetSdk・compileSdk: 36
- Android System WebViewを使用。作品保存領域はブラウザ版と別です。
- アンインストール・アプリのデータ消去で作品と設定が消えます。必要な作品は先にファイルへ書き出してください。
- Androidのクラウドバックアップ・端末移行対象から内部データを除外しています。
- 広範な写真・ストレージ・マイク権限は要求しません。ファイル出力はAndroidの保存先選択を使用し、1ファイル64MBまでです。

## 成果物

npm run android:release の成功後、android-release/0.4.0/ に以下ができます。

- OtO-Canvas-0.4.0.apk：端末へ直接インストールする署名付きAPK。
- OtO-Canvas-0.4.0.aab：Google Playへアップロードする署名付きAndroid App Bundle。
- SHA256SUMS.txt：成果物のチェックサム。

APK・AABはGitへ含めません。公開完了を意味するものではありません。

## 初回ビルド

Node.js、JDK21、Android SDK（platforms;android-36 / build-tools）、Android SDKライセンスが必要です。このPCではAndroid Studio付属JBRとSDKを使用します。

1. npm ci
2. Android Studioでandroidフォルダを開きSDKを設定するか、android/local.propertiesにsdk.dirを設定する。
   Windows例：sdk.dir=C\:/Users/ユーザー名/AppData/Local/Android/Sdk
3. 既存アプリの更新では、バックアップした .secrets/android/ を復元する。
4. 新規アプリでまだ鍵がない場合のみ npm run android:key
5. npm run android:release

JAVA_HOMEでJDKを指定できます。Windowsの既定はAndroid Studio付属JBRです。ビルドはWebビルド→Capacitor同期→APK/AAB生成→Android Lint→成果物コピーの順に進み、失敗時は停止します。

## 署名鍵の保管

今回、新規アップロード鍵を .secrets/android/ に作成しました。このフォルダにはupload-keystore.jksとパスワードを含むsigning.propertiesがあるため、フォルダ全体を暗号化した安全な場所へバックアップしてください。Git・共有ZIP・チャットには含めません。鍵が既存の場合、生成スクリプトは上書きしません。

Play App SigningでGoogle管理のアプリ署名鍵を使う場合、この鍵はアップロードの検証用です。直接配布APKはこの鍵で署名されるため、Playから配布されるAPKと署名が異なる場合があります。直接配布版からPlay版へ切り替える検証では、作品を先に書き出してください。

## Google Play公開に残る手順

1. Play Consoleでアプリを作成し、Play App Signingを設定する。
2. 内部テストへAABをアップロードする。
3. 実機で機内モードの初回起動、各音源、編集・再生、カメラ拒否と許可、内外カメラ切替、ファイル保存・読込、再起動後の作品復元を確認する。
4. ストア説明、アイコン、スクリーンショット、問い合わせ先、公開プライバシーポリシーURLを登録する。
5. 対象年齢、コンテンツレーティング、データセーフティ、広告なしの申告を実装に沿って記入する。幼児向けなのでFamilies要件を確認する。外部アンケートの扱いもプライバシー説明へ含める。
6. アカウントに表示される本人確認・テスト条件を満たし、製品版の審査へ提出する。

この作業ではPlay Consoleへのアップロード・審査提出は行っていません。Android実機・エミュレータが接続されていないため、実機でのカメラ・音声・保存先選択を含む確認は公開前に必要です。

## 更新

package.jsonのversionを新しい表示版番号へ、androidVersionCodeを前回より大きい整数へ変更します。package-lock.jsonも更新し、同じ署名鍵でnpm run android:releaseを実行、新しいAABをPlay Consoleへアップロードします。

ネイティブ版ではService WorkerによるWeb版の差し替えを停止しています。Webサイトへのpushだけではインストール済みアプリは更新されず、Playの更新配信を使います。通常の上書き更新では端末内作品を維持しますが、保存形式を変更する更新では移行テストが必要です。

## 主な変更ファイル

- capacitor.config.json：ローカルdist同梱、Android設定。
- android/app/build.gradle：版番号取得とローカル署名設定。
- android/app/src/main/AndroidManifest.xml：任意のカメラ許可、バックアップ無効、平文通信無効。
- MainActivity.java / NativeFilesPlugin.java：保存先選択とファイル書込み。
- src/platform/native.ts・saveFile.ts：環境判定と共通保存処理。
- src/export/：画像・音声・作品ファイル・動画を共通保存へ接続。
- src/pwa/registerServiceWorker.ts / src/app/OfflineSettings.tsx：ネイティブでは同梱リソースとストア更新を使用。
- src/app/App.tsx・CelebrationCamera.tsx：保存結果処理、子ども用Homeの外部アンケート非表示。
- scripts/create-android-key.mjs・build-android.mjs：鍵作成と再現可能なリリースビルド。

## 公式資料

- [Android App Bundle](https://developer.android.com/guide/app-bundle)
- [Playへのアップロード](https://developer.android.com/studio/publish/upload-bundle)
- [ターゲットAPI要件](https://developer.android.com/google/play/requirements/target-sdk)
- [Familiesポリシー](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en)

## 今回の確認結果

- npm test：180件成功。
- npm run android:release：Webビルド、署名付きAPK/AAB、Android Lint成功（テンプレートの未使用リソース等の警告あり）。
- node scripts/check-android-bundle.mjs：Android同梱ファイルだけをブラウザへ返し、Home→編集→作曲→再生の成功と外部リクエストなしを確認。Android実機テストの代替にはなりません。
- apksigner verify：APKのv2署名検証成功。aapt：applicationId、versionName 0.4.0、versionCode 1、minSdk24、targetSdk36を確認。
- jarsigner：AAB署名検証成功。自己署名証明書・タイムスタンプ・ZIPエントリ順序の警告あり。Play Console側の受理確認は未実施。
- 既存の開発サーバー経由UIテストは起動待ちで停止し、同梱ファイル検査に切り替えました。
