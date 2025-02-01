const axios = require("axios");

// Function to notify Laravel backend about connection status (connected/disconnected)
const sendDataToFrontend = async (uuid, status) => {
  try {
    const response = await axios.post(
      "https://your-laravel-api.com/api/wa-server/data",
      {
        uuid: uuid,
        status: status, // 'connected' or 'disconnected'
      }
    );

    if (response.status === 200) {
      console.log(
        `Successfully notified Laravel about ${status} status for UUID: ${uuid}`
      );
    } else {
      console.error(
        `Failed to notify Laravel about ${status} status for UUID: ${uuid}`
      );
    }
  } catch (error) {
    console.error(`Error notifying Laravel about connection status: ${error}`);
  }
};

module.exports = { sendDataToFrontend };
