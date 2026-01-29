const { Expo } = require("expo-server-sdk");
const expo = new Expo();

async function sendExpoPush(tokens, message) {
  const messages = [];
  for (const pushToken of tokens) {
    if (!Expo.isExpoPushToken(pushToken)) continue;
    messages.push({
      to: pushToken,
      sound: "default",
      title: message.title,
      body: message.body,
      data: message.data || {},
    });
  }

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (e) {
      console.error("Expo push error", e);
    }
  }
}

module.exports = { sendExpoPush };
