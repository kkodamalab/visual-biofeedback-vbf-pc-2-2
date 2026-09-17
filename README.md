# VBF Motion Lab

スクワットの2視点動作計測とVisual Biofeedback実験用のブラウザアプリです。2-Webカメラ版と、PC Camera／Remote Smartphone A・Bを選べるDual View Dashboardを提供します。

## 起動方法

### 公開版

GitHub Pagesのトップページを開くと、2-Webカメラ計測画面へ移動します。カメラ権限を許可し、Camera A/Bで異なるデバイスを選択して「カメラ開始」を押してください。

- Remote実験Dashboard: `https://kkodamalab.github.io/visual-biofeedback-vbf-pc-2-2/?remote=1`
- A/BそれぞれのQRを別のスマートフォンで開き、カメラを開始。Front／SideのSourceを選択します。PC Cameraを使う場合だけPCカメラ開始を押します。
- FEEDBACKで条件を設定し、「2視点を録画」→「録画を終了」で1 Trial。Trial Historyから過去TrialをReplay／CSV・映像保存します。
- Dashboardの「Open Monitor View ↗」を押すと同一ブラウザの別Window／Tabで投影専用画面を開きます。Dashboardを開いたまま使用してください。

### ローカル

```powershell
python -m http.server 4173
```

- 2-Webカメラ版: `http://localhost:4173/lab.html`
- PC＋Remote Smartphone版: `http://localhost:4173/?remote=1`

## 使用技術

- HTML / CSS / Vanilla JavaScript
- MediaPipe Tasks Vision Pose Landmarker
- MediaDevices API / MediaRecorder API
- Canvas 2D（Skeleton、Trajectory、時系列グラフ）
- BroadcastChannelと同一originのDashboard参照（Monitorの設定通知／既存映像・Canvas描画の共有。Monitorはカメラ取得・Pose推定なし）
- WebRTC / PeerJS（PC＋Remote Smartphone、またはRemote 2台）
- GitHub Actions / GitHub Pages

## 簡易テスト

`node --test tests/experiment-math.test.mjs tests/gauge.test.mjs tests/feedback-features.test.mjs`で計測式、左右角度、解剖学的接続、Low-passの非破壊処理、Target進入Beepの状態を確認できます。`/tests/experiment-fixture.html`は合成Poseで左右表示・CSV、Position接続、Filter／Beep操作、変数ON/OFF、複数Trial・過去Trial Replay・No BF・Seek・10件上限をブラウザ検証します。`/tests/monitor-fixture.html`は既存Canvas・数値・Target・波形・ゲージのMonitor描画と表示モードを検証します。実カメラ／2台WebRTC／0.5×とスピーカーの聞こえ方は使用端末で確認してください。

## 実装済み機能

### 2-Webカメラ計測画面

- Camera A/Bの個別選択、同時表示、Front／Side指定
- 両カメラの独立したPose estimation
- Skeletonのカメラ別描画
- 膝角度、股関節角度、体幹傾斜、正面左右非対称指標
- Wrist／Shoulder／Hip／Knee、Left／Rightを選べる3秒間のTrajectory
- No Feedback／Concurrent Feedback／Terminal Feedback
- Skeleton／Trajectory／Numeric／Angles／Targetの個別ON/OFF
- Knee angleのTarget値とTolerance、範囲内表示
- Knee／Hip／Trunk／Tracking X/Yの時系列グラフ
- Camera A/Bの同時録画、同期再生、Seek、再生速度
- Terminal Feedbackで録画後にReplayとSkeletonを表示
- Trial number、Condition、Memo
- タイムスタンプ、カメラ、View、角度、追跡点、非対称指標、Feedback条件、全Landmarkを含むCSV
- Camera A/B録画映像のダウンロード

### Remote Smartphone画面

- Front／SideそれぞれでPC Camera、Smartphone A、Smartphone Bを選択（重複選択時は他方と入替）。初期値はPC正面＋A側面です。A正面＋PC側面、A正面＋B側面も選択できます。
- A/BそれぞれのQRコードと端末ごとに固有のSession IDを用いたWebRTC接続。スマートフォンで各QRを開き、カメラを開始してください。
- QRはPC画面でSmartphone Aを左、ROOM CODEを中央、Smartphone Bを右へ離して配置。狭い画面では縦に並べます。
- 各視点で映像、Skeleton、角度、Visual Feedbackを表示。PC映像はPCで、Remote映像はスマートフォンでPose推定します。2視点の生映像を同時録画して個別に保存できます。
- Dashboardの実験設定: No BF／Concurrent／Terminal、KR／KP、Simple／Detailed、5角度・7位置の複数選択、Numeric／Skeleton／Trajectory／Waveform／Targetの個別ON/OFF。
- Angle SIDEはLeft／Rightを独立選択可能。Knee／Hip／Ankleは左右別に計測・描画・波形・CSV保存します。Trunk／Head–Neckは従来の計算定義を保ち、両側選択時はLeft、Rightのみ選択時はRightの1系列として表示します。
- Positionの「Connect selected positions」は通常Skeletonから独立し、選択した解剖学的な隣接点だけを左右別に結びます。WristはShoulderからの分岐です。接続ON中の点・線はAngle SIDEのLeft／Rightに従い、位置の数値・波形・CSVは従来どおりPosition側のMidpoint／Left／Right選択に従います。
- WaveformはRaw／Low-passを切替可能。初期Cutoffは6 Hz。実測フレーム間隔の中央値から推定Nyquist上限を更新し、各サンプル間隔でもCutoffをNyquist未満に制限する因果的1次RCフィルタを表示時に適用します。保存するRaw landmark／角度／位置は上書きしません。Replay波形にもTrial時点のFilter設定を適用します。
- Angle TargetごとにBeepをON/OFF可能。選択したFront／Sideの1視点から、Target±Toleranceへの進入を2フレームで確定し、退出2フレーム・ヒステリシス・最短600 ms間隔で再発音を制御します。複数同時到達は120 ms以内の音をまとめます。Test BeepでWeb Audio音声を確認できます。
- Concurrentでは選択した角度だけを関節の弧・基準線・数値、選択したPositionだけをマーカー・座標として映像上へ重ねます。チェックの変更は即時反映され、基本スケルトンは独立表示です。
- Live Camera VideoをON/OFF可能。OFFは映像の表示だけを隠し、カメラ入力・Pose推定・録画を継続します。QRはA/Bを離した独立カードです。
- 映像とSkeletonを独立切替。Skeleton線幅・Joint marker sizeはそれぞれ共通5段階（初期3）。選択した最大3系列の波形は各視点の映像直下に表示し、OFF時は領域を消します。
- GaugeをONにすると、選択した全Angle／Position X・Yの現在値をFront／Side別に横または縦のバーで表示。目標を有効にした変数はTarget線と許容範囲を重ね、「目標範囲内／高い／低い」を表示します。Positionの目標は0–1で設定可能。未設定の変数は「目標未設定」と示し、達成扱いにしません。Monitorにも同期します。
- 投影専用Monitor Viewを別Window／Tabで開き、Dual／Front Only／Side OnlyとFullscreenを切替。Dashboardの描画済みCanvas・既存videoを同一originで読み取り、Target・数値・波形・Coachを表示します。設定変更はBroadcastChannelでも通知します。Monitor側ではカメラ取得・Pose推定・録画を行いません。
- ユーザー指定のAngle Target／Toleranceを複数設定。Concurrentは映像上の値・差とTarget zone、Terminalは終了後のReplay・波形・結果要約で比較します。
- 録画開始〜停止を1 Trialとして映像・正規化Landmark・5角度・7位置・設定・時刻をメモリに保持。最大10 Trialまたは概ね500 MB（最新Trialは保持）。個別／全削除、任意のTrialをPlay／Pause／Seek／速度変更、動画・Skeleton・軌跡・数値・波形の切替、波形クリックSeek、Trial／全Trial CSV、各映像Download。
- iPhoneの背面／インカメラ切替
- Remote Camera画面でのカメラ一覧・手動選択、識別可能な物理Ultra Wideの0.5×／通常Wideの1×切替（初期値1×）
- Remote Cameraの全身表示（`object-fit: contain`）と、レンズ切替後のWebRTC・姿勢推定再接続
- 端末別姿勢推定とリアルタイム指標

## 現時点での制約

- 角度は映像縦横比でX軸を補正した2D投影角です。Knee=股関節–膝–足首、Hip=肩–股関節–膝、Ankle=膝–足首–足先の内角、Trunk=肩–股関節線と画面鉛直のなす鋭角、Head/Neck=耳–肩線と画面鉛直のなす鋭角です。Left／Rightを選べます。カメラ向きによって投影角が変化します。
- PositionはHead（耳）、Shoulder、Hip、Knee、Ankle、Wrist、Foot indexのLeft／Right／Midpointの画像内正規化座標0–1です。実寸cmではありません。CSVに全33 Landmark座標も保存します。
- KRはユーザー設定TargetとTrialの最深部（選択側のKnee角度が最小のフレーム）および所要時間の要約、KPは経過中の値・軌跡・波形を示します。Depth%は膝角度からの簡易表示で、競技判定や医学的基準ではありません。
- Live GaugeはConcurrent・KPで表示し、Target±Toleranceの範囲内を「到達」として示します。数値の大小だけで動作の良否を判定するものではありません。Positionゲージの目標は画像内座標であり、実空間位置ではありません。
- BeepはConcurrent時のみ鳴らし、No BF／Terminal中のリアルタイム音声提示はしません。Beep設定はVisual Target表示と独立です。ブラウザの音声再生制限のため、Beep ONまたはTest Beepのユーザー操作でAudioContextを有効化する必要があります。
- Trialはタブのメモリ内のみです。リロード／閉じると消えます。残したい試技はCSVと映像をダウンロードしてください。グループ間の共有DBはありません。録画は最大5分または約450 MBで自動停止し、Historyは最大10 Trial・概ね500 MBで古いものから解放します。
- Remoteの映像とPoseデータはWebRTCで別々に到着するため、Replayの動画と波形には通信遅延程度のずれがあり得ます。ハードウェア同期ではありません。
- 角度と左右差は2D投影上の簡易指標です。3D再構成・カメラ校正・競技判定は行いません。
- 2台同時取得の可否、最大解像度、録画形式はカメラドライバとブラウザに依存します。
- MediaRecorderが出力する映像形式はブラウザによって異なります。
- MediaPipe本体とモデルはCDNから取得するため、初回読み込みに通信が必要です。
- Face Landmarker／MediaFaceモデルは使用していません。Poseの汎用スケルトン描画では顔周辺の点を省略しています（Head/Neck角度の計測にはPoseの耳ランドマークを使用）。
- スマートフォンでカメラ開始・権限許可後にデバイス名が公開されます。ブラウザが物理Ultra Wideを独立した`videoinput`として識別可能な名称で公開しない場合、0.5×は無効です。CSS縮小やデジタルズームによる代用はしません。手動カメラ選択は残しています。
- レンズ切替は各スマートフォン画面で独立します。録画映像は生映像で、Skeleton・数値の焼き込みはありません。保存したLandmarkをReplayのOverlayに用います。ブラウザが対応するMediaRecorder形式に依存します。
- 実機での0.5×選択と映像・Pose再開は、使用する端末・ブラウザで確認してください。
- Monitor ViewはDashboardから開いた同一originの別Window／Tabでのみ映像を表示します。ブラウザのPopupブロック／opener遮断がある場合は許可が必要です。Dashboardを閉じると映像は止まります。Fullscreenはユーザー操作とブラウザのFullscreen API対応が必要です。
- 実際の授業前に、使用PC・カメラ・ブラウザの組み合わせで録画と再生を確認してください。
