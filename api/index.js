// Vercel serverless entry point — re-exports the Express app.
// server.js skips app.listen() when process.env.VERCEL is set,
// so requiring it here is safe (no port binding in serverless).
module.exports = require('../server');
