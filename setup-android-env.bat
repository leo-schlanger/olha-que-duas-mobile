@echo off
REM Script para configurar variáveis de ambiente para Android/React Native build
REM Execute este script como administrador

echo Configurando variaveis de ambiente para Android Development...

REM JAVA_HOME - JDK 17
setx JAVA_HOME "C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot" /M
echo JAVA_HOME configurado para: C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot

REM ANDROID_HOME - Android SDK (sera configurado apos instalacao do Android Studio)
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk" /M
echo ANDROID_HOME configurado para: %LOCALAPPDATA%\Android\Sdk

REM Adicionar ao PATH
setx PATH "%PATH%;%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%ANDROID_HOME%\tools\bin" /M

echo.
echo Configuracao concluida!
echo Por favor, reinicie o terminal para aplicar as alteracoes.
echo.
echo NOTA: Apos instalar o Android Studio, abra-o uma vez para configurar o SDK.
pause
