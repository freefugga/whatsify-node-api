const app = require("./src/config/app");
const routes = require("./src/routes");

const { restoreSessions } = require("./src/config/baileys");

app.use("/api", routes);

restoreSessions();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
