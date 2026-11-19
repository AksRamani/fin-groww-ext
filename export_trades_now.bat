@echo off
title FinGroww - Export Trades to D:\Tred CSVs
echo ========================================================
echo   FinGroww Trade CSV Direct Exporter
echo   Saving all trade details to D:\Tred CSVs...
echo ========================================================
echo.
node "%~dp0sync_csvs_to_d_drive.js"
echo.
pause
