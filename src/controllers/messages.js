const { getConnection } = require("../config/baileys");

exports.sendMessage = async (req, res) => {
  try {
    const { account, to, message } = req.body;
    console.log(req.body);

    const session = await getConnection(account, null);

    if (!session || !session.sock) {
      return res.status(400).json({ error: "Not connected" });
    }

    const sock = session.sock;

    if (sock.ws.readyState !== sock.ws.OPEN) {
      return res.status(400).json({ error: "WebSocket is not open" });
    }

    // Ensure the message sending part works
    const response = await sock.sendMessage(to + "@s.whatsapp.net", {
      text: message,
    });
    console.log("Message sent response:", response);

    return res.json({ message: "Message sent!" });
  } catch (error) {
    console.error("Error in sending message:", error); // Log the error to see more details
    return res.status(500).json({ error: error.message });
  }
};
