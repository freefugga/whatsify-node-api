const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const fs = require("fs-extra");
const path = require("path");
const qrcodeTerminal = require("qrcode-terminal");
const Boom = require("@hapi/boom");

const { sendDataToFrontend } = require("../config/lara-api");

const sessionsDir = path.join(__dirname, "../../sessions/");
fs.ensureDirSync(sessionsDir);

const sessions = {};
const qrCodes = {}; // Store QR codes for each account

const restoreSessions = async () => {
  // Check if the directory exists before reading
  if (!fs.existsSync(sessionsDir)) {
    return;
  }

  const sessionDirs = fs.readdirSync(sessionsDir);

  for (const uuid of sessionDirs) {
    const sessionPath = path.join(sessionsDir, uuid);

    // Check if creds.json exists (valid session)
    if (fs.existsSync(path.join(sessionPath, "creds.json"))) {
      createConnection(uuid, () => {
        // console.log(`✅ Session restored for ${uuid}`);
      });
    } else {
      console.log(`⚠️ No valid session found for ${uuid}`);
    }
  }
};

// Function to create a connection and handle QR code generation
const createConnection = async (uuid, callback) => {
  if (sessions[uuid] && sessions[uuid].sock) {
    return;
  }

  const sessionPath = path.join(sessionsDir, uuid);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["Whatsify", "Chrome"],
    restartOnAuthFail: true,
  });

  // Listen for credentials update (save creds)
  sock.ev.on("creds.update", saveCreds);

  // Listen for connection updates (QR code generation and connection status)
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Handle QR code generation
    if (qr) {
      qrCodes[uuid] = qr; // Store QR code in qrCodes for the given account (UUID)

      // Optionally, print QR code in terminal for local development
      qrcodeTerminal.generate(qr, { small: true });

      // Call the callback with the QR code once it is generated
      if (callback && typeof callback === "function") {
        callback(null, qrCodes[uuid]);
      }
      return;
    }

    // Handle connection open state
    if (connection === "open") {
      delete qrCodes[uuid]; // Clear QR code after connection is made
      sessions[uuid] = { sock }; // Store the socket object in sessions
      if (callback && typeof callback === "function") {
        callback(null, null); // Connection established, no QR needed
      }
      sendDataToFrontend(uuid, "connected");
    }

    // Handle disconnection
    else if (connection === "close") {
      const reason = Boom.isBoom(lastDisconnect?.error)
        ? lastDisconnect.error.output.statusCode
        : null;

      // Cleanup session and QR codes
      delete sessions[uuid];
      delete qrCodes[uuid];

      // If the user logged out (i.e. their session was invalidated)
      if (reason === DisconnectReason.loggedOut) {
        try {
          fs.removeSync(sessionPath); // Synchronously remove the session folder
          createConnection(uuid, callback); // Regenerate QR after logout
        } catch (error) {}
      }

      // Gracefully handle 515 (Restart Required) error
      if (reason === DisconnectReason.restartRequired) {
        setTimeout(() => {
          createConnection(uuid, callback); // Delay the reconnection
        }, 2 * 1000); // Delay by 3 seconds to prevent immediate error on frontend
      }

      // Reconnect on non-logout disconnects
      if (reason !== DisconnectReason.loggedOut) {
        createConnection(uuid, callback);
      }

      if (reason === null) {
        setTimeout(() => {
          createConnection(uuid, callback);
        }, 3 * 1000); // Delay longer to avoid spamming
        return;
      }
    }
  });

  sock.ev.on("messages.upsert", async (messageEvent) => {
    const { messages, type } = messageEvent;

    if (type === "notify") {
      const msg = messages[0];
      if (!msg.message) return; // Ignore empty messages

      const sender = msg.key.remoteJid;
      const isGroup = sender.includes("@g.us");

      let messageContent;
      if (msg.message.conversation) {
        messageContent = msg.message.conversation;
      } else if (msg.message.extendedTextMessage) {
        messageContent = msg.message.extendedTextMessage.text;
      } else {
        messageContent = "[Unsupported Message Type]";
      }
      if (!msg.key.fromMe) {
        console.log(`📩 New message from ${sender}: ${messageContent}`);
        await sock.sendMessage(sender, { text: `You said: ${messageContent}` });
      }
    }
  });
};

// Function to get an existing connection or create a new one
const getConnection = async (uuid, callback) => {
  // Only create a new connection if one doesn't exist
  if (!sessions[uuid]) {
    createConnection(uuid, callback);
  } else {
    // If there's an active session, get the QR code if available
    const connection = sessions[uuid];
    if (qrCodes[uuid]) {
      callback(null, qrCodes[uuid]); // Return the QR code if it's available
    } else {
      return connection; // Return the existing connection
    }
  }
};

module.exports = {
  createConnection,
  restoreSessions,
  getConnection,
  sessions,
  qrCodes,
};
