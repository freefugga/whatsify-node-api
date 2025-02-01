exports.sendMessage = async (req, res) => {
    try {
        const { account, to, message } = req.body;
        if (!sessions[account]) {
            return res.status(400).json({ error: "Not connected" });
        }

        const sock = sessions[account];
        await sock.sendMessage(to + "@s.whatsapp.net", { text: message });

        return res.json({ message: "Message sent!" }); // Added return to ensure only one response is sent.
    } catch (error) {
        return res.status(500).json({ error: error.message }); // Added return to ensure no multiple responses
    }
};
