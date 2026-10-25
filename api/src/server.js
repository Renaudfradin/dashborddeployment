'use strict';

require('dotenv').config();
const { createApp } = require('./app');

const port = Number(process.env.PORT || 8000);
const app = createApp();

app.listen(port, '0.0.0.0', () => {
  console.log(`API à l’écoute sur ${port}`);
});
