@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   课表更新：校验数据 - 生成 data.js - 推送
echo ============================================
node update.mjs --push
echo.
echo 全部完成！网页端已更新；手机日历将在 12 小时内自动同步。
pause
