# Guia de uso — RCS / SMS / WhatsApp Sender

Este guia explica, passo a passo, como instalar e usar este projeto em um Mac.
Você não precisa ter conhecimento técnico — basta seguir cada passo na ordem.

---

## 1. Antes de começar

Você vai precisar de:

- **Um Mac** com macOS recente (Big Sur ou mais novo).
- **Uma conta na Twilio** já criada, com as credenciais em mãos (Account SID
  e Auth Token).
- **Um sender já configurado na Twilio** — pode ser:
  - um agent RCS aprovado (ex: `twilio_xxxx_agent`), ou
  - um Messaging Service (ex: `MG...`) com um agent RCS vinculado, ou
  - um número de telefone Twilio (para SMS), ou
  - um sender WhatsApp aprovado.
- **Um arquivo CSV** com os contatos para envio (formato explicado mais abaixo).

---

## 2. Instalar o Node.js (uma vez só, se nunca instalou)

O projeto usa Node.js para rodar. Se você nunca instalou no seu Mac, faça:

1. Abra o navegador e vá em **https://nodejs.org/**
2. Clique no botão verde grande que aparece (versão "LTS" — recomendada).
3. Um arquivo `.pkg` será baixado.
4. Abra o arquivo baixado e siga o instalador clicando em **Continuar** →
   **Continuar** → **Aceitar** → **Instalar**.
5. Digite a senha do seu Mac quando pedir e clique em **Instalar Software**.
6. Aguarde a instalação terminar e clique em **Fechar**.

> Se você já tem Node.js instalado, pule esta seção.

---

## 3. Baixar o projeto

1. Abra o navegador e acesse a página do projeto no GitHub.
2. Procure o botão verde **Code** (perto do topo da página, à direita).
3. Clique em **Code** → uma caixinha vai aparecer.
4. Clique em **Download ZIP** (última opção da caixinha).
5. Aguarde o download terminar — geralmente vai para a pasta **Downloads**.

---

## 4. Descompactar o projeto

1. Abra o **Finder** (ícone do rostinho sorrindo no Dock).
2. Clique em **Downloads** na barra lateral.
3. Procure o arquivo ZIP recém baixado — algo como `bulk-rcs-tool-pm-main.zip`.
4. Dê **dois cliques** no arquivo ZIP.
5. Uma pasta com o mesmo nome (sem o `.zip`) vai aparecer ao lado.

Você pode mover essa pasta para onde preferir — por exemplo, para
**Documentos**. Mas pode deixar em **Downloads** também, tanto faz.

---

## 5. Abrir o Terminal

O Terminal é onde você vai digitar os comandos para rodar o projeto.

1. Aperte **⌘ + Espaço** (segurando a tecla Command e apertando barra de espaço).
2. Uma caixa de busca vai aparecer no meio da tela.
3. Digite **Terminal** e aperte **Enter**.
4. Uma janela preta (ou cinza) vai abrir.

Essa janela é o Terminal. É aqui que você vai digitar os próximos comandos.

---

## 6. Entrar na pasta do projeto

Agora você precisa "entrar" na pasta do projeto pelo Terminal.

1. Na janela do Terminal, digite exatamente isto, **mas não aperte Enter ainda**:

   ```
   cd 
   ```

   Atenção: tem um espaço depois do `cd`. Isso é importante.

2. Sem fechar o Terminal, abra o **Finder** e localize a pasta do projeto que
   você descompactou no passo 4.

3. **Arraste a pasta** do Finder para dentro da janela do Terminal.
   O caminho completo da pasta vai aparecer automaticamente depois do `cd `.

4. Agora aperte **Enter**.

Pronto — o Terminal "entrou" na pasta do projeto. Para confirmar, digite:

```
pwd
```

Aperte Enter. O Terminal vai mostrar o caminho da pasta. Se aparecer algo
terminando com `bulk-rcs-tool-pm-main` (ou parecido), está certo.

---

## 7. Instalar as dependências (só na primeira vez)

Ainda no Terminal, dentro da pasta do projeto, digite:

```
npm install
```

Aperte **Enter** e aguarde. Você vai ver várias linhas passando — isso é
normal. O processo pode levar de 30 segundos a 3 minutos, dependendo da sua
internet.

Quando terminar, o Terminal vai voltar a esperar você digitar o próximo
comando (vai aparecer o nome do usuário e um símbolo `%` ou `$`).

> Se aparecer alguma mensagem em amarelo ou vermelho, geralmente é só um aviso
> — pode ignorar e continuar.

---

## 8. Iniciar o projeto

Ainda no Terminal, na mesma pasta, digite:

```
npm start
```

Aperte **Enter**. Da primeira vez, o projeto vai "compilar" a interface — pode
levar 1–2 minutos. Aguarde até aparecer uma mensagem parecida com esta:

```
✔ Bulk RCS/SMS/WhatsApp Sender ready
  Open: http://localhost:3001
```

**Importante:** mantenha essa janela do Terminal aberta durante todo o uso.
Se você fechar, o projeto para de funcionar.

---

## 9. Abrir o projeto no navegador

1. Abra o **Safari**, **Chrome** ou outro navegador da sua preferência.
2. Na barra de endereços, digite:

   ```
   http://localhost:3001
   ```

3. Aperte **Enter**.

A interface do projeto vai abrir. Você verá um menu lateral à esquerda com as
seções: **Settings**, **Contacts**, **Message**, **Analytics**, **Sending** e
**Saved Senders**.

---

## 10. Configurar as credenciais da Twilio

1. No menu lateral, clique em **Settings**.
2. Na seção **Twilio Configuration**, preencha:
   - **Account SID** — começa com `AC...` (você encontra no Console da Twilio,
     na página inicial).
   - **Auth Token** — token que aparece embaixo do Account SID, geralmente
     escondido por bolinhas. Clique em "Show" para ver.
3. Os campos de **API Key SID** e **API Key Secret** podem ficar em branco se
   você não usa esses (são opcionais).
4. **Conversation Service SID** também pode ficar em branco — só é usado para
   a funcionalidade de Replies (respostas em duas vias).

> Essas credenciais ficam **apenas na memória do navegador** enquanto a página
> está aberta. Se você atualizar a página, vai precisar digitar de novo.

---

## 11. Configurar o sender

Ainda na página **Settings**, role a página para baixo até a seção **Sender
Configuration**.

1. Em **Channel**, escolha o canal de envio:
   - **SMS** para mensagens de texto simples.
   - **WhatsApp** para envio via WhatsApp Business.
   - **RCS** para mensagens RCS.

2. Em **Sender Type**, escolha entre:
   - **Phone Number** — você vai informar o sender diretamente (o número, o
     agent ID, ou a alpha sender).
   - **Messaging Service** — usa um pool da Twilio já configurado (com
     fallback automático e roteamento por canal).

3. Em **From Number** (se escolheu Phone Number), informe:
   - Para SMS: o número do seu sender no formato `+5511...`, ou um short code,
     ou uma alpha sender.
   - Para RCS: o ID do agent (ex: `twilio_lf0jqlym_agent` ou
     `rcs:twilio_lf0jqlym_agent`).
   - Para WhatsApp: o número aprovado no formato `+5511...`.

   Em **Messaging Service**, informe o SID que começa com `MG...`.

> **Dica:** se você cadastrou senders na seção "Saved Senders" antes, eles
> aparecem em um dropdown amarelo no topo, e é só selecionar.

---

## 12. Compor a mensagem

No menu lateral, clique em **Message**.

### Para mensagem de texto livre (qualquer canal)

1. Digite o texto da mensagem na caixa principal.
2. Você pode usar **variáveis** entre chaves para personalizar por contato.
   Por exemplo: `Olá {nome}, sua entrega chegou em {cidade}!`
3. O nome dentro das chaves precisa bater com o nome da coluna do seu CSV
   (mais detalhes abaixo).
4. Opcionalmente, em **Media URL**, cole o link público de uma imagem, vídeo
   ou documento (precisa começar com `https://`).

### Para usar um template (RCS ou WhatsApp)

1. Se você selecionou RCS, vai ver duas opções: **Use Content Template** ou
   **Free-text Message**. Clique em **Use Content Template**.
2. Na lista que aparece, escolha o template que você criou na Twilio.
3. O sistema vai mostrar as variáveis do template — preencha cada uma:
   - Com um valor fixo (ex: `Promoção da semana`), ou
   - Com uma variável da CSV usando chaves (ex: `{nome_cliente}` — o sistema
     substitui pelo valor da coluna `nome_cliente` para cada contato).

---

## 13. Preparar o arquivo CSV de contatos

O arquivo CSV é uma tabela simples. Você pode criar no **Excel**, **Numbers**
ou **Google Sheets** e exportar como CSV.

### Formato esperado

A primeira linha tem os nomes das colunas. A primeira coluna deve ter os
telefones (em qualquer formato, mas com código do país):

```
phone,nome,cidade
+5511999998888,Alice,São Paulo
+5511999997777,Bruno,Rio de Janeiro
+5511999996666,Carla,Belo Horizonte
```

Regras importantes:

- A **primeira coluna** deve ser o telefone. Pode chamar `phone`, `telefone`,
  `numero`, `mobile` — o sistema reconhece esses nomes.
- Os telefones precisam estar no formato internacional. Para o Brasil, use
  `+55` seguido do DDD e número (ex: `+5511999998888`).
- As outras colunas viram **variáveis** disponíveis para personalização. Se
  você tem uma coluna `nome`, pode usar `{nome}` na mensagem ou no template.
- Não pode ter contatos duplicados (o sistema bloqueia). Se a sua lista tem
  duplicados, ele oferece deduplicar automaticamente.

### Salvar como CSV

No Excel: **Arquivo** → **Salvar como** → escolha o formato **CSV UTF-8**.

No Numbers: **Arquivo** → **Exportar para** → **CSV...** → marque **UTF-8**.

No Google Sheets: **Arquivo** → **Fazer download** → **Valores separados por
vírgulas (.csv)**.

---

## 14. Enviar o arquivo de contatos

1. No menu lateral, clique em **Contacts**.
2. Clique no botão **Choose file** (ou arraste o CSV para a área pontilhada).
3. Selecione o seu arquivo CSV no Finder.
4. Aguarde alguns segundos — o sistema vai mostrar um resumo:
   - **Total** de linhas no arquivo
   - **Válidos** (contatos com telefone correto)
   - **Inválidos** (linhas com problema no telefone)

Se aparecer algum problema com o formato, o sistema avisa.

---

## 15. Disparar o envio

1. No menu lateral, clique em **Sending**.
2. Você vai ver um resumo: quantos contatos vão receber, qual o canal, qual o
   sender, e o custo estimado.
3. Em **Choose Sending Method**, deixe selecionado **Send Now** (envio
   imediato). Se quiser agendar, escolha **Schedule**.
4. Clique no botão verde **Send Now**.
5. Uma confirmação pode aparecer pedindo para você confirmar — clique em
   **OK** se estiver tudo certo.

### Se aparecer alerta de duplicados

Se a sua lista tinha contatos repetidos, vai aparecer uma janela perguntando
se você quer enviar mesmo assim (com deduplicação) ou cancelar. O recomendado
é clicar em **OK** para deduplicar — cada destinatário recebe a mensagem uma
única vez.

---

## 16. Acompanhar o envio

Durante o envio, a tela mostra:

- Uma **barra de progresso verde** indicando o percentual concluído.
- **Sent** (enviados) e **Failed** (falharam) em tempo real.
- Um botão **Cancel send** se você quiser parar antes do fim.

O envio acontece a 100 mensagens por segundo (padrão para RCS), então:

- 1.000 contatos → ~10 segundos
- 10.000 contatos → ~2 minutos
- 100.000 contatos → ~17 minutos
- 500.000 contatos → ~85 minutos

Quando terminar, aparece um resumo final com totais.

---

## 17. Acompanhar entregas no Console Twilio

A barra de progresso mostra o **submetido à Twilio**, não a **entrega final
ao celular**. Para ver entregas reais:

1. Abra **https://console.twilio.com**
2. No menu, clique em **Monitor** → **Logs** → **Messaging**.
3. Você vai ver cada mensagem com o status final (delivered, failed, etc).

---

## 18. Parar o projeto quando terminar

Quando não precisar mais do projeto:

1. Volte para a janela do **Terminal** (a que mostrou "ready" no início).
2. Aperte **Control + C** (segura a tecla Control e aperta a letra C).
3. O Terminal volta a esperar comando.
4. Pode fechar a janela do Terminal.

A próxima vez que quiser usar o projeto, basta abrir o Terminal, ir até a
pasta (passo 6) e rodar `npm start` (passo 8) — não precisa rodar o
`npm install` de novo.

---

## Problemas comuns

### "command not found: npm"

Isso significa que o Node.js não está instalado. Volte ao passo 2.

### "EADDRINUSE: address already in use 3001"

Já tem outra instância do projeto rodando, ou outro programa usando a porta
3001. Feche o outro Terminal que possa estar rodando o projeto e tente de
novo, ou reinicie o Mac.

### A página `localhost:3001` não abre

Confira se o Terminal mostrou a mensagem `✔ Bulk RCS/SMS/WhatsApp Sender
ready`. Se sim, espere 5 segundos e atualize a página.

### Mensagens estão falhando com erro 401

Suas credenciais da Twilio estão incorretas. Volte em **Settings** e verifique
Account SID e Auth Token. Atenção: copia/cola direto do Console Twilio (não
deixe espaços no começo ou fim).

### Envio ficou parado em "Cancelling..."

Aguarde até 30 segundos — o sistema termina o lote em andamento antes de
parar. Se passar muito tempo, atualize a página.

### Como atualizar para uma versão nova

Quando o projeto for atualizado:

1. Pare o projeto (Control + C no Terminal).
2. Baixe o ZIP novo do GitHub (passo 3).
3. Apague a pasta antiga.
4. Descompacte a nova (passo 4).
5. Repita os passos a partir do 6.

---

## Suporte

Se algo der errado e não estiver na lista de problemas comuns, anote:

- O passo em que travou.
- A mensagem de erro exata (tire um print se possível).
- O comando que você digitou (se foi no Terminal).

E peça ajuda à pessoa que te passou o projeto. Quanto mais detalhes você der,
mais rápido a ajuda chega.
