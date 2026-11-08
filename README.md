# ✦ Nossas Finanças

Visual nas cores do casamento: verde oliva, champagne, off-white e dourado. Os títulos usam a fonte Cormorant Garamond e os textos a Jost, as duas do Google Fonts.

App de finanças do casal, com **criptografia de ponta a ponta**: lançamentos, divisão de contas, resumo do mês e metas.

## O que o app tem

- **Painel**: dá para entender o mês só batendo o olho. Mostra quanto sobra ou falta, quanto já foi pago, para onde vai o dinheiro, os cartões e o ano inteiro (renda x despesas e saldo acumulado). Cada gráfico pode trocar de tipo (rosca, barras, colunas ou linhas).
- **Orçamento**: as mesmas categorias da planilha (Renda, Cartões, Pessoal, Impostos, Transporte, Despesas pessoais, Lazer, Investimentos, Dependentes). Tem valor por mês, um "pago" no lugar de pintar de verde e um botão para copiar os valores do mês anterior. Dá para criar, renomear e apagar categorias e linhas.
- **Cartões**: valor da fatura de cada cartão em destaque, para os dois mudarem rápido. Tem "fatura paga", limite opcional (com % usado) e um gráfico dos últimos 6 meses.
- **🏡 Casa** (tem três partes):
  - **🏗️ Obra:** etapas (projeto, fundação, alvenaria, telhado, elétrica, hidráulica, pisos, pintura…), cada uma com % de avanço, valor orçado e valor gasto. Na hora de registrar uma compra, é só escrever do seu jeito, por exemplo *"30 sacos de cimento 1.150 no pix, areia 600 pix"* ou *"porcelanato 4.800 no itaú 1 em 6x"*. O app entende a forma de pagamento (PIX, dinheiro, débito, boleto ou qual cartão), se foi à vista ou parcelado, e sugere a etapa e o tipo (material, mão de obra, projeto/taxas…). Também mostra gráficos por etapa, por tipo e por forma de pagamento, quanto sai do bolso por mês e a previsão do custo total.
  - **📍 Terreno:** valor, entrada, parcelas e vencimento. Mostra quanto já foi pago, quanto falta e quando quita.
  - **🛋️ Enxoval:** as listas de compras da casa.

  Tudo o que é pago no cartão entra na fatura daquele cartão (e as parcelas nas faturas seguintes). O que é pago em PIX, dinheiro, débito ou boleto, e as parcelas do terreno, entram sozinhos no Orçamento, na categoria "Terreno e obra".
- **Gastos detalhados de cada cartão** (botão 🧾 em cada cartão): escreva do seu jeito, por exemplo *"dia 03/11 500 paçoca, 700 2x calças, 400 pasta de dente"* ou *"tv 1200 em 3x"*. O app:
  - separa os itens, a data e as parcelas;
  - coloca a categoria sozinho (🍫 Alimentação, 👖 Roupas, 🧴 Higiene…) e aprende com as correções de vocês;
  - avisa se o total que você falou não bate com a soma dos itens;
  - espalha as parcelas pelas próximas faturas;
  - mostra um gráfico de "no que foi gasto".

  Se a fatura estiver vazia, ela vira a soma dos gastos. Se já tiver um valor digitado, o app mostra quanto ainda falta detalhar.
- **Casamento**: eletrodomésticos, itens da casa e festa, com preço, link e "comprado".
- **Ajustes**: convite para o par, importar a planilha .xlsx e exportar CSV.

## Tempo real e inteligência

- **Ao vivo:** quando um muda algo, o outro vê na hora, sem recarregar. Aparece um aviso ("🔔 Noivo mudou Bradesco para R$ 1.300,00"), o item pisca e o topo mostra "🟢 fulano online". Se você estiver digitando, o app espera você terminar para atualizar a tela.
- **Últimas mudanças:** o Painel mostra quem mudou o quê e quando.
- **Lançamento rápido (⚡):** escreva como fala, por exemplo "bradesco 1250", "uber 35 pago" ou "itau 1.250,00". O app entende qual conta é e pergunta se é para somar ou trocar o valor.
- **🧠 O que o app percebeu:** análises automáticas do mês:
  - nota de saúde financeira (0 a 100);
  - aviso de fatura vencendo ou vencida (coloque o dia de vencimento em Cartões);
  - cartão perto do limite;
  - fatura ou categoria acima do normal;
  - contas fixas que faltam lançar, com botão 🪄 para preencher sozinho;
  - previsão do próximo mês;
  - em quanto tempo dá para completar a lista do casamento no ritmo atual;
  - sugestão de quanto guardar.
- Tudo isso é calculado **no aparelho de vocês**. Nenhum dado sai descriptografado para nenhuma IA ou servidor.

## Como a segurança funciona

- **Cada um tem o próprio e-mail e a própria senha.**
- Sua senha nunca é enviada como você digitou. O app gera duas chaves diferentes a partir dela:
  1. uma "senha de login" para o servidor (PBKDF2, então o servidor não descobre a senha real);
  2. uma chave pessoal, que nunca sai do aparelho e destranca a chave do cofre.
- Os dados ficam criptografados com **AES-256-GCM**. O servidor (Supabase) guarda só texto embaralhado: valores, nomes, cartões, tudo.
- O cofre aceita no máximo 2 pessoas e tranca sozinho depois de 10 minutos sem uso.
- ⚠️ **Não existe "esqueci minha senha"** (é o preço da criptografia). Se um dos dois esquecer, o outro entra, gera um novo convite em Ajustes, e quem esqueceu cria uma conta nova com outro e-mail e entra pelo convite. Por isso o cofre precisa ter vaga: **se os dois esquecerem, os dados se perdem.**

---|---|---|
| **Senha da conta** | entrar no app (login) | cada um tem a sua |
| **Senha do cofre** | criptografar e abrir os dados | a mesma para os dois, combinada pessoalmente |

---

## Passo a passo (tudo pelo navegador, sem instalar nada)

### 1. Criar o banco no Supabase (grátis)
1. Crie uma conta em **supabase.com** e clique em **New project** (região: *South America (São Paulo)*). Anote a senha do banco.
2. Quando o projeto terminar de criar, abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Vá em **Project Settings → API** e copie:
   - **Project URL** (ex.: `https://abcd1234.supabase.co`)
   - a chave **anon public**
4. (Opcional, mais prático) Em **Authentication → Sign In / Providers → Email**, desligue **Confirm email** se não quiser confirmar por e-mail.

### 2. Subir o código no GitHub
1. No GitHub, clique em **New repository** → nome `nossas-financas` → **Public** → **Create repository**.
   > O GitHub Pages grátis exige repositório público. Não tem problema: o código não tem segredos, e os dados ficam criptografados no Supabase.
2. Na página do repositório, clique em **uploading an existing file**.
3. Descompacte o `.zip` e **arraste todos os arquivos e a pasta `supabase`** (não a pasta de fora, e sim o que está dentro dela). Clique em **Commit changes**.
4. Abra o arquivo `config.js` no GitHub, clique no lápis (✏️ Edit) e cole a URL e a chave anon do passo 1:
   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: "https://abcd1234.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi..."
   };
   ```
   Clique em **Commit changes**.

### 3. Colocar o site no ar (GitHub Pages)
1. No repositório: **Settings → Pages**.
2. Em **Source** escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** → **Save**.
3. Em 1 ou 2 minutos aparece o endereço: `https://SEU-USUARIO.github.io/nossas-financas/` (já com HTTPS).

### 4. Começar a usar
1. **Você:** abra o site → digite seu e-mail e sua senha → **Criar minha conta** → **Criar cofre** (coloque seu nome e o dele).
2. Em **Ajustes → Importar da planilha**, envie o arquivo .xlsx e escolha o ano. Orçamento, cartões e lista do casamento entram no app.
3. Em **Ajustes → Convite**, toque em **Gerar código de convite** e mande o código para seu noivo.
4. **Ele:** abre o site → e-mail e senha **dele** → **Criar minha conta** → **Recebi um convite** → cola o código.
5. Pronto: cada um entra com a própria senha e vê os mesmos dados. O que um muda, o outro vê.
6. 🔐 **Depois que os dois tiverem conta**, no Supabase vá em **Authentication → Sign In / Providers** e desligue **Allow new users to sign up**. Assim mais ninguém consegue criar conta no app de vocês. (Se um dia precisarem criar conta nova, religuem por alguns minutos.)

### 5. Instalar no celular
- **Android (Chrome):** menu ⋮ → **Instalar app** / **Adicionar à tela inicial**.
- **iPhone (Safari):** botão compartilhar → **Adicionar à Tela de Início**.

---

## Testar antes de configurar
Com o `config.js` vazio, o app roda em **modo teste**: simula as contas e o servidor só naquele navegador (também criptografado). Serve para conhecer o app antes de ligar o Supabase.

## Para atualizar o app depois
É só editar ou subir os arquivos de novo no GitHub (**Add file → Upload files**). O site se atualiza sozinho em 1 ou 2 minutos.

## Arquivos
| Arquivo | O que é |
|---|---|
| `index.html`, `style.css` | página e visual |
| `app.js` | telas (painel, orçamento, cartões, casamento, ajustes) |
| `data.js` | categorias, cálculos e importação da planilha |
| `charts.js` | gráficos (rosca, barras, colunas, linhas, medidor) |
| `xlsx.js` | leitor de .xlsx (roda no aparelho, sem enviar a planilha) |
| `crypto.js` | criptografia (AES-256-GCM + PBKDF2, senha individual) |
| `backend.js` | conexão com o Supabase (só envia dados criptografados) |
| `config.js` | **onde vocês colam a URL e a chave do Supabase** |
| `supabase/schema.sql` | tabelas e regras de segurança do banco |
| `manifest.json`, `sw.js`, ícones | deixam o app instalável no celular |
