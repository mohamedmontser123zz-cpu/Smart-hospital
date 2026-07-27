@echo off
echo ===================================================
echo MEDEX Deployment Script
echo ===================================================
echo.
echo Please enter your Raspberry Pi password (repberry) when prompted.
echo.
scp -o StrictHostKeyChecking=accept-new M:\projects2026\smarthospital_MEDex\final_all\resbaerry\node\main.js respberry@192.168.100.8:/home/respberry/resbaerry/node/main.js

echo.
echo Now uploading the dashboard files...
echo Please enter the password (repberry) again.
echo.
scp -o StrictHostKeyChecking=accept-new -r M:\projects2026\smarthospital_MEDex\final_all\frontend\dist respberry@192.168.100.8:/home/respberry/resbaerry/

echo.
echo ===================================================
echo Deployment complete! You can now restart start.sh
echo ===================================================
pause
