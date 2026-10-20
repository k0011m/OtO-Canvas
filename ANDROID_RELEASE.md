# Android版の配布・更新

## 0.4.11 / versionCode 12（2026-10-19）

- App.tsx・redesign.css・useEditorControlAvoidance.tsから編集画面左上の音世界切り替えを撤去。専用のWorldWave.tsxも削除しました。音世界の選択画面とドラッグ時の既存ボタン退避は維持。
- 成果物はandroid-release/0.4.11/。Android実機での確認は別途必要です。

## 0.4.10 / versionCode 11（2026-10-19）

- App.tsx・WorldWave.tsx・redesign.css・useEditorControlAvoidance.ts：編集画面左上に音世界の循環ボタンを追加。左上から波が広がり、図形がふわっと膨らんで世界の音源とテーマを切り替えます。
- 図形の種類・配置・色・音階は維持。演出中は編集を止め、動きを減らす設定は短いフェードに変更。成果物はandroid-release/0.4.10/。Android実機での確認は別途必要です。

## 0.4.9 / versionCode 10（2026-10-19）

- CanvasEditor.tsx・App.tsx・useEditorControlAvoidance.ts・redesign.css：編集中、図形を操作部に近づけると該当ボタンが退避し、ドラッグ終了・キャンセル・離脱で復帰。キャンバス全周の紫色枠を削除。
- Web版と同じ挙動を同梱。対象は図形移動のみで、手描きやMVの操作は変更しません。成果物はandroid-release/0.4.9/。実機での確認は別途必要です。

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

## 0.4.1 / versionCode 2（2026-10-18）

- WorldPicker.tsx：試聴中のカードの背景色と文字色を選択画面へ反映。
- App.tsx：図形配置後に色変更の案内を表示し、選択図形の色を変更すると終了。
- redesign.css：幅760px以下のパレットボタンを8px間隔で下端へ配置。図形一覧は上側、色一覧は下側へ展開。相互収納・開閉アニメーションを維持。
- 署名鍵・applicationIdは0.4.0と同一。成果物はandroid-release/0.4.1/へ生成します。
- scripts/check-editor-refresh.mjs：同梱予定のdistのみを使用し、背景色、配置後ガイド、幅320/390/760/1024pxのパレット、ガイド終了と再生を確認します。

## 0.4.2 / versionCode 3（2026-10-18）

- App.tsxのhandleStart()をnewProject()へ接続。Homeの「はじめる」は音の選択画面へ移る前に新規作品へ初期化します。
- newProject()で図形・色の選択、パレット、色変更案内、演奏準備をリセットし、保留中の保存予約と作曲を解除。図形・場面・Undo履歴は従来の新規初期化処理で消去します。
- Homeへ戻る際に保存した作品は作品棚に残ります。「つづきから」は従来通り再開します。
- scripts/check-editor-refresh.mjsでHomeへの往復、再開、新規開始後の空キャンバスと初期色を検証。Android成果物はandroid-release/0.4.2/。

## 0.4.3 / versionCode 4（2026-10-18）

- PerformanceCanvas.tsx：描画済み図形をポインター位置でつかみ、ドラッグで移動。指と図形中心の差を維持し、離した位置はそのMV画面内だけ保持。再生し直すと元の配置に戻り、保存作品は変えません。タッチ・ペン・マウスのPointer Eventsを使用。
- App.tsx：conduct()はドラッグ対象のsourceIdから音源を選択。screenBgmEnabledはcreate画面を除外し、編集の背景BGMを停止。操作時の音とMVの音楽は維持します。
- scripts/check-performance-drag.mjs：PerformanceCanvas単体を固定条件で描画し、黄色い図形の実描画ピクセルを測ってドラッグ移動と離した後の位置保持を検証。
- Androidにも同梱。成果物はandroid-release/0.4.3/。実機でのタッチ・音声確認は未実施です。

## 0.4.4 / versionCode 5（2026-10-18）

- 旧MediaQueryList APIしかない環境でApp起動時にaddEventListenerが例外となり白画面になる条件を再現。src/platform/watchMediaQuery.tsでaddListener/removeListenerへフォールバックし、App.tsx・MotionPreview.tsx・PerformanceCanvas.tsxへ適用。
- index.html：起動失敗時に復旧ボタンを表示。通信確認後、アプリ用Service Worker・キャッシュだけを整理して再読込。IndexedDBの作品・localStorageの設定は削除しません。
- public/sw.js：起動互換問題のある0.4.0〜0.4.3のキャッシュを検出した更新は待機させず適用。開いている画面を強制再読込しません。
- public/icon.svgは正方形SVG案v3へ更新。App.tsxのBrandShapes()、PWA PNG、Androidのランチャーと起動アイコンも同じマークへ統一。scripts/render-brand-icons.mjsでSVGからPNGを生成。
- scripts/check-mobile-boot.mjsは旧APIを再現して起動・編集・再生を検証します。ユーザー実機のログは取得できていないため、端末固有の原因一致までは未確認です。
- Android成果物：android-release/0.4.4/、実機確認未実施。

## 0.4.5 / versionCode 6（2026-10-18）

- src/styles/redesign.css：Home限定でロゴ領域を従来の約2倍（通常220〜340px四方）へ拡大。低い縦画面では高さを制限し、スマホ横画面ではロゴと開始操作を左右に配置。ファビコンと作品棚のロゴサイズは維持。
- Android成果物はandroid-release/0.4.5/。実機確認未実施。

## 0.4.6 / versionCode 7（2026-10-18）

- App.tsxのBrandShapes()を同じ形状のインラインSVGへ変更し、丸・三角・曲線を別グループに分割。
- redesign.css：Homeだけ各図形を異なる周期でゆっくり上下・回転。0.4.5の大きさを維持し、prefers-reduced-motionでは停止。ファビコンは静止画を維持。
- scripts/check-mobile-boot.mjsのロゴ検査をインラインSVGに対応。Android成果物はandroid-release/0.4.6/。

## 0.4.7 / versionCode 8（2026-10-18）

- redesign.css：Homeの丸の上下幅を24→56、三角を18→40 SVG単位へ拡大。三角の回転を±3→±8度、曲線を±2→±6度へ変更。周期を3.6・4・4.8秒へ短縮し、動きを見分けやすくしました。
- ロゴのサイズと動きを減らす設定を維持。Android成果物はandroid-release/0.4.7/。

## 0.4.8 / versionCode 9（2026-10-18）

- src/visuals/PerformanceCanvas.tsx：ドラッグの直近速度を保持し、指を離した後に慣性移動。120ms以上止めて離した場合や操作キャンセルでは投げません。再度つかむと速度をリセット。再生停止中と「動きを減らす」設定では慣性を進めません。
- src/visuals/floatingMotion.ts：時間に応じた指数減衰、図形半径を考慮した四辺の反射を追加。壁で速度を78%へ落とし、弱い動きは停止。編集データへの保存は行いません。
- tests/floatingMotion.test.tsで減速・四辺反射・30/60fpsの移動一致を検証。Android成果物はandroid-release/0.4.8/。
- 検証結果：慣性の単体テスト3件、ブラウザ上のフリック後移動・右壁反射・停止して離す操作が成功。Androidリリースビルド成功。実機での触り心地は未確認です。

## 友人への配信引き継ぎ（2026-10-20）

- ANDROID_FRIEND_HANDOFF.mdに公開アカウントの選択、提出手順、未準備素材、実機テスト、更新担当の引き継ぎを整理しました。
- share/OtO-Canvas-Android-0.4.11-handoff.zipに署名済みAPK・AAB、公開証明書、アイコン、ストア原稿、検証情報、SHA-256一覧を同梱。秘密鍵やパスワード・作品データは含めません。
- アプリ本体は0.4.11のまま。APK署名・AAB署名の検証と元成果物のハッシュ照合、ZIP展開内容のハッシュ照合を実施。Play Consoleへの提出と実機テストは未実施。
