# 背單字 — 可安裝 PWA + Google 登入版

這是把 Claude artifact 版本的單字卡 App 轉成一個**獨立、可安裝、可用 Google 帳號登入**的網站。
資料存在 Firebase Firestore，每個使用者的資料互相隔離（見 `firestore.rules`）。

## 一、建立 Firebase 專案

1. 前往 https://console.firebase.google.com ，建立新專案。
2. 左側選單「Authentication」→「Sign-in method」→ 啟用「Google」。
3. 左側選單「Firestore Database」→「建立資料庫」（正式環境模式即可，等一下會套用 `firestore.rules`）。
4. 左側選單「專案設定」（齒輪圖示）→ 拉到「你的應用程式」→ 新增「網頁」應用程式，會拿到一組設定值。

## 二、填入設定

打開 `src/firebase.js`，把裡面的 `firebaseConfig` 換成你剛剛拿到的那組值。

## 三、部署 Firestore 安全規則（很重要，別跳過）

這個規則確保每個人只能讀寫自己的資料，不會互相看到彼此的單字卡。

```bash
npm install -g firebase-tools
firebase login
firebase init firestore    # 選你的專案，規則檔選用現有的 firestore.rules
firebase deploy --only firestore:rules
```

## 四、本機安裝與測試

```bash
npm install
npm run dev
```

打開瀏覽器出現的網址，測試 Google 登入、新增單字、重新整理後資料是否還在。

## 五、正式部署（三選一都可以）

**方式 A：Vercel（最簡單）**
```bash
npm i -g vercel
npm run build
vercel --prod
```

**方式 B：Netlify**
把 `npm run build` 產生的 `dist/` 資料夾拖進 https://app.netlify.com/drop

**方式 C：Firebase Hosting（跟 Firestore 同一個專案，方便管理）**
```bash
firebase init hosting   # public 目錄選 dist
npm run build
firebase deploy --only hosting
```

部署完會拿到一個 `https://` 開頭的網址，例如 `https://your-app.vercel.app`。

## 六、在手機上安裝

用這個正式網址在手機瀏覽器打開（iPhone 用 Safari，Android 用 Chrome），
- iPhone：分享 → 加入主畫面
- Android：瀏覽器選單 → 安裝應用程式 / 加到主畫面

因為現在是真正的 Google 登入（Firebase Auth 會話），不會再有之前 Claude 發布連結那種「每次都要重新登入、資料歸零」的問題。

## 檔案結構

```
src/
  firebase.js     # Firebase 專案設定（要自己填）
  storage.js      # Firestore 讀寫（取代原本的 window.storage）
  AuthGate.jsx    # Google 登入畫面 + 登入後渲染主 App
  VocabApp.jsx    # 主要 App 邏輯（跟 Claude 版本幾乎一樣，只換了存取層）
  main.jsx        # React 進入點
firestore.rules  # 資料庫安全規則：只能讀寫自己的資料
vite.config.js   # 含 PWA 設定（manifest、icon），讓網站可以被「安裝」
```
