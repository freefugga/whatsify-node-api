const { xmppPreKey } = require("baileys");
const { getConnection } = require("../config/baileys");
const fs = require("fs-extra");
const { param } = require("../routes");

exports.sendMessage = async (req, res) => {
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
      return res.json({
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
          payload.video = fs.readFileSync(media_file); // Use fs to read the file for sending video
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
          payload.audio = fs.readFileSync(media_file); // Use fs to read the file for sending audio
        } else if (media_url) {
          payload.audio = { url: media_url }; // Provide the URL for the audio
        }
      }

      // Handle Image
      else if (media_type === "image") {
        if (media_file) {
          payload.image = fs.readFileSync(media_file); // Use fs to read the file for sending an image
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
        payload.document = fs.readFileSync(document_file); // Read the document file
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
    console.log(payload);

    const response = sock.sendMessage(jid, payload);

    return res.json({ success: true, message: "Message sent!", type: type });
  } catch (error) {
    console.error("Error in sending message:", error); // Log the error to see more details
    return res.status(500).json({ success: false, message: error.message });
  }
};
