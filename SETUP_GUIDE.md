# Guia de Configuração - Olha que Duas

Este guia vai ajudar-te a configurar tudo para publicar o app na Play Store.

---

## 1. Criar Conta Google Play Console

### 1.1 Registar-se como Desenvolvedor

1. Acede a: https://play.google.com/console/signup
2. Faz login com a conta Google que será a proprietária do app
3. Aceita os termos de serviço
4. Paga a taxa única de **25 USD** (pagamento único, válido para sempre)
5. Preenche os dados do desenvolvedor:
   - Nome do desenvolvedor: `Olha que Duas`
   - Email de contacto: `olhaqueduas.assessoria@gmail.com`
   - Website (opcional)
   - Telefone de contacto

### 1.2 Verificação de Identidade

- Google pode pedir verificação de identidade (documento + selfie)
- Demora 1-3 dias úteis

---

## 2. Criar o App na Play Console

### 2.1 Criar Novo App

1. No Play Console, clica em **"Criar app"**
2. Preenche:
   - **Nome do app**: `Olha que Duas`
   - **Idioma padrão**: Português (Portugal)
   - **App ou jogo**: App
   - **Gratuito ou pago**: Gratuito
3. Aceita as declarações

### 2.2 Configurar Ficha da Loja

1. Vai a **"Aumentar > Presença na loja > Ficha principal da loja"**
2. Preenche:
   - **Descrição breve** (máx. 80 caracteres):
     ```
     Rádio e notícias - A sua voz, 24 horas por dia
     ```
   - **Descrição completa** (máx. 4000 caracteres):
     ```
     O Olha que Duas é a sua nova fonte de informação e entretenimento!

     Funcionalidades:
     • Rádio ao vivo 24/7 com streaming de alta qualidade
     • Notícias atualizadas sobre política, sociedade e mais
     • Reprodução em segundo plano
     • Interface moderna e fácil de usar

     Apoie-nos removendo os anúncios com uma compra única!
     ```

### 2.3 Upload de Assets

Precisas preparar:

| Asset | Tamanho | Quantidade |
|-------|---------|------------|
| Ícone | 512x512 px | 1 |
| Feature Graphic | 1024x500 px | 1 |
| Screenshots telefone | 16:9 ou 9:16 | Mín. 2 |
| Screenshots tablet (opcional) | 16:9 ou 9:16 | Mín. 2 |

---

## 3. Configurar Produto In-App (Remoção de Anúncios)

### 3.1 Criar Produto

1. Vai a **"Monetizar > Produtos > Produtos no app"**
2. Clica em **"Criar produto"**
3. Preenche:
   - **ID do produto**: `remove_ads` (exatamente assim!)
   - **Nome**: `Remover Anúncios`
   - **Descrição**: `Remove todos os anúncios do app permanentemente`
   - **Preço**: 2,99 €
4. **Ativa** o produto

---

## 4. Criar Conta de Serviço (para CI/CD)

### 4.1 Google Cloud Console

1. Acede a: https://console.cloud.google.com/
2. Cria um novo projeto ou seleciona existente
3. Vai a **"IAM & Admin > Service Accounts"**
4. Clica em **"Create Service Account"**
5. Preenche:
   - **Nome**: `play-store-publisher`
   - **ID**: `play-store-publisher`
6. Clica em **"Create and Continue"**
7. Não adiciones permissões (skip)
8. Clica em **"Done"**

### 4.2 Criar Chave JSON

1. Clica na conta de serviço criada
2. Vai ao tab **"Keys"**
3. Clica em **"Add Key > Create new key"**
4. Seleciona **JSON**
5. Faz download do ficheiro (guarda em local seguro!)

### 4.3 Dar Permissões na Play Console

1. Volta ao Play Console
2. Vai a **"Utilizadores e permissões"**
3. Clica em **"Convidar novos utilizadores"**
4. Adiciona o email da conta de serviço:
   ```
   play-store-publisher@SEU-PROJETO.iam.gserviceaccount.com
   ```
5. Dá as permissões:
   - [x] Lançamentos de apps
   - [x] Gerir faixas de produção
   - [x] Gerir faixas de teste
6. Aplica ao app **Olha que Duas**

---

## 5. Criar Conta Expo (EAS)

### 5.1 Registar

1. Acede a: https://expo.dev/signup
2. Cria uma conta

### 5.2 Criar Token de Acesso

1. Vai a: https://expo.dev/accounts/[teu-username]/settings/access-tokens
2. Clica em **"Create Token"**
3. Nome: `github-actions`
4. Copia o token (só aparece uma vez!)

---

## 6. Configurar Google AdMob

### 6.1 Criar Conta

1. Acede a: https://admob.google.com/
2. Faz login com conta Google
3. Aceita os termos

### 6.2 Criar App

1. Clica em **"Apps > Add App"**
2. Seleciona **"Android"**
3. Seleciona **"Não, ainda não publiquei"**
4. Nome: `Olha que Duas`
5. Copia o **App ID** (formato: `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`)

### 6.3 Criar Ad Units

1. Vai ao app criado
2. Clica em **"Ad units > Add ad unit"**
3. Cria um **Banner**:
   - Nome: `banner_main`
   - Copia o Ad Unit ID

---

## 7. Configurar Secrets no GitHub

### 7.1 Adicionar Secrets

Vai ao teu repositório no GitHub:
**Settings > Secrets and variables > Actions > New repository secret**

Adiciona estes secrets:

| Nome | Valor |
|------|-------|
| `EXPO_TOKEN` | Token do Expo (passo 5.2) |
| `GOOGLE_SERVICES_JSON` | Conteúdo completo do JSON da conta de serviço (passo 4.2) |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://jjifjbdfpvgeseqbjpkg.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | A tua anon key do Supabase |

---

## 8. Atualizar Configurações do App

### 8.1 AdMob IDs

Edita `app.json` e substitui os placeholders:

```json
"GADApplicationIdentifier": "ca-app-pub-SEU-APP-ID"
```

E no plugin:

```json
["react-native-google-mobile-ads", {
  "androidAppId": "ca-app-pub-SEU-APP-ID",
  "iosAppId": "ca-app-pub-SEU-APP-ID"
}]
```

### 8.2 Ad Unit IDs

Edita `src/services/adService.ts` e substitui:

```typescript
const PRODUCTION_AD_UNITS = {
  BANNER: Platform.select({
    android: 'ca-app-pub-XXX/YYY', // Teu Ad Unit ID
  }),
  // ...
};
```

---

## 9. Primeiro Build e Publicação

### 9.1 Build Local (Teste)

```bash
npm install
eas build --platform android --profile preview
```

### 9.2 Build de Produção

```bash
eas build --platform android --profile production
```

### 9.3 Submit Manual (Primeira Vez)

```bash
eas submit --platform android --profile production
```

### 9.4 Pipeline Automática

Depois de configurar tudo, a cada push no branch `main`:
1. GitHub Actions inicia o build
2. EAS compila o app
3. Submete automaticamente para a Play Store (faixa interna)

---

## 10. Checklist Final

- [ ] Conta Google Play Console criada e verificada
- [ ] App criado na Play Console
- [ ] Ficha da loja preenchida
- [ ] Produto `remove_ads` criado (2,99 €)
- [ ] Conta de serviço criada com permissões
- [ ] Conta Expo criada
- [ ] AdMob configurado com ad units
- [ ] Secrets adicionados no GitHub
- [ ] IDs do AdMob atualizados no código
- [ ] Primeiro build testado

---

## Problemas Comuns

### "App not found in Play Store"
- O app precisa estar publicado (pelo menos em teste interno) para compras funcionarem

### "AdMob ads not showing"
- Em desenvolvimento, usa IDs de teste automaticamente
- Em produção, aguarda 24-48h após primeira configuração

### "Build failed on EAS"
- Verifica se `EXPO_TOKEN` está correto
- Verifica logs no https://expo.dev/

---

## Contactos Úteis

- **Suporte Play Console**: https://support.google.com/googleplay/android-developer
- **Suporte AdMob**: https://support.google.com/admob
- **Documentação EAS**: https://docs.expo.dev/eas/

