@echo off
title FinGroww Local CSV Server (Port 8787)
echo ========================================================
echo   FinGroww Local CSV Server
echo   Directly writes all extension CSV exports to D:\Tred CSVs
echo ========================================================
echo.
node "%~dp0sync_csvs_to_d_drive.js" --server
pause
