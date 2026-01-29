const admin = require('firebase-admin');
const serviceAccount = require('./gestionale-hr-firebase-adminsdk-fbsvc-a75d908a77.json'); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
