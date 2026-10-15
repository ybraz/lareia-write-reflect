/**
 * O que o plugin diz à pessoa, em português e em inglês (spec 30 §4.4).
 *
 * A língua é a do Obsidian (`getLanguage()`): `pt` e `pt-BR` falam português,
 * e qualquer outra fala inglês — o inglês é o padrão da loja, e o kit e a
 * página fazem a mesma escolha para es, fr e it. O `main.ts` a define ao
 * carregar; fora do Obsidian (a suíte, `scripts/fora-do-obsidian.ts`) vale o
 * português, que é a língua em que o plugin nasceu.
 *
 * O que é RELATÓRIO segue a língua: os avisos, as telas, os comandos, as
 * mensagens de erro e a nota de registro. O que é CONTRATO com o vault não
 * muda com ela: o bloco, o cabeçalho escolhido, os fólios, o `index.md` do
 * caderno, os mapas. Um vault sincronizado entre um Mac em português e um
 * iPad em inglês tem de receber os mesmos bytes, e o corpus prova esses bytes
 * contra o agente.
 *
 * As telas seguem o padrão de maiúsculas da loja (só a primeira palavra e os
 * nomes próprios); os rótulos do app Lareia vão como o app os mostra
 * («Conta → Aparelhos → «Ligar ao Obsidian»»), que é o que a pessoa vai procurar.
 */

export type Lingua = "pt" | "en";

/** A língua do plugin para um código de língua do Obsidian. */
export function linguaDe(codigo: string | null | undefined): Lingua {
  return /^pt(?:[-_]|$)/i.test(codigo ?? "") ? "pt" : "en";
}

const pt = {
  // ── Os comandos ───────────────────────────────────────────────────────
  cmdSincronizar: "Sincronizar agora",
  cmdEnsaiar: "Ensaiar (mostra o que mudaria, sem gravar)",
  cmdLigar: "Ligar este vault (código de pareamento)",
  cmdDesligar: "Desligar este aparelho",
  confirmarDesligar: "Desligar este aparelho? A Lareia deixa de escrever neste vault até um novo pareamento. O que já está no vault fica.",
  botaoDesligar: "Desligar",

  // ── As telas ──────────────────────────────────────────────────────────
  pareamentoTitulo: "Ligar este vault à Lareia",
  pareamentoTexto: "No app Lareia, abra Conta → Aparelhos → «Ligar ao Obsidian» e digite aqui o código de 8 caracteres. Ele vale 10 minutos e uma vez só.",
  pareamentoCampo: "Código",
  // A forma do código (8 caracteres em maiúsculas), não uma frase: o padrão de maiúsculas não vale aqui.
  pareamentoExemplo: "ABCD-EFGH",
  pareamentoBotao: "Ligar",
  ensaioPrimeiroTitulo: "A primeira rodada é um ensaio",
  ensaioTitulo: "Ensaio — o que a rodada faria",
  ensaioNadaGravado: "Nada foi gravado ainda. Confira o que o plugin escreveria neste vault e aplique.",
  ensaioNadaAMudar: "Nada a mudar no vault.",
  mudanca: (tipo: "criar" | "editar" | "mover" | "binario" | "pasta" | "baixaria", caminho: string, para?: string) =>
    tipo === "mover" ? `mover ${caminho} → ${para}` : `${tipo} ${caminho}`,
  ensaioTitulosSubiriam: "O índice de títulos subiria à Lareia (o ajuste está ligado).",
  ensaioAvisos: "Avisos",
  aplicar: "Aplicar",
  agoraNao: "Agora não",
  fechar: "Fechar",
  cancelar: "Cancelar",

  // ── A aba de ajustes ──────────────────────────────────────────────────
  secLigacao: "Ligação",
  ligadoNome: (escritor: string | null) => `Este aparelho escreve neste vault${escritor ? ` (${escritor})` : ""}`,
  ligadoDesc: (segredo: string) => `A chave mora no SecretStorage do Obsidian, sob o nome «${segredo}», e não sincroniza com o vault.`,
  botaoSincronizar: "Sincronizar agora",
  botaoEnsaiar: "Ensaiar",
  botaoDesligarAparelho: "Desligar este aparelho",
  outroNome: (nome: string) => `Quem escreve neste vault é ${nome}`,
  outroDesc: "Os arquivos chegam aqui pela sincronização do vault. Passar a escrever daqui desliga o outro aparelho.",
  botaoPassar: "Passar a escrever aqui",
  semLigacaoNome: "Este vault não está ligado",
  semLigacaoDesc: "No app Lareia: Conta → Aparelhos → «Ligar ao Obsidian». Usa a rede (a API da Lareia) e pede uma conta Lareia.",
  botaoLigarComCodigo: "Ligar com o código",
  secDias: "Os dias",
  ondeNome: "Onde escrever",
  ondeDesc: "Na daily do Obsidian, sob um cabeçalho; ou um arquivo por dia numa pasta própria.",
  ondeDaily: "Na daily do Obsidian",
  ondeArquivo: "Um arquivo por dia",
  pastaDailyNome: "Pasta da daily",
  pastaDailyDesc: "Vazio: a do plugin nativo Daily Notes.",
  formatoNome: "Formato da data",
  formatoDesc: "Vazio: o do Daily Notes (ou YYYY-MM-DD). Sintaxe do moment.js.",
  cabecalhoNome: "Cabeçalho",
  cabecalhoDesc: "O bloco da Lareia entra logo abaixo dele.",
  criarNotaNome: "Criar a nota que falta",
  criarNotaDesc: "Pelo modelo da daily. Desligado: o dia espera a nota existir.",
  acrescentarNome: "Acrescentar o cabeçalho que falta",
  acrescentarDesc: "Ao fim da nota.",
  pastaDiasNome: "Pasta dos dias",
  pastaDiasDesc: "Um arquivo por dia: {pasta}/2026-10-15.md.",
  pastaMidiaNome: "Pasta da mídia",
  pastaMidiaDesc: "Imagens, anexos e mapas. Vazio: a pasta de anexos do Obsidian. Os mapas abrem desenhados com o plugin Excalidraw.",
  secCadernos: "Os cadernos",
  pastasCadernosNome: "Pastas dos cadernos",
  pastasCadernosDesc: "Uma por linha. O caderno só pousa numa pasta própria dentro de uma destas; fora delas, é recusado e o app Lareia diz por quê. Vazio: os cadernos não vêm ao vault.",
  secTitulos: "O índice de títulos",
  titulosNome: "Mandar os títulos das notas à Lareia",
  titulosDesc: "Para o [[ do editor da Lareia oferecer as notas do vault. Manda ao servidor o nome e o caminho de TODAS as notas (menos as pastas abaixo).",
  semTitulosNome: "Pastas sem títulos",
  semTitulosDesc: "Por nome, em qualquer profundidade. A pasta de configuração do vault fica sempre de fora.",
  secMais: "Mais",
  registroNome: "Nota de registro",
  registroDesc: "Uma pasta: o plugin anota em {pasta}/AAAA-MM.md o que escreveu. Vazio: sem registro.",
  intervaloNome: "Intervalo (minutos)",
  intervaloDesc: "Com o Obsidian aberto, de quanto em quanto tempo.",
  apiNome: "Endereço da API",
  apiDesc: "Só mude se a Lareia pedir.",

  // ── Os avisos do controle ─────────────────────────────────────────────
  avisoDesligado: "Lareia: este aparelho foi desligado. Para voltar a receber o diário, pareie de novo em Conta → Aparelhos → «Ligar ao Obsidian».",
  codigoTorto: "Lareia: o código tem 8 letras e números (por exemplo ABCD-EFGH). Confira e tente de novo.",
  codigoSemForma: "Lareia: o código não tem a forma certa. Gere outro em Conta → Aparelhos → «Ligar ao Obsidian».",
  codigoRecusado: "Lareia: o código foi recusado — ele vale 10 minutos e uma vez só. Gere outro em Conta → Aparelhos.",
  semFalarComALareia: (erro: string) => `Lareia: não consegui falar com a Lareia (${erro}). Tente de novo.`,
  passouAEscrever: (aparelho: string) => `Lareia: ${aparelho} passou a escrever neste vault. A primeira rodada é um ensaio.`,
  linkSemCodigo: "Lareia: o link não traz o código de pareamento.",
  outroEscreve: (nome: string) => `Lareia: quem escreve neste vault é ${nome}. Para escrever daqui, use «passar a escrever aqui» nos ajustes.`,
  naoLigado: "Lareia: este vault ainda não está ligado. Pareie em Conta → Aparelhos → «Ligar ao Obsidian».",
  alerta: (aviso: string) => `Lareia: ${aviso}`,
  semConexao: (erro: string) => `Lareia: sem conexão com a Lareia agora (${erro}). A próxima rodada tenta de novo.`,
  aparelhoNaoLigado: "Lareia: este aparelho não está ligado.",
  naoDesligou: (erro: string) => `Lareia: não consegui desligar agora (${erro}). Nada mudou; tente de novo, ou revogue em Conta → Aparelhos.`,
  desligou: "Lareia: este aparelho foi desligado. O que já está no vault fica.",

  // ── Os aparelhos (em «quem escreve neste vault é o Mac») ──────────────
  oIphone: "o iPhone",
  oIpad: "o iPad",
  oAndroid: "o Android",
  oTabletAndroid: "o tablet Android",
  oMac: "o Mac",
  oWindows: "o Windows",
  oLinux: "o Linux",
  esteAparelho: "este aparelho",

  // ── Os avisos da rodada ───────────────────────────────────────────────
  falhaDosDias: (erro: string) => `dias: ${erro}`,
  falhaDosCadernos: (erro: string) => `cadernos: ${erro}`,
  falhaDosTitulos: (erro: string) => `títulos: ${erro}`,
  notaNaoExiste: (data: string, caminho: string) => `${data}: a nota do dia não existe (${caminho}) — segurando`,
  midiaFaltou: (data: string, erro: string) => `${data}: a mídia faltou — ${erro} — segurando o dia`,
  segurando: (data: string, motivo: string) => `${data}: ${motivo} — segurando`,
  surpresa: (data: string, motivo: string) => `${data}: SURPRESA — ${motivo}`,
  divergente: (data: string) => `${data}: DIVERGENTE — o bloco no arquivo não é o que o app deixou`,
  naoMarcouDivergencia: (data: string, erro: string) => `${data}: não consegui marcar a divergência na API (${erro})`,
  arquivoMudou: (data: string) => `${data}: o arquivo mudou durante a rodada — fica para a próxima`,
  ackFalhou: (data: string, erro: string) => `${data}: o ack falhou (${erro}) — reconfirma na próxima`,
  pastasNaoSubiram: (erro: string) => `cadernos: não consegui enviar as pastas (${erro})`,
  cadernoRecusado: (nome: string, erro: string) => `${nome}: RECUSADO — ${erro}`,
  cadernoSurpresa: (nome: string, erro: string) => `${nome}: SURPRESA no index.md — ${erro}`,
  cadernoErro: (nome: string, erro: string) => `${nome}: erro no vault — ${erro}`,
  cadernoAckFalhou: (nome: string, erro: string) => `${nome}: escrito, mas o ack falhou (${erro}) — reconfirma na próxima`,
  mapaDivergente: (nome: string, versao: number) => `${nome}: DIVERGENTE — editado no Obsidian; a v${versao} ficou na nuvem (marcado \`codex-divergente\`)`,

  // ── A nota de registro ────────────────────────────────────────────────
  logMapaDivergente: (data: string, aviso: string) => `- \`${data}\` — **mapa divergente**: ${aviso}`,
  logMidiaFaltou: (data: string, erro: string) => `- \`${data}\` — **mídia faltou**: ${erro}`,
  logSurpresa: (data: string, motivo: string) => `- \`${data}\` — **surpresa**: ${motivo}`,
  logDivergente: (data: string) => `- \`${data}\` — **divergente**: o bloco foi editado à mão. Resolver no app, em «manter o do vault» ou «manter o do app».`,
  logDia: (data: string, palavras: number, versao: number) => `- \`${data}\` — ${palavras} palavras, versão ${versao}`,
  logRecusado: (nome: string, erro: string) => `- \`${nome}\` — **recusado**: ${erro}`,
  logSurpresaNoIndex: (nome: string, erro: string) => `- \`${nome}\` — **surpresa** no \`index.md\`: ${erro}`,
  logErroNoVault: (nome: string, erro: string) => `- \`${nome}\` — **erro no vault**: ${erro}`,
  logCadernoRemovido: (nome: string) => `- \`${nome}\` — **removido**: a pasta foi para a lixeira`,
  logCadernoMovido: (nome: string, destino: string) => `- \`${nome}\` — pasta movida para \`${destino}\``,
  logFolioMapaDivergente: (nome: string, aviso: string) => `- \`${nome}\` — **mapa divergente**: ${aviso}`,
  logFolioMidiaFaltou: (nome: string, titulo: string, erro: string) => `- \`${nome}\` — **mídia faltou** em «${titulo}»: ${erro}`,
  logFolioDivergente: (nome: string, titulo: string) => `- \`${nome}\` — **divergente** em «${titulo}»: o corpo foi editado à mão. Resolver no app.`,
  logFolio: (nome: string, titulo: string, palavras: number, versao: number) => `- \`${nome}\` — «${titulo}», ${palavras} palavras, versão ${versao}`,
  logFolioNaLixeira: (nome: string, arquivo: string) => `- \`${nome}\` — «${arquivo}» foi para a lixeira`,
  cabecalhoDoRegistro: `---
title: "Lareia — registro do plugin"
tags: [codex, log]
description: "O que o plugin Lareia Write and Reflect escreveu no vault: uma linha por dia aplicado, deduplicada por data e versão, com as divergências e as surpresas em destaque. Rodada sem efeito não escreve nada."
---

# Lareia — registro do plugin

> [!info] Gerado pelo plugin «Lareia Write and Reflect». Não editar à mão.
`,

  // ── Os motivos do núcleo (surpresas, recusas, falhas) ─────────────────
  blocosDoMesmoDia: (n: number, data: string) => `há ${n} blocos do dia ${data} no mesmo arquivo`,
  marcadoresSemPar: "marcadores de abertura e fechamento não estão em pares",
  blocoNaoFecha: (data: string) => `o bloco do dia ${data} abre e não fecha`,
  fechamentoAntes: "há um marcador de fechamento antes de qualquer abertura",
  textoComMarcador: "o texto do dia contém um marcador da Lareia",
  cabecalhoRepetido: (cabecalho: string, n: number) => `o cabeçalho «${cabecalho}» aparece ${n} vezes`,
  cabecalhoAusente: (cabecalho: string) => `o cabeçalho «${cabecalho}» não existe neste arquivo`,
  cabecalhoAcrescentadoSumiu: "o cabeçalho acrescentado não se acha",
  nenhumaPasta: "(nenhuma — escolha nos ajustes do plugin)",
  destinoVazio: (aceitas: string) => `destino vazio. As pastas permitidas são: ${aceitas}`,
  destinoAbsoluto: (pedido: string, aceitas: string) => `\`${pedido}\` é um caminho absoluto. O destino é relativo à raiz do vault, dentro de: ${aceitas}`,
  destinoSobe: (pedido: string, aceitas: string) => `\`${pedido}\` sobe de diretório. As pastas permitidas são: ${aceitas}`,
  destinoFora: (pedido: string, aceitas: string) => `\`${pedido}\` está fora das pastas permitidas. O destino tem de começar por uma destas: ${aceitas}`,
  destinoNaRaiz: (pedido: string, exemplo: string, aceitas: string) =>
    `\`${pedido}\` é a raiz de uma pasta permitida. O caderno precisa de uma pasta própria dentro dela — por exemplo \`${exemplo}\`. As pastas permitidas são: ${aceitas}`,
  exemploDeCaderno: "Meu caderno",
  pastaOcupada: (destino: string) => `\`${destino}\` já existe com arquivos que não escrevi`,
  pastaOcupadaMd: (destino: string) => `\`${destino}\` já existe com arquivos \`.md\` que não escrevi`,
  indexSemFecho: "o `index.md` tem o marcador de abertura sem o de fechamento; não escrevo para não engolir o resto do arquivo",
  indexSemAbertura: "o `index.md` tem o marcador de fechamento sem o de abertura",
  indexForaDeOrdem: "os marcadores do `index.md` estão fora de ordem",
  arquivoNaoEDoMapa: (nome: string, id: string) => `${nome}: o arquivo existe e não é do mapa ${id}`,
  midiaVazia: (nome: string) => `${nome}: veio vazia`,
  cenaNaoUtf8: (erro: string) => `a cena não é UTF-8: ${erro}`,
  cenaNaoJson: (erro: string) => `a cena não é JSON: ${erro}`,
  cenaSemForma: "a cena não tem a forma do Excalidraw (type/elements)",
  foraDasPastas: (caminho: string, aceitas: string) => `fora das pastas dos ajustes: ${caminho} (aceitas: ${aceitas})`,
  raiz: "(raiz)",
  jaExiste: (caminho: string) => `já existe: ${caminho}`,
  naoExiste: (caminho: string) => `não existe: ${caminho}`,
  destinoExiste: (caminho: string) => `destino existe: ${caminho}`,
};

type Textos = typeof pt;

const en: Textos = {
  cmdSincronizar: "Sync now",
  cmdEnsaiar: "Dry run (show what would change, without writing)",
  cmdLigar: "Link this vault (pairing code)",
  cmdDesligar: "Unlink this device",
  confirmarDesligar: "Unlink this device? Lareia stops writing to this vault until you pair again. What is already in the vault stays.",
  botaoDesligar: "Unlink",

  pareamentoTitulo: "Link this vault to Lareia",
  pareamentoTexto: "In the Lareia app, open Conta → Aparelhos → «Ligar ao Obsidian» and type the 8-character code here. It is valid for 10 minutes, once.",
  pareamentoCampo: "Code",
  pareamentoExemplo: "ABCD-EFGH",
  pareamentoBotao: "Link",
  ensaioPrimeiroTitulo: "The first sync is a dry run",
  ensaioTitulo: "Dry run — what the sync would do",
  ensaioNadaGravado: "Nothing has been written yet. Check what the plugin would write to this vault, then apply.",
  ensaioNadaAMudar: "Nothing to change in the vault.",
  mudanca: (tipo, caminho, para) => {
    const verbo = { criar: "create", editar: "edit", mover: "move", binario: "write", pasta: "folder", baixaria: "would download" }[tipo];
    return tipo === "mover" ? `${verbo} ${caminho} → ${para}` : `${verbo} ${caminho}`;
  },
  ensaioTitulosSubiriam: "The title index would be sent to Lareia (the setting is on).",
  ensaioAvisos: "Warnings",
  aplicar: "Apply",
  agoraNao: "Not now",
  fechar: "Close",
  cancelar: "Cancel",

  secLigacao: "Link",
  ligadoNome: (escritor) => `This device writes to this vault${escritor ? ` (${escritor})` : ""}`,
  ligadoDesc: (segredo) => `The key lives in Obsidian's SecretStorage, under the name «${segredo}», and does not sync with the vault.`,
  botaoSincronizar: "Sync now",
  botaoEnsaiar: "Dry run",
  botaoDesligarAparelho: "Unlink this device",
  outroNome: (nome) => `This vault is written by ${nome}`,
  outroDesc: "Files arrive here through your vault sync. Writing from here unlinks the other device.",
  botaoPassar: "Write from here",
  semLigacaoNome: "This vault is not linked",
  semLigacaoDesc: "In the Lareia app: Conta → Aparelhos → «Ligar ao Obsidian». Uses the network (Lareia's API) and requires a Lareia account.",
  botaoLigarComCodigo: "Link with a code",
  secDias: "Days",
  ondeNome: "Where to write",
  ondeDesc: "In the Obsidian daily note, under a heading; or one file per day in a folder of its own.",
  ondeDaily: "In the daily note",
  ondeArquivo: "One file per day",
  pastaDailyNome: "Daily note folder",
  pastaDailyDesc: "Empty: the one from the core Daily Notes plugin.",
  formatoNome: "Date format",
  formatoDesc: "Empty: the Daily Notes one (or YYYY-MM-DD). Moment.js syntax.",
  cabecalhoNome: "Heading",
  cabecalhoDesc: "The Lareia block goes right below it.",
  criarNotaNome: "Create the missing note",
  criarNotaDesc: "From the daily note template. Off: the day waits until the note exists.",
  acrescentarNome: "Append the missing heading",
  acrescentarDesc: "At the end of the note.",
  pastaDiasNome: "Days folder",
  pastaDiasDesc: "One file per day: {folder}/2026-10-15.md.",
  pastaMidiaNome: "Media folder",
  pastaMidiaDesc: "Images, attachments and mind maps. Empty: Obsidian's attachment folder. Mind maps open drawn with the Excalidraw plugin.",
  secCadernos: "Notebooks",
  pastasCadernosNome: "Notebook folders",
  pastasCadernosDesc: "One per line. A notebook only lands in a folder of its own inside one of these; outside them it is refused, and the Lareia app says why. Empty: notebooks don't come to the vault.",
  secTitulos: "Title index",
  titulosNome: "Send note titles to Lareia",
  titulosDesc: "So the [[ in the Lareia editor can suggest your vault's notes. Sends the name and path of ALL notes to the server (except the folders below).",
  semTitulosNome: "Folders without titles",
  semTitulosDesc: "By name, at any depth. The vault's configuration folder is always left out.",
  secMais: "Advanced",
  registroNome: "Log note",
  registroDesc: "A folder: the plugin logs what it wrote in {folder}/YYYY-MM.md. Empty: no log.",
  intervaloNome: "Interval (minutes)",
  intervaloDesc: "How often to sync while Obsidian is open.",
  apiNome: "API address",
  apiDesc: "Only change it if Lareia asks you to.",

  avisoDesligado: "Lareia: this device was unlinked. To receive your journal again, pair again in Conta → Aparelhos → «Ligar ao Obsidian».",
  codigoTorto: "Lareia: the code has 8 letters and numbers (for example ABCD-EFGH). Check it and try again.",
  codigoSemForma: "Lareia: the code doesn't have the right shape. Generate another in Conta → Aparelhos → «Ligar ao Obsidian».",
  codigoRecusado: "Lareia: the code was refused — it is valid for 10 minutes, once. Generate another in Conta → Aparelhos.",
  semFalarComALareia: (erro) => `Lareia: couldn't reach Lareia (${erro}). Try again.`,
  passouAEscrever: (aparelho) => `Lareia: this vault is now written by ${aparelho}. The first sync is a dry run.`,
  linkSemCodigo: "Lareia: the link doesn't carry a pairing code.",
  outroEscreve: (nome) => `Lareia: this vault is written by ${nome}. To write from here, use «write from here» in the settings.`,
  naoLigado: "Lareia: this vault isn't linked yet. Pair it in Conta → Aparelhos → «Ligar ao Obsidian».",
  alerta: (aviso) => `Lareia: ${aviso}`,
  semConexao: (erro) => `Lareia: no connection to Lareia right now (${erro}). The next sync will try again.`,
  aparelhoNaoLigado: "Lareia: this device isn't linked.",
  naoDesligou: (erro) => `Lareia: couldn't unlink right now (${erro}). Nothing changed; try again, or revoke it in Conta → Aparelhos.`,
  desligou: "Lareia: this device was unlinked. What is already in the vault stays.",

  oIphone: "the iPhone",
  oIpad: "the iPad",
  oAndroid: "the Android phone",
  oTabletAndroid: "the Android tablet",
  oMac: "the Mac",
  oWindows: "the Windows computer",
  oLinux: "the Linux computer",
  esteAparelho: "this device",

  falhaDosDias: (erro) => `days: ${erro}`,
  falhaDosCadernos: (erro) => `notebooks: ${erro}`,
  falhaDosTitulos: (erro) => `titles: ${erro}`,
  notaNaoExiste: (data, caminho) => `${data}: the daily note doesn't exist (${caminho}) — holding`,
  midiaFaltou: (data, erro) => `${data}: media missing — ${erro} — holding the day`,
  segurando: (data, motivo) => `${data}: ${motivo} — holding`,
  surpresa: (data, motivo) => `${data}: SURPRISE — ${motivo}`,
  divergente: (data) => `${data}: DIVERGED — the block in the file is not what the app left`,
  naoMarcouDivergencia: (data, erro) => `${data}: couldn't mark the divergence in the API (${erro})`,
  arquivoMudou: (data) => `${data}: the file changed during the sync — left for the next one`,
  ackFalhou: (data, erro) => `${data}: the ack failed (${erro}) — confirms again next time`,
  pastasNaoSubiram: (erro) => `notebooks: couldn't send the folders (${erro})`,
  cadernoRecusado: (nome, erro) => `${nome}: REFUSED — ${erro}`,
  cadernoSurpresa: (nome, erro) => `${nome}: SURPRISE in index.md — ${erro}`,
  cadernoErro: (nome, erro) => `${nome}: vault error — ${erro}`,
  cadernoAckFalhou: (nome, erro) => `${nome}: written, but the ack failed (${erro}) — confirms again next time`,
  mapaDivergente: (nome, versao) => `${nome}: DIVERGED — edited in Obsidian; v${versao} stayed in the cloud (marked \`codex-divergente\`)`,

  logMapaDivergente: (data, aviso) => `- \`${data}\` — **mind map diverged**: ${aviso}`,
  logMidiaFaltou: (data, erro) => `- \`${data}\` — **media missing**: ${erro}`,
  logSurpresa: (data, motivo) => `- \`${data}\` — **surprise**: ${motivo}`,
  logDivergente: (data) => `- \`${data}\` — **diverged**: the block was edited by hand. Resolve it in the app, with «manter o do vault» or «manter o do app».`,
  logDia: (data, palavras, versao) => `- \`${data}\` — ${palavras} words, version ${versao}`,
  logRecusado: (nome, erro) => `- \`${nome}\` — **refused**: ${erro}`,
  logSurpresaNoIndex: (nome, erro) => `- \`${nome}\` — **surprise** in \`index.md\`: ${erro}`,
  logErroNoVault: (nome, erro) => `- \`${nome}\` — **vault error**: ${erro}`,
  logCadernoRemovido: (nome) => `- \`${nome}\` — **removed**: the folder went to the trash`,
  logCadernoMovido: (nome, destino) => `- \`${nome}\` — folder moved to \`${destino}\``,
  logFolioMapaDivergente: (nome, aviso) => `- \`${nome}\` — **mind map diverged**: ${aviso}`,
  logFolioMidiaFaltou: (nome, titulo, erro) => `- \`${nome}\` — **media missing** in «${titulo}»: ${erro}`,
  logFolioDivergente: (nome, titulo) => `- \`${nome}\` — **diverged** in «${titulo}»: the body was edited by hand. Resolve it in the app.`,
  logFolio: (nome, titulo, palavras, versao) => `- \`${nome}\` — «${titulo}», ${palavras} words, version ${versao}`,
  logFolioNaLixeira: (nome, arquivo) => `- \`${nome}\` — «${arquivo}» went to the trash`,
  cabecalhoDoRegistro: `---
title: "Lareia — plugin log"
tags: [codex, log]
description: "What the Lareia Write and Reflect plugin wrote to the vault: one line per applied day, deduplicated by date and version, with divergences and surprises highlighted. A sync with no effect writes nothing."
---

# Lareia — plugin log

> [!info] Written by the «Lareia Write and Reflect» plugin. Do not edit by hand.
`,

  blocosDoMesmoDia: (n, data) => `there are ${n} blocks for ${data} in the same file`,
  marcadoresSemPar: "opening and closing markers don't come in pairs",
  blocoNaoFecha: (data) => `the block for ${data} opens and doesn't close`,
  fechamentoAntes: "there is a closing marker before any opening one",
  textoComMarcador: "the day's text contains a Lareia marker",
  cabecalhoRepetido: (cabecalho, n) => `the heading «${cabecalho}» appears ${n} times`,
  cabecalhoAusente: (cabecalho) => `the heading «${cabecalho}» doesn't exist in this file`,
  cabecalhoAcrescentadoSumiu: "the appended heading can't be found",
  nenhumaPasta: "(none — choose them in the plugin settings)",
  destinoVazio: (aceitas) => `empty destination. The allowed folders are: ${aceitas}`,
  destinoAbsoluto: (pedido, aceitas) => `\`${pedido}\` is an absolute path. The destination is relative to the vault root, inside: ${aceitas}`,
  destinoSobe: (pedido, aceitas) => `\`${pedido}\` goes up a directory. The allowed folders are: ${aceitas}`,
  destinoFora: (pedido, aceitas) => `\`${pedido}\` is outside the allowed folders. The destination must start with one of these: ${aceitas}`,
  destinoNaRaiz: (pedido, exemplo, aceitas) =>
    `\`${pedido}\` is the root of an allowed folder. The notebook needs a folder of its own inside it — for example \`${exemplo}\`. The allowed folders are: ${aceitas}`,
  exemploDeCaderno: "My notebook",
  pastaOcupada: (destino) => `\`${destino}\` already exists with files I didn't write`,
  pastaOcupadaMd: (destino) => `\`${destino}\` already exists with \`.md\` files I didn't write`,
  indexSemFecho: "`index.md` has the opening marker without the closing one; not writing, so as not to swallow the rest of the file",
  indexSemAbertura: "`index.md` has the closing marker without the opening one",
  indexForaDeOrdem: "the `index.md` markers are out of order",
  arquivoNaoEDoMapa: (nome, id) => `${nome}: the file exists and isn't from mind map ${id}`,
  midiaVazia: (nome) => `${nome}: came back empty`,
  cenaNaoUtf8: (erro) => `the scene isn't UTF-8: ${erro}`,
  cenaNaoJson: (erro) => `the scene isn't JSON: ${erro}`,
  cenaSemForma: "the scene doesn't have the Excalidraw shape (type/elements)",
  foraDasPastas: (caminho, aceitas) => `outside the folders in the settings: ${caminho} (allowed: ${aceitas})`,
  raiz: "(root)",
  jaExiste: (caminho) => `already exists: ${caminho}`,
  naoExiste: (caminho) => `doesn't exist: ${caminho}`,
  destinoExiste: (caminho) => `destination exists: ${caminho}`,
};

export const TEXTOS: Record<Lingua, Textos> = { pt, en };

let atual: Lingua = "pt";

/** A língua do plugin, pelo código do Obsidian (`getLanguage()`). Devolve a escolhida. */
export function definirLingua(codigo: string | null | undefined): Lingua {
  atual = linguaDe(codigo);
  return atual;
}

export function linguaAtual(): Lingua {
  return atual;
}

/** Os textos na língua atual. Lido na hora de dizer, e não guardado: a língua pode mudar entre um aviso e outro. */
export function T(): Textos {
  return TEXTOS[atual];
}
