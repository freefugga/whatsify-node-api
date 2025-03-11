const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");
const fs = require("fs-extra");
const path = require("path");
const qrcodeTerminal = require("qrcode-terminal");
const Boom = require("@hapi/boom");
const P = require("pino");

const { sendDataToApp } = require("../helpers/lara-api");
const e = require("express");
const { uploadMediaToImgur } = require("../helpers/imgur");

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
      fs.removeSync(sessionPath); // Remove invalid session
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
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["Whatsify", "Chrome"],
    restartOnAuthFail: true,
    logger: P({ level: "silent" }),
    syncFullHistory: false,
    emitOwnEvents: true,
    signalStore: makeCacheableSignalKeyStore(state.creds),
    markOnlineOnConnect: false,
  });

  // Listen for credentials update (save creds)
  sock.ev.on("creds.update", saveCreds);

  // Listen for connection updates (QR code generation and connection status)
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Handle QR code generation
    if (qr) {
      qrCodes[uuid] = qr; // Store QR code in qrCodes for the given account (UUID)

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
      appDataPayload.data = {
        status: "connected",
        phone: sessions[uuid].sock.user.id
          .split(":")[0]
          .replace("@s.whatsapp.net", ""),
        uuid: uuid,
      };
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
        }, 3 * 1000); // Delay by 3 seconds to prevent immediate error on frontend
      }

      // Reconnect on non-logout disconnects
      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(() => {
          createConnection(uuid, callback);
        }, 3 * 1000);
      }

      if (reason === null) {
        setTimeout(() => {
          createConnection(uuid, callback);
        }, 3 * 1000); // Delay longer to avoid spamming
      }
    }
  });

  sock.ev.on("presence.update", async (update) => {
    try {
      const { id, presences } = update;

      if (!id || !presences) return; // Skip if no data

      if (id.includes("@g.us")) return; // Ignore group presence updates

      let waId = id.replace("@s.whatsapp.net", "");
      let presenceData = Object.values(presences)[0]; // Get first presence object

      if (!presenceData || !presenceData.lastKnownPresence) return; // Skip if no presence data

      appDataPayload.type = "presence_update";
      appDataPayload.data = {
        type: "presence",
        number: waId,
        uuid: uuid,
        presence: presenceData.lastKnownPresence,
      };

      await sendDataToApp(uuid, appDataPayload);

      // Clean up the payload
      delete appDataPayload.data;
    } catch (error) {
      console.error("Error in presence.update handler:", error);
    }
  });

  sock.ev.on("messages.upsert", async (messageEvent) => {
    const { messages, type } = messageEvent;

    const msg = messages[0];

    switch (type) {
      case "notify":
        console.log("🔔 New message notification:", msg);
        break;
      case "insert":
        console.log("📩 New message received:", msg);
        break;
      case "update":
        console.log("✏️ Message updated:", msg);
        break;
      case "delete":
        console.log("🗑️ Message deleted:", msg);
        break;
      case "append":
        console.log("📩 New message appended:", msg);
        break;
      default:
        console.log("⚡ Unknown message type:", type);
    }
    if (type === "notify" || type === "append") {
      if (!msg.message) return; // Ignore empty messages

      let group = null;
      let groupName = null;
      let groupProfilePicture = null;

      let participant = msg.key.remoteJid;
      const isGroup = participant.includes("@g.us");
      if (isGroup) {
        group = msg.key.remoteJid;
        participant = msg.key.participant;
        groupName = msg.key.pushName;
        groupProfilePicture = await sock.profilePictureUrl(group, "image");
      }
      const profilePictureHd = await sock.profilePictureUrl(
        participant,
        "image"
      );

      if (participant === "status@broadcast") return; // Ignore status messages

      let messageContent;
      let messageType;
      let attachmentUrl;
      let attachmentMimeType;
      let attachmentKey;
      // Remove status if present in appDataPayload
      if (appDataPayload.data && appDataPayload.data.status) {
        delete appDataPayload.data.status;
      } else if (!appDataPayload.data) {
        appDataPayload.data = {};
      }
      appDataPayload.data.messageObject = msg;
      if (!msg.key.fromMe) {
        appDataPayload.type = "incoming_message";
        appDataPayload.data.transfer_type = "received";
      } else {
        appDataPayload.type = "outgoing_message";
        appDataPayload.data.transfer_type = "sent";
      }
      appDataPayload.data.other_party = {
        number: participant.replace("@s.whatsapp.net", ""),
        profile_picture_hd: profilePictureHd,
        name: msg.pushName ?? msg.verifiedBizName,
        is_group: isGroup,
        group: group,
        group_name: groupName,
        group_profile_picture_hd: groupProfilePicture,
      };
      appDataPayload.data.message = {}; // Initialize message object
      appDataPayload.data.message.id = msg.key.id;
      appDataPayload.data.message.timestamp = msg.messageTimestamp;

      if (msg.message.conversation) {
        messageType = "text";
        messageContent = msg.message.conversation;
        appDataPayload.data.message.type = "text";
        appDataPayload.data.message.caption = messageContent;
      } else if (msg.message.extendedTextMessage) {
        messageType = "text";
        messageContent = msg.message.extendedTextMessage.text;
        appDataPayload.data.message.type = "text";
        appDataPayload.data.message.caption = messageContent;
      } else if (msg.message.imageMessage) {
        messageType = "image";
        messageContent = "🖼️ You sent an image.";
        appDataPayload.data.message.type = "image";
        appDataPayload.data.message.file = msg.message.imageMessage.url;
        appDataPayload.data.message.mimetype =
          msg.message.imageMessage.mimetype;
        appDataPayload.data.message.caption = msg.message.imageMessage.caption;
        appDataPayload.data.message.filename =
          msg.message.imageMessage.fileName;
      } else if (msg.message.videoMessage) {
        messageType = "video";
        messageContent = "🎥 You sent a video.";
        appDataPayload.data.message.type = "video";
        appDataPayload.data.message.file = msg.message.videoMessage.url;
        appDataPayload.data.message.mimetype =
          msg.message.videoMessage.mimetype;
        appDataPayload.data.message.caption = msg.message.videoMessage.caption;
        appDataPayload.data.message.filename =
          msg.message.videoMessage.fileName;
      } else if (msg.message.audioMessage) {
        messageType = "audio";
        messageContent = "🎵 You sent an audio.";
        appDataPayload.data.message.type = "audio";
        appDataPayload.data.message.file = msg.message.audioMessage.url;
        appDataPayload.data.message.mimetype =
          msg.message.audioMessage.mimetype;
        appDataPayload.data.message.filename =
          msg.message.audioMessage.fileName;
      } else if (
        msg.message.documentMessage ||
        msg.message.documentWithCaptionMessage
      ) {
        messageType = "document";
        messageContent = "📄 You sent a document.";
        appDataPayload.data.message.type = "document";
        if (msg.message.documentMessage) {
          attachmentUrl = msg.message.documentMessage.url;
          attachmentMimeType = msg.message.documentMessage.mimetype;
          appDataPayload.data.message.caption =
            msg.message.documentMessage.caption;
        } else if (msg.message.documentWithCaptionMessage) {
          attachmentUrl =
            msg.message.documentWithCaptionMessage.message.documentMessage.url;
          attachmentMimeType =
            msg.message.documentWithCaptionMessage.message.documentMessage
              .mimetype;
        }
        appDataPayload.data.message.file = attachmentUrl;
        appDataPayload.data.message.mimetype = attachmentMimeType;
        if (msg.message.documentWithCaptionMessage) {
          appDataPayload.data.message.filename =
            msg.message.documentWithCaptionMessage.message.documentMessage.fileName;
        } else {
          appDataPayload.data.message.filename =
            msg.message.documentMessage.fileName;
        }
        if (msg.message.documentWithCaptionMessage) {
          appDataPayload.data.message.caption =
            msg.message.documentWithCaptionMessage.message.documentMessage.caption;
        }
      } else if (msg.message.stickerMessage) {
        messageType = "sticker";
        messageContent = "😊 You sent a sticker.";
      } else if (
        msg.message.contactMessage ||
        msg.message.contactsArrayMessage
      ) {
        messageType = "contact";
        messageContent = "👤 You sent a contact.";
        appDataPayload.data.message.type = "contact";
        appDataPayload.data.message.contact = {};
        if (msg.message.contactsArrayMessage) {
          appDataPayload.data.message.contact.name =
            msg.message.contactsArrayMessage.contacts[0].displayName;
          let numberArray = [];
          msg.message.contactsArrayMessage.contacts.map((contact) => {
            const telMatches = contact.vcard.match(/TEL;[^:]*:(.+)/g);
            // Extract and clean the phone numbers
            const telNumbers = telMatches
              ? telMatches.map((match) => {
                  // Extract the number part after ':'
                  const number = match.split(":")[1];

                  // Remove all spaces and dashes from the number
                  return number.replace(/[\s-]+/g, "");
                })
              : [];
            return numberArray.push(telNumbers[0]);
          });
          appDataPayload.data.message.contact.number = numberArray;
        } else {
          appDataPayload.data.message.contact.name =
            msg.message.contactMessage.displayName;
          const vcard = msg.message.contactMessage.vcard;

          // Match all TEL entries in the vCard
          const telMatches = vcard.match(/TEL;[^:]*:(.+)/g);

          // Extract and clean the phone numbers
          const telNumbers = telMatches
            ? telMatches.map((match) => {
                // Extract the number part after ':'
                const number = match.split(":")[1];

                // Remove all spaces and dashes from the number
                return number.replace(/[\s-]+/g, "");
              })
            : [];
          appDataPayload.data.message.contact.number = telNumbers;
        }
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
      } else {
        messageContent = "[Unsupported Message Type]";
      }
      const notSupportedTypes = ["sticker", "live-location", "vcard"];
      if (!notSupportedTypes.includes(messageType)) {
        console.log(appDataPayload);
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
              fs.removeSync(appDataPayload.data.message.url);
            }
          });
          delete appDataPayload.data;
        }
      } else {
        // await sock.sendMessage(sender, {
        //   text: `We do not support ${messageType} messages yet.`,
        // });
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

const checkConnection = async (uuid) => {
  if (!sessions[uuid]) {
    return false;
  }
  return true;
};

module.exports = {
  createConnection,
  restoreSessions,
  getConnection,
  sessions,
  qrCodes,
};
