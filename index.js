require('dotenv').config();
const path = require('path');
const chalk = require('chalk');

if (!process.env.MONGO_URL) {
  throw new Error('No MONGO_URL set in .env!');
}

const db = require('monk')(process.env.MONGO_URL);
const express = require('express');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const requireFromString = require('require-from-string');
const models = require('./models')(db);
const {installPackagesFromDatabase} = require('./npm')(models);

app.get('/', async (req, res) => {
  const endpointObjects = await models.endpoints.find({});
  const endpoints = endpointObjects.map(e => e.name);
  res.render('frontpage', {
    endpoints
  });
});

app.all('/:path*', async (req, res) => {
  const path = req.params.path.split('/')[0];
  if (!path || path.length === 0) {
    res.status(400);
    return res.send('Empty endpoint.');
  }

  const endpoint = await models.endpoints.findOne({name: path});
  if (!endpoint) {
    res.status(400);
    return res.send('No such endpoint.');
  }

  const secretsList = await models.secrets.find();
  if (!secretsList) {
    res.status(500);
    return res.send('Failed to fetch secrets from the database.');
  }

  const secrets = secretsList.reduce((prev, cur) => ({
    ...prev,
    [cur.key]: cur.value
  }), {});

  console.info(`${chalk.green(req.path)}, running endpoint "${chalk.yellow(endpoint.name)}".`);
  const {code} = endpoint;
  try {
    const func = requireFromString(code);
    func(req, res, secrets);
  } catch (err) {
    res.status(500);
    console.error(chalk.red(`Error in endpoint ${endpoint.name}! Details below.`));
    console.error(err);
    res.send(err);
  }
});

const packagePollInterval = process.env.PACKAGE_POLL_INTERVAL || 60000; // 1 minute
installPackagesFromDatabase(true);
setInterval(installPackagesFromDatabase, packagePollInterval);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`${chalk.blue('faas')} listening on port ${port}! URL: ${chalk.yellow(`http://localhost:${port}`)}`));
