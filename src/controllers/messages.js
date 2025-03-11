const { generateMessageID } = require("baileys");
const { getConnection, initStore } = require("../config/baileys");
const fs = require("fs-extra");
const path = require("path");
const { param } = require("../routes");
const { downloadContentFromMessage } = require("baileys");
const axios = require("axios");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const sendMessage = async (req, res) => {
  try {
    const {
      account,
      to,
      message,
      type,
      media_type,
      media_file,
      media_url,
      document_type,
      document_file,
      document_name,
      document_url,
      lat,
      long,
      con_numbers,
      con_name,
    } = req.body;
    if (!account || !to || !message || !type) {
      if (!account) {
        return res.status(400).json({
          success: false,
          message: "Account ID required",
          parameter: "account",
        });
      }
      if (!to) {
        return res.status(400).json({
          success: false,
          message: "Receiver number required",
          parameter: "to",
        });
      }
      if (!message) {
        return res.status(400).json({
          success: false,
          message: "Message required",
          parameter: "message",
        });
      }
      if (!type) {
        return res.status(400).json({
          success: false,
          message: "Message type required",
          parameter: "type",
        });
      }
    }
    if (type === "media") {
      if (!media_type) {
        return res.status(400).json({
          success: false,
          message: "Media type required for media messages",
          parameter: "media_type",
        });
      }
      if (!media_file && !media_url) {
        return res.status(400).json({
          success: false,
          message: "Media file or URL required for media messages",
          parameter: "media_file or media_url",
        });
      }
    }
    if (type === "document") {
      if (!document_type) {
        return res.status(400).json({
          success: false,
          message: "Document type required for document messages",
        });
      }
      if (!document_file && !document_url) {
        return res.status(400).json({
          success: false,
          message: "Document file or URL required for document messages",
          parameter: "document_url or document_name",
        });
      }
      if (document_url && !document_name) {
        return res.status(400).json({
          success: false,
          message: "Document name required when passing document URL",
          parameter: "document_name",
        });
      }
    }
    if (type === "location" && (!lat || !long)) {
      if (!lat) {
        return res.status(400).json({
          success: false,
          message: "Latitude required for location messages",
          parameter: "lat",
        });
      }
      if (!long) {
        return res.status(400).json({
          success: false,
          message: "Longitude required for location messages",
          parameter: "long",
        });
      }
    }
    const formattedNumber = to.replace(/\+/g, "");
    const session = await getConnection(account, null);
    if (!session || !session.sock) {
      return res
        .status(400)
        .json({ success: false, message: "Account not connected" });
    }

    const sock = session.sock;
    if (sock.ws.readyState !== sock.ws.OPEN) {
      return res
        .status(400)
        .json({ success: false, message: "WebSocket is not open" });
    }
    //check number is on whatsapp
    const result = await sock.onWhatsApp(formattedNumber);
    let jid = "";
    if (result.length > 0) {
      jid = result[0].jid;
    } else {
      return res.status(404).json({
        success: false,
        message: "Receiver is not on WhatsApp",
      });
    }

    let payload = {
      text: message,
    };

    if (type === "media" && media_type && (media_file || media_url)) {
      payload = {
        ...payload,
        mediaType: media_type,
      };

      if (payload.text) {
        delete payload.text;
      }

      // Handle Video
      if (media_type === "video" || media_type === "gif") {
        if (media_file) {
          payload.video = Buffer.from(media_file, "base64"); // Convert base64 to Buffer for sending video
        } else if (media_url) {
          payload.video = { url: media_url }; // Provide the URL for the video
        }
        // Optionally add caption or gifPlayback
        if (message) {
          payload.caption = message;
        }
        if (media_type === "gif") {
          payload.gifPlayback = true;
        } else {
          payload.ptv = false; // If ptv is true, it will send as a video note
        }
      }

      // Handle Audio
      else if (media_type === "audio") {
        if (media_file) {
          payload.audio = Buffer.from(media_file, "base64"); // Convert base64 to Buffer for sending audio
        } else if (media_url) {
          payload.audio = { url: media_url }; // Provide the URL for the audio
        }
      }

      // Handle Image
      else if (media_type === "image") {
        if (media_file) {
          payload.image = Buffer.from(media_file, "base64"); // Convert base64 to Buffer for sending an image
        } else if (media_url) {
          payload.image = { url: media_url }; // Provide the URL for the image
        }
        if (message) {
          payload.caption = message;
        }
      }
    }
    if (type === "document") {
      if (document_file) {
        payload.document = Buffer.from(document_file, "base64"); // Convert base64 to Buffer for sending document
      } else if (document_url) {
        payload.document = { url: document_url }; // Provide the document URL
      }
      if (document_name) {
        payload.fileName = document_name; // Set the document name (fileName)
      }
      if (document_type) {
        payload.mimetype = "application/" + document_type; // Set the document MIME type (document_type)
      }
      if (payload.text) {
        delete payload.text;
      }
      payload.caption = message;
    }

    if (type === "location" && lat && long) {
      if (payload.text) {
        delete payload.text;
      }
      payload.location = {
        degreesLatitude: lat,
        degreesLongitude: long,
      };
    }

    if (type === "contact" && con_name && con_numbers) {
      if (payload.text) {
        delete payload.text;
      }
      const conNumbersArray = Array.isArray(con_numbers)
        ? con_numbers
        : [con_numbers];
      payload.contacts = {
        displayName: con_name,
        contacts: conNumbersArray.map((number) => ({
          vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${con_name}\nTEL;type=CELL;type=VOICE;waid=${number}:${number}\nEND:VCARD`,
        })),
      };
    }

    console.log("Payload:", payload);

    const messageId = generateMessageID();
    sock.sendMessage(jid, payload, { messageId: messageId });

    return res.json({
      success: true,
      message: "Message is being sent!",
      type: type,
      id: messageId,
    });
  } catch (error) {
    console.error("Error in sending message:", error); // Log the error to see more details
    return res.status(500).json({ success: false, message: error.message });
  }
};

const downloadFile = async (req, res) => {
  const { messageObject, account, message_id, sender, mimetype } = req.body;

  if (!message_id) {
    return res.status(400).json({
      success: false,
      message: "Message ID required",
      parameter: "message_id",
    });
  }
  if (!sender) {
    return res.status(400).json({
      success: false,
      message: "Sender required",
      parameter: "sender",
    });
  }
  if (!messageObject) {
    return res.status(400).json({
      success: false,
      message: "Message Object required",
      parameter: "messageObject",
    });
  }

  // Get the session socket
  const session = await getConnection(account, null);
  if (!session || !session.sock) {
    return res
      .status(400)
      .json({ success: false, message: "Account not connected" });
  }

  const sock = session.sock;
  if (sock.ws.readyState !== sock.ws.OPEN) {
    return res
      .status(400)
      .json({ success: false, message: "WebSocket is not open" });
  }

  try {
    // Decrypt the media using Baileys
    const decryptedBuffer = await downloadMediaMessage(
      messageObject,
      "buffer",
      {}
    );
    // Set response headers
    res.setHeader("Content-Type", mimetype);
    res.setHeader("Content-Length", decryptedBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=media.${mimetype.split("/")[1]}`
    );

    // Send file as stream
    res.end(decryptedBuffer);
  } catch (error) {
    console.error("Error in downloading file:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { sendMessage, downloadFile };
