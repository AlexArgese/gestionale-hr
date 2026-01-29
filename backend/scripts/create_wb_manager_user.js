require('dotenv').config();
const admin = require('../firebase-admin');

(async () => {
  try {
    const email = 'alexealiceegino@gmail.com';
    const password = 'Prova!123456'; // cambia dopo il test
    const displayName = 'Avvocato Prova';
    const user = await admin.auth().createUser({ email, password, displayName });
    console.log('✅ Firebase user creato:', user.uid, email);
    process.exit(0);
  } catch (e) {
    console.error('❌ createUser error:', e.message);
    process.exit(1);
  }
})();
