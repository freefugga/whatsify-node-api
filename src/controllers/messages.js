const { xmppPreKey } = require("baileys");
const { getConnection } = require("../config/baileys");

exports.sendMessage = async (req, res) => {
  try {
    const { account, to, message } = req.body;
    console.log(req.body);
    const formattedNumber=to.replace(/\+/g, "")
    const session = await getConnection(account, null);

    console.log(session);
    if (!session || !session.sock) {
      return res.status(400).json({ error: "Not connected" });
    }

    const sock = session.sock;

    if (sock.ws.readyState !== sock.ws.OPEN) {
      return res.status(400).json({ error: "WebSocket is not open" });
    }
//check number is on whatsapp
    const result = await sock.onWhatsApp(formattedNumber);
    console.log(result)
    if (result.length > 0) {
      //if yes pluck jid to send message
      const jid=result[0].jid
      const response = await sock.sendMessage(
        jid,
        {
          text: message,
        }
      );


      console.log(`✅ Number ${to} WhatsApp pe available hai.`);
      console.log("Message sent response:", response);
    } else {
      console.log(`❌ Number ${to} WhatsApp pe available nahi hai.`);
      return res.json({ message: "Receiver is not on WhatsApp" });
    }
   

    return res.json({ message: "Message sent!" });
  } catch (error) {
    console.error("Error in sending message:", error); // Log the error to see more details
    return res.status(500).json({ error: error.message });
  }
};
