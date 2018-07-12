require('dotenv').config();
const chalk = require('chalk');

if (!process.env.MONGO_URL) {
  throw new Error('No MONGO_URL set in .env!');
}

const db = require('monk')(process.env.MONGO_URL);
const models = require('./models')(db);
const express = require('express');
const app = express();
const requireFromString = require('require-from-string');

app.all('*', async (req, res) => {
  const path = req.path.split('/')[1];
  if (!path || path.length === 0) {
    res.status(400);
    res.send('Empty endpoint.');
  }

  const endpoint = await models.endpoints.findOne({ name: path });
  if (!endpoint) {
    res.status(400);
    res.send('No such endpoint.');
  }

  console.info(`${chalk.green(req.path)}, running endpoint "${chalk.yellow(endpoint.name)}".`);
  const code = endpoint.code;
  try {
    const func = requireFromString(code);
    const output = func(req, res);
  } catch (err) {
    res.status(500);
    console.error(chalk.red(`Error in endpoint ${endpoint.name}! Details below.`));
    console.error(err);
    res.send('Internal server error.');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`${chalk.blue('faas')} listening on port ${port}! URL: ${chalk.yellow(`http://localhost:${port}`)}`));
