const app = require("./src/config/app");
const routes = require("./src/routes");
const dotenv = require("dotenv");
dotenv.config();

const { restoreSessions } = require("./src/config/baileys");

app.use("/call", routes);

restoreSessions();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

process.on("unhandledRejection", (err) => {
  console.error(err);
});

process.on("uncaughtException", (err) => {
  console.error(err);
});
