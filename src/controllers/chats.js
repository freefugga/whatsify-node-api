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
    res.status(500).json({ success: true, message: error.message });
  }
};

const markRead = async (req, res) => {
  try {
    const { account, number, message_id } = req.body;

    if (!account || !number || !message_id) {
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
    await sock.sendReadReceipt(
      number + "@s.whatsapp.net", // Chat JID
      undefined, // Participant (optional, only for groups)
      [message_id] // Message ID
    );

    res.json({ success: true, message: "Message marked as read" });
  } catch (error) {
    console.error("Error marking message as read:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updatePresence = async (req, res) => {
  try {
    const { account, status } = req.body;
    if (!account || !status) {
      if (!account) {
        return res
          .status(400)
          .json({ success: false, message: "Account ID required" });
      }
      if (!status) {
        return res
          .status(400)
          .json({ success: false, message: "Status required" });
      }
    }
    const { sock } = await getConnection(account);

    await sock.sendPresenceUpdate(status);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: true, message: error.message });
  }
};

module.exports = { checkNumber, markRead, updatePresence };
