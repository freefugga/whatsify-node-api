const { getConnection } = require("../config/baileys");

exports.checkNumber = async (req, res) => {
    try {
        const { account, number } = req.body;
        const sock = await getConnection(account);

        const [result] = await sock.onWhatsApp(number + "@s.whatsapp.net");
        res.json({ exists: result?.exists || false });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

