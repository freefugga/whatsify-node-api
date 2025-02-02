const { getConnection } = require("../config/baileys");

exports.checkNumber = async (req, res) => {
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
    const sock = await getConnection(account);

    const [result] = await sock.onWhatsApp(number + "@s.whatsapp.net");
    res.json({ success: true, exists: result?.exists || false });
  } catch (error) {
    res.status(500).json({ success: true, message: error.message });
  }
};
