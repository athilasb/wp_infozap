const fs = require("fs");
const path = require("path");

const {
  default: MaiConnect,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const moment = require("moment-timezone");
const qrcode = require("qrcode-terminal");

async function startMai() {
  const { state, saveCreds } = await useMultiFileAuthState("./Mai-SESSION");
  const Mai = MaiConnect({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false, // Desabilitado aqui, pois vamos usar qrcode-terminal para exibir
    browser: ["infozap", "Safari", "3.O"],
    auth: state,
  });

  // Lidando com a atualização das credenciais
  Mai.ev.on("creds.update", saveCreds);

  // Lidando com a atualização da conexão
  Mai.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      // Quando o QR é recebido, exibe no terminal
      qrcode.generate(qr, { small: true });
    }
    if (connection === "connecting") {
      console.log("Conectando ao WhatsApp...");
    }
    if (connection === "open") {
      console.log("Conectado ao WhatsApp.");
      // Aqui você pode adicionar a "porta" ou qualquer outra informação que você deseja logar quando a conexão for estabelecida
      console.log("Bot está ativo!");
    }
    if (connection === "close") {
      let reason = lastDisconnect.error
        ? lastDisconnect?.error?.output.statusCode
        : 0;
      if (reason === DisconnectReason.badSession) {
        deleteSession()
        startMai();
      } else if (reason === DisconnectReason.connectionClosed) {
        console.log("Conexão fechada, reconectando....");
        startMai();
      } else if (reason === DisconnectReason.connectionLost) {
        console.log("Conexão perdida com o servidor, reconectando...");
        startMai();
      } else if (reason === DisconnectReason.connectionReplaced) {
        deleteSession()
        startMai();
      } else if (reason === DisconnectReason.loggedOut) {
        deleteSession()
        startMai();
        console.log(`Dispositivo desconectado, por favor delete a sessão e escaneie novamente.`);
        // process.exit();
      } else if (reason === DisconnectReason.restartRequired) {
        console.log("Reinício necessário, reiniciando...");
        startMai();
      } else if (reason === DisconnectReason.timedOut) {
        console.log("Tempo de conexão esgotado, reconectando...");
        
        startMai();
      } else {
        console.log(`Motivo de desconexão desconhecido: ${reason}|${connection}`);
      }
    }
    
  });

  // Lidando com mensagens recebidas
  // Lidando com mensagens recebidas
// Lidando com mensagens recebidas
Mai.ev.on("messages.upsert", async (chatUpdate) => {
  const mek = chatUpdate.messages[0];
  if (!mek.message || mek.key.id.startsWith("BAE5") && mek.key.id.length === 16) return;

  // Ignorar mensagens de grupos
  if (mek.key.remoteJid.endsWith('@g.us')) return;

  // Determinar se a mensagem é enviada ou recebida
  const isFromMe = mek.key.fromMe;
  const messageType = Object.keys(mek.message)[0];
  const messageContent = mek.message[messageType];
  const text = messageContent.text || messageContent.conversation || (messageContent.extendedTextMessage ? messageContent.extendedTextMessage.text : '');
  //console.log("Mensagem:", messageContent);
  if (isFromMe) {
    console.log("Mensagem enviada:", messageContent, "PARA", mek.key.remoteJid);
  } else {
    console.log("Mensagem recebida:", text, "DE", mek.key.remoteJid);

    // Responder com a hora atual se a mensagem recebida for "horas"
    if (text.toLowerCase() === "horas") {
      const timeNow = moment().tz('America/Sao_Paulo').format('HH:mm:ss');
      const responseText = `Hora atual: ${timeNow}`;
      Mai.sendMessage(mek.key.remoteJid, { text: responseText });
    }
  }
});


}


function deleteSession() {
  const sessionDir = 'Mai-SESSION'; // Definindo o caminho da pasta diretamente
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    console.log("Pasta da sessão deletada.");
  }
}


startMai();
