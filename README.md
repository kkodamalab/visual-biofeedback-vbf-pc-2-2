# VBF Motion Lab

スクワットの2視点動作計測とVisual Biofeedback実験用のブラウザアプリです。2-Webカメラ版と、PC Camera／Remote Smartphone A・Bを選べるDual View Dashboardを提供します。

## 起動方法

### 公開版

GitHub Pagesのトップページを開くと、2-Webカメラ計測画面へ移動します。カメラ権限を許可し、Camera A/Bで異なるデバイスを選択して「カメラ開始」を押してください。

- Remote実験Dashboard: `https://kkodamalab.github.io/visual-biofeedback-vbf-pc-2-2/?remote=1`
- A/BそれぞれのQRを別のスマートフォンで開き、カメラを開始。Front／SideのSourceを選択します。PC Cameraを使う場合だけPCカメラ開始を押します。
- FEEDBACKで条件を設定し、「2視点を録画」→「録画を終了」で1 Trial。Trial Historyから過去TrialをReplay／CSV・映像保存します。

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
- WebRTC / PeerJS（PC＋Remote Smartphone、またはRemote 2台）
- GitHub Actions / GitHub Pages

## 簡易テスト

`node --test tests/experiment-math.test.mjs`で計測式を確認できます。`/tests/experiment-fixture.html`は合成Poseで複数Trial・過去Trial Replay・No BF・Seek・10件上限をブラウザ検証します。実カメラ／2台WebRTC／0.5×は使用端末で確認してください。

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
- 各視点で映像、Skeleton、角度、Visual Feedbackを表示。PC映像はPCで、Remote映像はスマートフォンでPose推定します。2視点の生映像を同時録画して個別に保存できます。
- Dashboardの実験設定: No BF／Concurrent／Terminal、KR／KP、Simple／Detailed、5角度・7位置の複数選択、Numeric／Skeleton／Trajectory／Waveform／Targetの個別ON/OFF。
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
- Trialはタブのメモリ内のみです。リロード／閉じると消えます。残したい試技はCSVと映像をダウンロードしてください。グループ間の共有DBはありません。録画は最大5分または約450 MBで自動停止し、Historyは最大10 Trial・概ね500 MBで古いものから解放します。
- Remoteの映像とPoseデータはWebRTCで別々に到着するため、Replayの動画と波形には通信遅延程度のずれがあり得ます。ハードウェア同期ではありません。
- 角度と左右差は2D投影上の簡易指標です。3D再構成・カメラ校正・競技判定は行いません。
- 2台同時取得の可否、最大解像度、録画形式はカメラドライバとブラウザに依存します。
- MediaRecorderが出力する映像形式はブラウザによって異なります。
- MediaPipe本体とモデルはCDNから取得するため、初回読み込みに通信が必要です。
- スマートフォンでカメラ開始・権限許可後にデバイス名が公開されます。ブラウザが物理Ultra Wideを独立した`videoinput`として識別可能な名称で公開しない場合、0.5×は無効です。CSS縮小やデジタルズームによる代用はしません。手動カメラ選択は残しています。
- レンズ切替は各スマートフォン画面で独立します。録画映像は生映像で、Skeleton・数値の焼き込みはありません。保存したLandmarkをReplayのOverlayに用います。ブラウザが対応するMediaRecorder形式に依存します。
- 実機での0.5×選択と映像・Pose再開は、使用する端末・ブラウザで確認してください。
- 実際の授業前に、使用PC・カメラ・ブラウザの組み合わせで録画と再生を確認してください。
