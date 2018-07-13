require('dotenv').config();
const path = require('path');
const chalk = require('chalk');
const npm = require('npm');
const intercept = require('intercept-stdout');

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
    res.send(err);
  }
});

const npmLoad = () => new Promise((resolve, reject) => {
  npm.load(function(err) {
    if (err) {
      reject(err);
    }

    npm.on('log', function(message) {
      // log installation progress
      //console.log(message);
    });
    resolve();
  });
});

const npmList = () => new Promise((resolve, reject) => {
  const unhook_intercept = intercept(txt => "");
  npm.config.set('depth', 0);
  npm.commands.list([], function(err, data) {
    unhook_intercept();
    if (err) {
      reject(err);
    }
    resolve(Object.keys(data._dependencies));
  });
});

const npmInstall = (packages) => new Promise((resolve, reject) => {
  const unhook_intercept = intercept(txt => '');
  npm.config.set('progress', 'false');
  npm.config.set('silent', 'true');
  npm.commands.install(packages, function(err, data) {
    unhook_intercept();
    if (err) {
      reject(err);
    }
    resolve(data);
  });
});

async function installPackagesFromDatabase(showInfo = false) {
  try {
    await npmLoad();
    // handle errors
    const packagesToInstall = await models.packages.find({});
    const packages = packagesToInstall.map(obj => obj.name.trim());

    const installedPackages = await npmList();

    packages.forEach(async pkg => {
      if (installedPackages.some(installedPkg => installedPkg.includes(pkg))) {
        if (showInfo) {
          console.info(`"${pkg}" Already installed, skipping...`);
        }
        return;
      }
      console.info(`Installing package "${pkg}"...`);
      // install module
      await npmInstall([pkg]);
    });
    if (showInfo) {
      console.info(`Successfully installed ${packages.length} NPM packages programmatically.`);
    }
  } catch (err) {
    console.error(`Failed to install NPM packages programmatically.`);
    console.error(err);
  }
}

const packagePollInterval = process.env.PACKAGE_POLL_INTERVAL || 60000; // 1 minute
installPackagesFromDatabase(true);
setInterval(installPackagesFromDatabase, packagePollInterval);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`${chalk.blue('faas')} listening on port ${port}! URL: ${chalk.yellow(`http://localhost:${port}`)}`));
