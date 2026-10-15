# Lareia: Write & Reflect

*[English below](#english)*

O plugin do Obsidian que traz o seu diário do app Lareia para o vault: o texto de cada dia na sua nota diária, as imagens e os anexos, os mapas mentais e os cadernos. Roda no Obsidian do Mac, do Windows, do Linux, do iPad e do iPhone. A interface fala português ou inglês, conforme a língua do Obsidian.

## O que ele faz

- **Os dias.** O texto do dia entra na sua daily, logo abaixo de um cabeçalho (padrão `## Lareia`), entre dois comentários invisíveis no modo de leitura:

  ```markdown
  ## Lareia

  <!-- codex:2026-10-15 -->
  O que você escreveu na Lareia hoje.
  <!-- /codex -->
  ```

  O cabeçalho é ajuste; os marcadores `codex:` são o contrato com o vault e não mudam.

  O que você escrever fora desse par é seu, e o plugin não toca. Se você editar *dentro* dele, o plugin para naquele dia e o app Lareia mostra um ⚠ com as duas versões, para você escolher. Falta a nota? Ele a cria pelo modelo do Daily Notes (pode desligar). Falta o cabeçalho? Ele o acrescenta ao fim (pode desligar). Ou escolha **um arquivo por dia** numa pasta própria.
- **A mídia.** Imagens e anexos descem para a pasta de anexos do Obsidian (ou a que você escolher) e aparecem como `![[…]]` e `[[…]]`.
- **Os mapas.** Cada mapa da Lareia pousa como `.excalidraw.md`. **Para vê-lo desenhado, instale o plugin [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin)**; sem ele, o arquivo abre como texto. Edite o mapa no app Lareia: editado no Obsidian, o plugin para de atualizá-lo e o marca `codex-divergente`.
- **Os cadernos.** Cada caderno vira uma pasta com um arquivo por fólio e um `index.md`, **só dentro das pastas que você permitir** nos ajustes. Pasta com notas que não são da Lareia não é adotada; fólio apagado na Lareia vai para `.lixeira/` dentro do caderno — nada é apagado.
- **O índice de títulos** (desligado por padrão). Ligado, o `[[` do editor da Lareia oferece as notas do seu vault. Isso **manda ao servidor da Lareia o nome e o caminho de todas as suas notas** (menos as pastas que você excluir e a pasta de configuração do vault).

O plugin só puxa: ao abrir o vault, a cada 10 minutos com ele aberto, e pelo comando **Sincronizar agora**. Com o Obsidian fechado, nada pousa — o texto espera no servidor.

## Rede e conta

O plugin **usa a rede**: fala só com a API da Lareia (`execute-api.sa-east-1.amazonaws.com`), para buscar os dias e os cadernos e confirmar o que escreveu, e com os links assinados de download da mídia. **Exige uma conta Lareia.** Não chama IA, não tem telemetria e é grátis.

## Como ligar

1. No app Lareia: **Conta → Aparelhos → «Ligar ao Obsidian»**. Aparece um código de 8 caracteres, válido por 10 minutos e uma vez só.
2. No Obsidian: comando **Ligar este vault (código de pareamento)**, ou o botão nos ajustes do plugin, e digite o código. Também funciona o link `obsidian://lareia-write-reflect?codigo=ABCD-EFGH`.
3. A primeira rodada é sempre um **ensaio**: o plugin mostra o que escreveria e só grava quando você clica **Aplicar**.

Uma conta liga um vault por vez. Ligar outro desliga o anterior. Nos outros aparelhos do mesmo vault, o plugin mostra «quem escreve neste vault é o Mac», e os arquivos chegam pela sincronização do próprio vault; «passar a escrever aqui» refaz o pareamento.

Para desligar: comando **Desligar este aparelho**, ou revogue em Conta → Aparelhos no app Lareia — na rodada seguinte o plugin para e avisa «este aparelho foi desligado».

## Onde guarda o quê

| O quê | Onde | Sincroniza com o vault? |
|---|---|---|
| A chave do aparelho | **SecretStorage do Obsidian**, sob `lareia-{id do vault}` | não |
| Os ajustes (pastas, cabeçalho, quem escreve…) | `data.json` na pasta do plugin | sim — e **nunca** com a chave nem o código |
| Cópia de cada nota antes de o plugin tocar nela | `copias/` na pasta do plugin, 7 dias | conforme o seu vault |
| O ensaio pendente e o último índice enviado | o armazenamento local do Obsidian, deste aparelho | não |

O plugin só escreve nas pastas dos ajustes (a da daily ou a dos dias, a da mídia, as dos cadernos e a da nota de registro) e nunca apaga arquivo.

## Comandos

- **Sincronizar agora**
- **Ensaiar (mostra o que mudaria, sem gravar)**
- **Ligar este vault (código de pareamento)**
- **Desligar este aparelho**

## Para quem desenvolve

```sh
npm ci
npm run build   # tsc + esbuild → main.js
```

O núcleo (`src/nucleo/`) é TypeScript puro, sem Obsidian e sem Node: decide o que escrever e devolve texto. A casca (`src/casca/`) liga o núcleo ao vault e à API sem importar o `obsidian`; `src/obsidian/` são os adaptadores e as telas.

A Lareia não é afiliada ao Obsidian.

---

## English

The Obsidian plugin that brings your Lareia journal into your vault: each day's entry in your daily note, its images and attachments, mind maps and notebooks. Works on desktop (macOS, Windows, Linux) and mobile (iPad, iPhone). The interface speaks English or Portuguese, following Obsidian's language.

### What it does

- **Days.** The day's text goes into your daily note, right under a heading of your choice (default `## Lareia`), between two HTML comments that are invisible in reading view:

  ```markdown
  ## Lareia

  <!-- codex:2026-10-15 -->
  What you wrote in Lareia today.
  <!-- /codex -->
  ```

  The heading is a setting; the `codex:` markers are the contract with the vault and don't change.

  Anything you write outside that pair is yours and is never touched. If you edit *inside* it, the plugin stops for that day and the Lareia app shows a ⚠ with both versions so you can choose. It can create the missing note from your Daily Notes template and append the missing heading (both optional), or write **one file per day** in a folder of its own.
- **Media.** Images and attachments are downloaded to Obsidian's attachment folder (or one you pick) and embedded as `![[…]]` / `[[…]]`.
- **Mind maps** land as `.excalidraw.md`. **Install the [Excalidraw plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin) to see them drawn**; without it they open as text. Edit maps in the Lareia app: once edited in Obsidian, the plugin stops updating that file and marks it `codex-divergente`.
- **Notebooks** become a folder with one file per page and an `index.md`, **only inside folders you allow**. Folders holding notes Lareia didn't write are never adopted; deleted pages move to `.lixeira/` inside the notebook — nothing is ever deleted.
- **Title index** (off by default). When on, the Lareia editor's `[[` autocomplete offers your vault's notes. This **sends the name and path of every note to Lareia's server** (except the folders you exclude and the vault's configuration folder).

It only pulls: when the vault opens, every 10 minutes while it's open, and on **Sync now**. With Obsidian closed, nothing lands — the text waits on the server.

### Network and account

This plugin **uses the network**: it talks only to Lareia's API (`execute-api.sa-east-1.amazonaws.com`), to fetch your days and notebooks and confirm what it wrote, and to signed media download links. **A Lareia account is required.** No AI calls, no telemetry; free.

### Pairing

1. In the Lareia app, go to **Conta → Aparelhos → «Ligar ao Obsidian»** to get an 8-character code (valid for 10 minutes, single use).
2. In Obsidian, run **Link this vault (pairing code)** or use the button in the plugin settings, and type it — or open `obsidian://lareia-write-reflect?codigo=ABCD-EFGH`.
3. The first sync after pairing is always a **dry run**: nothing is written until you click **Apply**.

One account links one vault at a time; linking another unlinks the previous one. On the vault's other devices the plugin shows which device is writing, and files arrive through your own vault sync; «Write from here» pairs again.

To unlink: run **Unlink this device**, or revoke it in Conta → Aparelhos in the Lareia app — on the next sync the plugin stops and says the device was unlinked.

### What is stored where

| What | Where | Syncs with the vault? |
|---|---|---|
| The device key | **Obsidian's SecretStorage**, under `lareia-{vault id}` | no |
| Settings (folders, heading, who writes…) | `data.json` in the plugin folder | yes — and **never** with the key or the code |
| A copy of each note before the plugin touches it | `copias/` in the plugin folder, 7 days | as your vault does |
| The pending dry run and the last index sent | Obsidian's local storage, on this device | no |

The plugin writes only to the folders in its settings (the daily note or days folder, the media folder, the notebook folders and the log note folder) and never deletes files.

### Commands

- **Sync now**
- **Dry run (show what would change, without writing)**
- **Link this vault (pairing code)**
- **Unlink this device**

### Development

```sh
npm ci
npm run build   # tsc + esbuild → main.js
```

The core (`src/nucleo/`) is plain TypeScript, with no Obsidian and no Node: it decides what to write and returns text. The shell (`src/casca/`) connects the core to the vault and the API without importing `obsidian`; `src/obsidian/` holds the adapters and the screens.

Lareia is not affiliated with Obsidian.
