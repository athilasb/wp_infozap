let status = "";
const fs = require("fs");
const path = require("path");
const http = require('http');
const express = require('express');
const qrcode = require('qrcode');

const port = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

// Importar Socket.IO
const io = require('socket.io')(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/", express.static(__dirname + "/"));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


const {
  default: MaiConnect,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const moment = require("moment-timezone");

io.on('connection', (socket) => {
  console.log(status);
  io.emit('log', status);

  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
  });
});

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
      //qrcode.generate(qr, { small: true });
      qrcode.toDataURL(qr, (err, url) => {
        if (err) {
          //console.error('Erro ao gerar QR Code', err);
        } else {
          io.emit('qr', url);
          console.log(url);
        }

      });
    }
    if (connection === "connecting") {
      console.log("Conectando ao WhatsApp...");
    }
    if (connection === "open") {
      console.log("Conectado ao WhatsApp.");
      status = "Conectado ao WhatsApp.";
      // Aqui você pode adicionar a "porta" ou qualquer outra informação que você deseja logar quando a conexão for estabelecida
      //console.log("Bot está ativo!");
      io.emit('qr', "");
      io.emit('connection-status', 'connected');
    }
    if (connection === "close") {
      let reason = lastDisconnect.error
        ? lastDisconnect?.error?.output.statusCode
        : 0;
      if (reason === DisconnectReason.badSession) {
        //deleteSession()
        startMai();
      } else if (reason === DisconnectReason.connectionClosed) {
        console.log("Conexão fechada, reconectando....");
        status = "Conexão fechada, reconectando....";
        startMai();
      } else if (reason === DisconnectReason.connectionLost) {
        console.log("Conexão perdida com o servidor, reconectando...");
        status = "Conexão perdida com o servidor, reconectando...";
        startMai();
      } else if (reason === DisconnectReason.connectionReplaced) {
        status = "Dispositivo desconectado";
        deleteSession()
        startMai();
      } else if (reason === DisconnectReason.loggedOut) {
        deleteSession()
        startMai();
        console.log(`Dispositivo desconectado, por favor delete a sessão e escaneie novamente.`);
        status = "Dispositivo desconectado";
        // process.exit();
      } else if (reason === DisconnectReason.restartRequired) {
        console.log("Reinício necessário, reiniciando...");
        status = "Reinício válido, reiniciando...";
        startMai();
      } else if (reason === DisconnectReason.timedOut) {
        console.log("Tempo de conexão esgotado, reconectando...");
        status = "Tempo de conexão esgotado, reconectando...";
        startMai();
      } else {
        console.log(`Motivo de desconexão desconhecido: ${reason}|${connection}`);
      }
    }

  });

  Mai.ev.on("messages.upsert", async (chatUpdate, type) => {
    const mek = chatUpdate.messages[0];
    if (type === "notify") {
      if (!mek.message || mek.key.id.startsWith("BAE5") && mek.key.id.length === 16) return;

      // Ignorar mensagens de grupos
      if (mek.key.remoteJid.endsWith('@g.us')) return;

      // Determinar se a mensagem é enviada ou recebida
      const isFromMe = mek.key.fromMe;
      let text = mek.message.conversation || (mek.message.extendedTextMessage && mek.message.extendedTextMessage.text) || (mek.message.imageMessage && mek.message.imageMessage.caption) || (mek.message.videoMessage && mek.message.videoMessage.caption) || (mek.message.documentMessage && mek.message.documentMessage.caption) || (mek.message.audioMessage && mek.message.audioMessage.caption) || mek.message.text || "";
      if (isFromMe) {
        console.log("Mensagem enviada:", text, "PARA", mek.key.remoteJid);
      } else {
        console.log("Mensagem recebida:", text, "DE", mek.key.remoteJid);
        // Responder com a hora atual se a mensagem recebida for "horas"
        if (text.toLowerCase() === "horas") {
          const timeNow = moment().tz('America/Sao_Paulo').format('HH:mm:ss');
          const responseText = `Hora atual: ${timeNow}`;
          Mai.sendMessage(mek.key.remoteJid, { text: responseText });

          Mai.sendMessage(mek.key.remoteJid, {
            text: responseText,
            inReplyTo: mek.key.id
          });
        }
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

server.listen(3000, () => {
  console.log("Servidor WebSocket ouvindo na porta" + port);
});

startMai();
