const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const fs = require("fs-extra");
const path = require("path");
const qrcodeTerminal = require("qrcode-terminal");
const Boom = require("@hapi/boom");
const P = require("pino");

const { sendDataToApp } = require("../config/lara-api");
const e = require("express");

let appDataPayload = {
  type: "",
  data: {},
};

const sessionsDir = path.join(__dirname, "../../storage/sessions/");
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
        console.log(`✅ Session restored for ${uuid}`);
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
    logger: P({ level: "silent" }),
    syncFullHistory: false,
    emitOwnEvents: true,
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
      appDataPayload.type = "connection";
      appDataPayload.data = { status: "connected" };
      sendDataToApp(uuid, appDataPayload);
      if (callback && typeof callback === "function") {
        callback(null, null); // Connection established, no QR needed
      }
    }

    // Handle disconnection
    else if (connection === "close") {
      const reason = Boom.isBoom(lastDisconnect?.error)
        ? lastDisconnect.error.output.statusCode
        : null;

      // console.log("All Reasons", DisconnectReason);
      console.log(`❌ Disconnected ${uuid}: ${reason}`);

      // Cleanup session and QR codes
      delete sessions[uuid];
      delete qrCodes[uuid];

      // If the user logged out (i.e. their session was invalidated)
      if (reason === DisconnectReason.loggedOut) {
        try {
          fs.removeSync(sessionPath); // Synchronously remove the session folder
          appDataPayload.type = "connection";
          appDataPayload.data = {
            status: "disconnected",
            reason: "logged_out",
          };
          sendDataToApp(uuid, appDataPayload);
        } catch (error) {
          console.error(`❌ Error removing session for ${uuid}: ${error}`);
        }
      }

      // Gracefully handle 515 (Restart Required) error
      if (
        reason === DisconnectReason.restartRequired ||
        reason === DisconnectReason.connectionReplaced ||
        reason === DisconnectReason.unavailableService
      ) {
        setTimeout(() => {
          createConnection(uuid, callback); // Delay the reconnection
        }, 5 * 1000); // Delay by 3 seconds to prevent immediate error on frontend
      }

      // Reconnect on non-logout disconnects
      if (reason !== DisconnectReason.loggedOut) {
        createConnection(uuid, callback);
      }

      if (reason === null) {
        setTimeout(() => {
          createConnection(uuid, callback);
        }, 3 * 1000); // Delay longer to avoid spamming
      }
    }
  });

  sock.ev.on("messages.upsert", async (messageEvent) => {
    const { messages, type } = messageEvent;

    if (type === "notify") {
      const msg = messages[0];
      if (!msg.message) return; // Ignore empty messages

      const sender = msg.key.remoteJid;
      if (sender === "status@broadcast") return; // Ignore status messages
      const isGroup = sender.includes("@g.us");

      let messageContent;
      let messageType;
      // Remove status if present in appDataPayload
      if (appDataPayload.data.status) {
        delete appDataPayload.data.status;
      }
      appDataPayload.type = "incoming_message";
      appDataPayload.data.message = {}; // Initialize message object
      const downloadAndSaveFile = async (url, filePath) => {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(filePath, buffer);
      };

      const storageDir = path.join(__dirname, "../../storage/downloads", uuid);

      if (msg.message.conversation) {
        messageType = "text";
        messageContent = msg.message.conversation;
        appDataPayload.data.message.type = "text";
        appDataPayload.data.message.text = messageContent;
      } else if (msg.message.extendedTextMessage) {
        messageType = "text";
        messageContent = msg.message.extendedTextMessage.text;
        appDataPayload.data.message.type = "text";
        appDataPayload.data.message.text = messageContent;
      } else if (msg.message.imageMessage) {
        messageType = "image";
        messageContent = "🖼️ You sent an image.";
        appDataPayload.data.message.type = "image";
        const imageDir = path.join(storageDir, "image");
        fs.ensureDirSync(imageDir);
        const imagePath = path.join(imageDir, `${Date.now()}.jpg`);
        await downloadAndSaveFile(msg.message.imageMessage.url, imagePath);
        appDataPayload.data.message.url = imagePath;
      } else if (msg.message.videoMessage) {
        messageType = "video";
        messageContent = "🎥 You sent a video.";
        appDataPayload.data.message.type = "video";
        const videoDir = path.join(storageDir, "video");
        fs.ensureDirSync(videoDir);
        const videoPath = path.join(videoDir, `${Date.now()}.mp4`);
        await downloadAndSaveFile(msg.message.videoMessage.url, videoPath);
        appDataPayload.data.message.url = videoPath;
      } else if (msg.message.audioMessage) {
        messageType = "audio";
        messageContent = "🎵 You sent an audio.";
        appDataPayload.data.message.type = "audio";
        const audioDir = path.join(storageDir, "audio");
        fs.ensureDirSync(audioDir);
        const audioPath = path.join(audioDir, `${Date.now()}.mp3`);
        await downloadAndSaveFile(msg.message.audioMessage.url, audioPath);
        appDataPayload.data.message.url = audioPath;
      } else if (msg.message.documentMessage) {
        messageType = "document";
        messageContent = "📄 You sent a document.";
        appDataPayload.data.message.type = "document";
        const documentDir = path.join(storageDir, "document");
        fs.ensureDirSync(documentDir);
        const documentPath = path.join(documentDir, `${Date.now()}.pdf`);
        await downloadAndSaveFile(
          msg.message.documentMessage.url,
          documentPath
        );
        appDataPayload.data.message.url = documentPath;
      } else if (msg.message.stickerMessage) {
        messageType = "sticker";
        messageContent = "😊 You sent a sticker.";
      } else if (msg.message.contactMessage) {
        messageType = "contact";
        messageContent = "👤 You sent a contact.";
        appDataPayload.data.message.type = "contact";
        appDataPayload.data.message.contact = msg.message.contactMessage;
      } else if (msg.message.locationMessage) {
        messageType = "location";
        messageContent = "📍 You sent a location.";
        appDataPayload.data.message.type = "location";
        appDataPayload.data.message.location = {
          lat: msg.message.locationMessage.degreesLatitude,
          long: msg.message.locationMessage.degreesLongitude,
        };
      } else if (msg.message.liveLocationMessage) {
        messageType = "live-location";
        messageContent = "📍 You sent a live location.";
      } else if (msg.message.vcardMessage) {
        messageType = "vcard";
        messageContent = "📇 You sent a vCard.";
        appDataPayload.data.message.type = "vcard";
        appDataPayload.data.message.vcard = msg.message.vcardMessage;
      } else if (msg.message.gifMessage) {
        messageType = "gif";
        messageContent = "🎬 You sent a GIF.";
        appDataPayload.data.message.type = "gif";
        const gifDir = path.join(storageDir, "gif");
        fs.ensureDirSync(gifDir);
        const gifPath = path.join(gifDir, `${Date.now()}.gif`);
        await downloadAndSaveFile(msg.message.gifMessage.url, gifPath);
        appDataPayload.data.message.url = gifPath;
      } else {
        messageContent = "[Unsupported Message Type]";
      }
      console.log(`📩 New message from ${sender}: ${messageContent}`);
      if (!msg.key.fromMe) {
        const notSupportedTypes = ["sticker", "contact", "location", "vcard"];
        if (!isGroup && !notSupportedTypes.includes(messageType)) {
          await sendDataToApp(uuid, appDataPayload);
          // Delete the media file from storage after sending data
          if (appDataPayload.data.message.url) {
            fs.remove(appDataPayload.data.message.url, (err) => {
              if (err) {
                console.error(`❌ Error deleting file: ${err}`);
              } else {
                console.log(
                  `🗑️ Deleted file: ${appDataPayload.data.message.url}`
                );
              }
            });
          }
        } else {
          // await sock.sendMessage(sender, {
          //   text: `We do not support ${messageType} messages yet.`,
          // });
        }
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
      if (callback) {
        callback(null, null);
      }
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
