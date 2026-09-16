# VBF Motion Lab

2台の一般的なWebカメラを独立した正面／側面Viewとして扱い、身体動作の計測・簡易解析・Visual Biofeedback・録画再生・CSV出力をブラウザ内で行うMVPです。従来のPC＋iPhone版も維持しています。

## 起動方法

### 公開版

GitHub Pagesのトップページを開くと、2-Webカメラ計測画面へ移動します。カメラ権限を許可し、Camera A/Bで異なるデバイスを選択して「カメラ開始」を押してください。

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
- WebRTC / PeerJS（従来のPC＋iPhone版）
- GitHub Actions / GitHub Pages

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
- iPhoneの背面／インカメラ切替
- Remote Camera画面でのカメラ一覧・手動選択、識別可能な物理Ultra Wideの0.5×／通常Wideの1×切替（初期値1×）
- Remote Cameraの全身表示（`object-fit: contain`）と、レンズ切替後のWebRTC・姿勢推定再接続
- 端末別姿勢推定とリアルタイム指標

## 現時点での制約

- ブラウザによるソフトウェア同時開始であり、ハードウェア同期ではありません。
- 角度と左右差は2D投影上の簡易指標です。3D再構成・カメラ校正・競技判定は行いません。
- 2台同時取得の可否、最大解像度、録画形式はカメラドライバとブラウザに依存します。
- MediaRecorderが出力する映像形式はブラウザによって異なります。
- MediaPipe本体とモデルはCDNから取得するため、初回読み込みに通信が必要です。
- スマートフォンでカメラ開始・権限許可後にデバイス名が公開されます。ブラウザが物理Ultra Wideを独立した`videoinput`として識別可能な名称で公開しない場合、0.5×は無効です。CSS縮小やデジタルズームによる代用はしません。手動カメラ選択は残しています。
- レンズ切替は各スマートフォン画面で独立します。Remote Dashboardの録画は映像のみで、Skeleton・数値の焼き込みや再生時の再解析は行いません。ブラウザが対応するMediaRecorder形式に依存します。
- 実機での0.5×選択と映像・Pose再開は、使用する端末・ブラウザで確認してください。
- 実際の授業前に、使用PC・カメラ・ブラウザの組み合わせで録画と再生を確認してください。
