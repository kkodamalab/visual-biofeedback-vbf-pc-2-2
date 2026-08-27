# VBF Dual View Lab

iPhoneの側面カメラとPC内蔵の正面カメラを使い、スクワットを2視点でリアルタイム可視化する講義デモ向けMVPです。PCを統合ダッシュボード、iPhoneを独立した撮影・姿勢推定端末として使用します。

## 公開版の使い方

1. PCでGitHub Pagesのトップページを開く。
2. 「PCカメラを開始」を押してカメラ権限を許可する。
3. 表示されたQRコードをiPhoneの標準カメラで読み取る。
4. iPhoneで「側面カメラを開始」を押してカメラ権限を許可する。
5. PCモニタに正面・側面の2映像と解析結果が横並びで表示される。

## ローカル起動

PCのみの画面確認には次のコマンドを使用できます。

```powershell
python -m http.server 4173
```

`http://localhost:4173` を開きます。ただし、別端末のiPhoneからPCのHTTPアドレスへアクセスするとカメラAPIを利用できないため、実機接続にはHTTPSのGitHub Pages版を使用してください。

## 使用技術

- HTML / CSS / Vanilla JavaScript
- MediaPipe Tasks Vision Pose Landmarker
- WebRTC（PeerJS）による端末間の映像・DataChannel通信
- MediaDevices API
- Canvas 2D
- QRCode.js
- GitHub Actions / GitHub Pages

## 実装済み機能

- PC用統合ダッシュボードとiPhone用撮影ページ
- QRコードによる一時セッションのペアリング
- iPhone側で背面カメラ／インカメラをワンタップ切替
- PC正面カメラとiPhone背面カメラの同時表示
- 各端末で独立した姿勢推定
- スケルトン、膝関節角度、股関節角度、体幹傾斜
- 2視点の値を使った深度ゲージとコーチング表示
- iPhoneからPCへの映像・ランドマーク・タイムスタンプ送信
- GitHub Pagesへの自動公開

## プライバシーと通信

映像はWebRTCで端末間転送され、アプリでは録画・保存しません。PeerJSの公開シグナリングサービスとSTUNを接続確立に利用します。MediaPipe、PeerJS、QRCode.jsはCDNから読み込みます。

## 現時点での制約

- 2端末のランドマークには時刻を付与しますが、厳密なフレーム同期・校正・3次元再構成は未実装です。
- ネットワークやNAT環境によってWebRTC接続できない場合があります。独自TURNサーバーは未設定です。
- 角度は各カメラの2D投影上の推定値です。医療・競技判定用途の精度は保証しません。
- 初回読み込みと端末間接続にはインターネット接続が必要です。
- 講義前に実際のPC・iPhone・会場ネットワークで接続テストしてください。
