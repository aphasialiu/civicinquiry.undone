@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在建置網站（第一次會比較久）...
call npm run build
if errorlevel 1 (
  echo 建置失敗，請把上面的錯誤訊息貼給 Claude。
  pause
  exit /b 1
)
echo 啟動搜尋代理（測試替身）...
start "搜尋代理" /min cmd /c "npm run api"
echo 網站啟動中，瀏覽器會自動打開 http://localhost:4180
echo 要關閉：關掉這個視窗即可。
start "" http://localhost:4180
npx vite preview --port 4180 --strictPort
