const { getConnection } = require("../config/baileys");

const checkNumber = async (req, res) => {
  try {
    const { account, number } = req.body;
    if (!account || !number) {
      if (!account) {
        return res
          .status(400)
          .json({ success: false, message: "Account ID required" });
      }
      if (!number) {
        return res
          .status(400)
          .json({ success: false, message: "Number required" });
      }
    }
    const { sock } = await getConnection(account);

    const [result] = await sock.onWhatsApp(number + "@s.whatsapp.net");
    res.json({ success: true, exists: result?.exists || false });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const markRead = async (req, res) => {
  try {
    const { account, number, message_ids, last_message } = req.body;

    if (!account || !number || !message_ids) {
      return res.status(400).json({
        success: false,
        message: !account
          ? "Account ID required"
          : !number
          ? "Number required"
          : "Message ID required",
      });
    }

    // Get WhatsApp session
    const { sock } = await getConnection(account);
    if (!sock) {
      return res.status(400).json({
        success: false,
        message: "WhatsApp session not found",
      });
    }

    // Send read receipt
    await sock.sendPresenceUpdate("available", number + "@s.whatsapp.net");
    await sock.readMessages(message_ids);
    await sock.chatModify(
      { markRead: true, lastMessages: [last_message] },
      number + "@s.whatsapp.net"
    );
    await sock.sendPresenceUpdate("unavailable", number + "@s.whatsapp.net");

    res.json({ success: true, message: "Message marked as read" });
  } catch (error) {
    console.error("Error marking message as read:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updatePresence = async (req, res) => {
  try {
    const { account, to, event } = req.body;
    if (!account || !to || !event) {
      if (!account) {
        return res
          .status(400)
          .json({ success: false, message: "Account ID required" });
      }
      if (!to) {
        return res
          .status(400)
          .json({ success: false, message: "Number required" });
      }
      if (!event) {
        return res
          .status(400)
          .json({ success: false, message: "Event required" });
      }
    }
    const { sock } = await getConnection(account);
    if (event === "subscribe") {
      await sock.presenceSubscribe(to + "@s.whatsapp.net");
    } else {
      await sock.sendPresenceUpdate(event, to + "@s.whatsapp.net");
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  checkNumber,
  markRead,
  updatePresence,
};
