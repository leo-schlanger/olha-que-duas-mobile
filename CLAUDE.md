# Contexto do Projeto - Olha que Duas Mobile

## Informacoes do Projeto
- **Nome**: Olha que Duas
- **Package**: com.olhaqueduas.app
- **EAS Project ID**: 7b8ab7cd-38e7-45ca-b1d4-9193673be567
- **EAS Account**: schlanger

## Versoes Atuais
- **versionCode**: 72 (Android)
- **versionName**: 1.17.1
- **Expo SDK**: 55.0.0
- **React Native**: 0.83.6

## Credenciais Android (EAS)
- **Keystore**: credentials/android/keystore.jks
- **Alias**: 4ff3637c8976d3b065dc4bc1c29292f3
- **SHA256 Fingerprint**: 8A:9A:97:B4:91:05:5A:35:41:C7:5C:D9:1D:F0:0A:35:6F:29:D4:57:97:23:27:7E:A2:0E:1D:DD:E7:01:BE:99
- **Keystore Password**: dc78cb192fa1fd8dc97ce0aa1f8af88a
- **Key Password**: 55cc3fd214dfc4370818555a6e891a78
- **Backup EAS**: expo.dev > Project > Credentials > Download Keystore Backup

## Build Local AAB (Play Store) - ROTEIRO COMPLETO

### SHA1 Esperado pela Play Store
```
SHA1: C8:0B:28:E9:EF:84:19:BD:CE:72:C7:DE:5C:A7:7E:83:E6:58:0F:22
```

### PRE-REQUISITOS
1. Fechar Android Studio, VS Code e qualquer terminal na pasta do projeto
2. Reiniciar o computador se houver problemas de permissao

### ROTEIRO DE BUILD (executar em sequencia)

**PASSO 0: Deletar pasta android** (OBRIGATORIO antes do prebuild)
```bash
rm -rf android
```

**PASSO 1: Prebuild** (sem --clean, causa problemas de permissao no Windows)
```cmd
cd D:\Projetos\olha-que-duas-mobile
npx expo prebuild --platform android
```

**PASSO 2: Criar keystore.properties**
Criar arquivo `android/keystore.properties` com conteudo:
```properties
storeFile=../../credentials/android/keystore.jks
storePassword=dc78cb192fa1fd8dc97ce0aa1f8af88a
keyAlias=4ff3637c8976d3b065dc4bc1c29292f3
keyPassword=55cc3fd214dfc4370818555a6e891a78
```

**PASSO 3: Editar android/app/build.gradle**

3a. Adicionar APOS a linha `def projectRoot = ...`:
```groovy
// Load keystore properties for release signing
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

3b. Substituir bloco `signingConfigs` por:
```groovy
signingConfigs {
    debug {
        storeFile file('debug.keystore')
        storePassword 'android'
        keyAlias 'androiddebugkey'
        keyPassword 'android'
    }
    release {
        if (keystorePropertiesFile.exists()) {
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
}
```

3c. No bloco `buildTypes > release`, mudar:
```groovy
// DE:
signingConfig signingConfigs.debug
// PARA:
signingConfig signingConfigs.release
```

**PASSO 4: Build AAB** (ARM only — x86 CMake quebrado no RN 0.83.4)
```cmd
cd android && ./gradlew.bat bundleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
```

**PASSO 5: Verificar assinatura**
```cmd
keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab
```
Deve mostrar SHA1: C8:0B:28:E9:EF:84:19:BD:CE:72:C7:DE:5C:A7:7E:83:E6:58:0F:22

### AAB Final
- Build output: `android/app/build/outputs/bundle/release/app-release.aab`
- Arquivo versionado: `builds/olha-que-duas-v{version}-build{versionCode}.aab`
- A pasta `builds/` esta no `.gitignore` e serve para armazenar AABs localmente com nome descritivo
- Apos cada build, copiar o AAB: `cp android/app/build/outputs/bundle/release/app-release.aab builds/olha-que-duas-v{version}-build{versionCode}.aab`

### ERROS COMUNS
- **Pasta bloqueada**: Reiniciar PC e deletar pasta android manualmente
- **SHA1 errado**: Verificar se keystore.properties foi criado e build.gradle editado
- **NUNCA usar --clean no prebuild**: Causa problemas de permissao no Windows. Usar `rm -rf android` + `npx expo prebuild` em vez disso
- **x86 CMake falha**: Sempre usar `-PreactNativeArchitectures=armeabi-v7a,arm64-v8a`
- **AAB e APK em paralelo**: NAO rodar simultaneamente — conflitam no Gradle state. Fazer sequencialmente

## Comandos Uteis
- **Prebuild**: `rm -rf android && npx expo prebuild --platform android`
- **Build AAB**: `cd android && ./gradlew.bat bundleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a`
- **Build APK**: `cd android && ./gradlew.bat assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a`
- **Verificar deps**: `npx expo-doctor`
- **TypeScript**: `npx tsc --noEmit`
- **Testes**: `npm test` ou `npm run test:coverage`
- **Lint**: `npm run lint` ou `npm run lint:fix`
- **Formatacao**: `npm run format`

## Infraestrutura de Testes
- **Framework**: Jest com ambiente Node (nao jest-expo devido a modulos nativos)
- **Config**: jest.config.js com mocks customizados
- **Mocks**: src/__tests__/__mocks__/ (expo-notifications, expo-audio, expo-location, etc.)
- **Setup**: src/__tests__/setup.ts (mocks globais, AsyncStorage, Supabase)
- **Cobertura**: 37 testes em services e hooks

## Arquitetura e Padroes

### Radio e MediaSession (v1.17.0)
- **Separacao clara**: expo-audio faz streaming apenas (ExoPlayer). Nosso `MediaService` nativo gerencia tudo o resto
- **MediaService.kt** (`modules/expo-media-session/android/`): foreground service com `android.media.session.MediaSession`, notificacao, WiFi lock, bitmap loading, **metadata polling nativo**
- **ExpoMediaSessionModule.kt**: bridge JS↔MediaService com API: `activate`, `updateMetadata`, `updatePlaybackState`, `startMetadataPolling`, `stopMetadataPolling`, `deactivate` + eventos `onRemotePlay/Pause/Stop`
- **Pending queue**: Chamadas a updateMetadata/updatePlaybackState antes do service estar pronto sao enfileiradas e flushed via `onReadyCallback`
- **Threading**: Bitmap decode e metadata polling no `artworkHandler` thread, MediaSession e Notification updates sempre na main thread via `mainHandler`
- **Native metadata polling**: O Android suspende a thread JS em background. O MediaService faz polling direto na API AzuraCast a cada 10s no seu proprio thread, atualizando notificacao independente do JS
- **Artwork**: Suporta file:// (instant) e http(s):// (download com timeout 8s, max 5MB). Cache local via `artworkCache.ts`. Em background, native side usa URL remota diretamente
- **Lock screen controls**: Eventos nativos (`onRemotePlay/Pause/Stop`) em vez de polling — resposta instantanea
- **expo-audio**: `setActiveForLockScreen` NUNCA e chamado. Sem patches no expo-audio
- **WiFi lock**: Gerido pelo MediaService (previne WiFi off com ecra desligado)

### Resiliencia
- **Error Boundary**: Componente ErrorBoundary.tsx envolve toda a app, captura erros de render
- **Offline Detection**: NetworkContext.tsx com expo-network, OfflineBanner.tsx mostra status
- **Init States**: App.tsx usa 'loading' | 'ready' | 'failed' em vez de boolean

### Cache
- **News API**: Cache de 5 minutos em newsApi.ts
- **Weather API**: Cache de 10 minutos com arredondamento de coordenadas (2 casas decimais)
- **Invalidacao**: Funcoes `invalidateNewsCache()` e `invalidateWeatherCache()`

### Tipos TypeScript
- Interfaces tipadas para modulos dinamicos (AdServiceType, PurchaseServiceType, BannerAdComponentType)
- ThemeColors usado em vez de `any` para cores do tema
- MaterialCommunityIcons com cast: `name={icon as keyof typeof MaterialCommunityIcons.glyphMap}`

### Internacionalizacao (i18n)
- **Libs**: i18next + react-i18next + expo-localization
- **Idiomas**: PT (padrao) e EN
- **Config**: src/i18n/index.ts com detecao de idioma do dispositivo
- **Traducoes**: src/i18n/locales/pt.json e en.json (~254 chaves)
- **Persistencia**: AsyncStorage (@olhaqueduas:language)
- **Uso**: useTranslation() hook em todos os componentes

### Componentes de Settings
- **Extraidos**: SettingRow e MenuItem em src/components/settings/
- **Secoes**: AppearanceSection, LanguageSection, RadioSection, PremiumSection, NotificationSection, AboutSection (dentro de SettingsScreen)

### Schedule/Programacao
- **isActive**: Campo no fallback config (site.ts) e filtro no hook
- **isToday**: Destaque visual para programas do dia atual
- **isLive**: Calculo em tempo real baseado no horario de Portugal (Europe/Lisbon)
- **Sorting**: Programas de hoje aparecem primeiro

### Performance
- React.memo em componentes pesados (WeatherCard, WeatherForecast, NewsCard)
- useMemo para calculos de icones e descricoes
- FlatList com removeClippedSubviews e windowSize otimizado
- expo-image para cache de imagens

### Acessibilidade
- accessibilityLabel em botoes e cards
- accessibilityRole e accessibilityHint
- tabBarAccessibilityLabel em todas as tabs

## Linting e Formatacao
- **ESLint 10**: eslint.config.js (formato flat config)
- **Prettier**: .prettierrc com singleQuote, trailingComma, printWidth: 100
- **Plugins**: @typescript-eslint, react, react-hooks, prettier

## Deep Links
- Scheme: olhaqueduas
- Dominio: olhaqueduas.com, www.olhaqueduas.com
- Rota: /noticias/*

## Permissoes Android
- FOREGROUND_SERVICE
- FOREGROUND_SERVICE_MEDIA_PLAYBACK
- WAKE_LOCK
- INTERNET
- ACCESS_NETWORK_STATE
- POST_NOTIFICATIONS
- SCHEDULE_EXACT_ALARM
- ACCESS_FINE_LOCATION (clima)
- AD_ID (anuncios)
- BILLING (compras in-app)
- REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (background playback em OEMs agressivos)

## Supabase
- URL: jjifjbdfpvgeseqbjpkg.supabase.co
- Configurado via .env (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY)

---

# Tarefas Concluidas

## Tarefa #14: i18n com react-i18next - CONCLUIDA
- i18next + react-i18next instalados e configurados
- 254+ chaves de traducao em PT e EN (src/i18n/locales/)
- Seletor de idioma em SettingsScreen
- Persistencia via AsyncStorage
- 40+ componentes usando useTranslation()

## Tarefa #16: Refatorar RadioPlayer - CONCLUIDA
- RadioPlayer.tsx refatorado para ~408 linhas (orquestrador)
- Sub-componentes: RadioControls, NowPlaying, RadioVisualizer, ScheduleSection, DailyScheduleSection, SocialLinks, RadioInfoCards
- Estilos extraidos para styles/radioStyles.ts
- Exports centralizados em radio/index.ts

## v1.16.0: Arquitetura propria de MediaSession - CONCLUIDA
- MediaService.kt: foreground service com MediaSession, notificacao, WiFi lock
- ExpoMediaSessionModule.kt reescrito: activate/updateMetadata/updatePlaybackState/deactivate + eventos
- radioService.ts refatorado: removidos setActiveForLockScreen, dual-track artwork, WiFi lock manual
- Patch expo-audio deletado (patches/expo-audio+55.0.13.patch)
- Constante RADIO_LOCK_SCREEN_DELAY removida
- Test mock atualizado (setup.ts)
- Release notes: docs/releases/v1.16.0.md

## v1.16.1: Checkup geral + hardening profundo da radio - CONCLUIDA
- Checkup geral: teste corrigido, i18n completo (DAY_NAMES, "Dia inteiro"), cores accent no tema, mounted refs, NetworkContext background pause, lint 0 warnings, 9 deps atualizadas
- MediaService.kt: @Volatile callbacks, artwork request versioning (artworkRequestId), flushReady timeout 10s
- ExpoMediaSessionModule.kt: logging, stopSelf no OnDestroy
- radioService.ts: grace period null fix, reconnect guard, jitter backoff, try-catch volume/nowPlaying
- nowPlayingService.ts: listener array copy, payload ordering (lastProcessedPlayedAt)
- NowPlaying.tsx: onError fallback para artwork 404
- useDailySchedule.ts: getCurrentPeriod() com Europe/Lisbon timezone
- Release notes: docs/releases/v1.16.1.md

## v1.16.2: Artwork sync + background reliability - CONCLUIDA
- logoUri agora é getter reativo (não fica preso como URL remota se prefetch completar depois de play)
- External pause detection com debounce 500ms (evita false positive em hiccups transitórios)
- flushReady timeout cancelável via removeCallbacks
- Payload ordering com safety reset 30s (tolera clock skew do servidor)
- imageKey inclui URI do artwork (força remount do expo-image ao trocar localArtUri)
- Release notes: docs/releases/v1.16.2.md

## v1.16.3: Critical background fix - CONCLUIDA
- REVERTIDO: stopSelf() no OnDestroy do ExpoMediaSessionModule (matava o service em background)
- lastPlayingAt inicializado em play() para debounce funcionar desde o inicio
- Release notes: docs/releases/v1.16.3.md

## v1.17.0: Native background metadata polling - CONCLUIDA
- Diagnosticado: Android suspende thread JS em background (zero logs ReactNativeJS em 90s+), ExoPlayer continua via threads nativas
- MediaService.kt: pollMetadataFromApi() busca API AzuraCast a cada 10s no artworkHandler thread (Java nativo)
- Parsing JSON nativo: extrai title, artist, artwork do payload now_playing
- Dedup nativo: so chama updateMetadata() quando title/artist mudam
- ExpoMediaSessionModule: bridge functions startMetadataPolling/stopMetadataPolling
- radioService.ts: pollingUrl getter, integracao com activate/deactivate
- Testado: 3 trocas de musica detectadas consecutivamente em background no emulador
- Release notes: docs/releases/v1.17.0.md

## v1.17.1: Checkup geral + Troubleshooting - CONCLUIDA
- Checkup completo: 0 erros TS, 0 lint warnings, 38/38 testes passando
- Weather verificado: sem bugs, problema era permissao de localizacao apos reinstalar
- Secao Resolucao de Problemas em Settings com instrucoes por marca (Xiaomi, Samsung, Huawei, OPPO, outros)
- Botao para desativar otimizacao de bateria
- Permissao REQUEST_IGNORE_BATTERY_OPTIMIZATIONS adicionada
- Orientacao para bloquear app nos recentes
- Link para dontkillmyapp.com
- ~20 novas chaves i18n (PT + EN)
- Release notes: docs/releases/v1.17.1.md
