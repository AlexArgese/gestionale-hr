const express = require('express');
const router = express.Router();

// API per ruoli fissi
router.get('/ruoli', (req, res) => {
  res.json([
    'cassiere',
    'addetto pulizie',
    'manutentore',
    'bagnino',
    'receptionist',
    'cameriere',
    'cuoco',
    'animatore'
  ]);
});

router.get('/sedi', (req, res) => {
    res.json([
      'Aquapark Egnazia',
      'ZooSafari',
      'Hotel Miramonti',
      'Park Hotel Sant\'Elia',
      'Fasanolandia'
    ]);
  });
  

module.exports = router;
