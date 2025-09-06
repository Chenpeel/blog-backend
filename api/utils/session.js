const { v4: uuidv4 } = require("uuid");

function generateSessionId() {
  return uuidv4();
}

async function resetSession(oldSessionId) {
  return generateSessionId();
}

module.exports = {
  generateSessionId,
  resetSession,
};
