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

// Function to create a connection and handle QR code generation
const createConnection = async (uuid, callback) => {
  console.log("Creating connection for", uuid);
  const sessionPath = path.join(sessionsDir, uuid);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["Whatsify", "Chrome"] // Don't print the QR code in terminal automatically
  });

  // Listen for credentials update (save creds)
  sock.ev.on("creds.update", saveCreds);

  // Listen for connection updates (QR code generation and connection status)
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Handle QR code generation
    if (qr) {
      console.log(`📌 QR Code received for ${uuid}: ${qr}`);
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
      console.log(`✅ Connected: ${uuid}`);
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
  
      console.log(`❌ Disconnected: ${uuid}, Reason: ${reason}`);
  
      // Cleanup session and QR codes
      delete sessions[uuid];
      delete qrCodes[uuid];
  
      // If the user logged out (i.e. their session was invalidated)
      if (reason === DisconnectReason.loggedOut) {
          // Log the reason for logout and delete the session folder
          console.log(`User logged out, removing session folder for ${uuid}`);
          try {
              fs.removeSync(sessionPath); // Synchronously remove the session folder
          } catch (error) {
              console.error(`Failed to remove session folder for ${uuid}:`, error);
          }
      }
  
      // Reconnect on non-logout disconnects
      if (reason !== DisconnectReason.loggedOut) {
          console.log(`Attempting to reconnect for ${uuid}`);
          createConnection(uuid, callback);  // Call the callback to handle reconnection
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
      callback(null, null); // No QR code if already connected
    }
  }
};

module.exports = { createConnection, getConnection, sessions, qrCodes };
