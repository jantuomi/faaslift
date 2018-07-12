require('dotenv').config();
const path = require('path');
const chalk = require('chalk');
const npm = require('npm-programmatic');

if (!process.env.MONGO_URL) {
  throw new Error('No MONGO_URL set in .env!');
}

const db = require('monk')(process.env.MONGO_URL);
const express = require('express');

const app = express();
const requireFromString = require('require-from-string');
const models = require('./models')(db);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/frontpage.html'));
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
    res.send('Internal server error.');
  }
});

(async function () {
  try {
    const packagesToInstall = await models.packages.find({});
    const packages = packagesToInstall.map(obj => obj.name);

    packages.forEach(async pkg => {
      console.info(`Installing package "${pkg}"...`);
      await npm.install([pkg], {
        cwd: __dirname,
        save: false
      });
    });
    console.info(`Successfully installed ${packages.length} NPM packages programmatically.`);
  } catch (err) {
    console.error(`Failed to install NPM packages programmatically.`);
    console.error(err);
  }
})();

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`${chalk.blue('faas')} listening on port ${port}! URL: ${chalk.yellow(`http://localhost:${port}`)}`));
