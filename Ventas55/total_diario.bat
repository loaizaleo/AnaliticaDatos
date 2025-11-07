@echo off
echo ==========================================
echo    ACTIVANDO ENTORNO VIRTUAL
echo ==========================================

REM Cambiar al directorio
cd /d "C:\Users\hp\Documents\Ingenieria_Analítica_Datos_UM\whatsapp_monitor"

REM Usar conda run - funciona igual en Miniconda
conda run -n leonardo python procesar_Ventas_55V2.py

if %errorlevel% equ 0 (
    echo ✅ PROCESO EXITOSO
) else (
    echo ❌ ERROR: Codigo %errorlevel%
)

echo ==========================================
timeout /t 60