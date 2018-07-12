#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const monk = require('monk');
const express = require('express');

let serverInstance;
const requireFromString = require('require-from-string');

const userConfigPath = path.join(process.env.HOME, '.faas.config');
require('dotenv').config({
  path: userConfigPath
});

let mongoURL = process.env.MONGO_URL;
let db;
let models;

const chalk = require('chalk');

const vorpal = require('vorpal')();

vorpal.delimiter(chalk.blue('faas $'));

const showMongoNotSetError = v => {
  v.log(chalk.red('MongoDB URL is not set or is invalid. The URL is needed to authorize the CLI.'));
  v.log(chalk.red('Please use the command "authorize <url>" to set the URL.'));
};

const checkConnection = async (url, v) => {
  return new Promise((resolve, reject) => {
    let db;
    try {
      db = monk(url);
    } catch (err) {
      v.log(chalk.red('Failed to authorize the CLI! Please review the Mongo URL.'));
      v.log(chalk.red(String(err)));
      reject(err);
    }

    db.then(async () => {
      models = require('./models')(db);
      await models.endpoints.stats();
      resolve();
    }).catch(err => {
      v.log(chalk.red('Failed to authorize the CLI! Please review the Mongo URL.'));
      v.log(chalk.red(String(err)));
      reject(err);
    });
  });
};

(async function () {
  try {
    await checkConnection(mongoURL, vorpal);
    db = monk(mongoURL);
    models = require('./models')(db);
  } catch (err) {
    showMongoNotSetError(vorpal);
  }
})();

vorpal
  .command('authorize <url>', 'Set the MongoDB URL to authorize the CLI.')
  .action(async function (args, callback) {
    if (!args.url) {
      this.log('Please give the Mongo URL.');
      return callback();
    }

    const row = `MONGO_URL=${args.url}`;
    fs.writeFileSync(userConfigPath, row);

    try {
      await checkConnection(args.url, this);
      this.log(chalk.green('CLI successfully authorized!'));
      mongoURL = args.url;
    } catch (err) {
      mongoURL = null;
    }
  });

vorpal
  .command('create <name>', 'Create new endpoint called "name".')
  .action(async function (args, callback) {
    try {
      await checkConnection(mongoURL, this);
    } catch (err) {
      showMongoNotSetError(vorpal);
      return callback();
    }

    if (!args.name) {
      this.log('Please give a name for the endpoint.');
      return callback();
    }
    try {
      await models.endpoints.insert({
        name: args.name,
        code: `module.exports = function (req, res) { res.send('Hello ${args.name}!') }`
      });
      this.log(`Created endpoint ${args.name}.`);
    } catch (err) {
      this.log(chalk.red('Failed to create endpoint.'));
      if (String(err).includes('E11000')) {
        this.log('Endpoint names must be unique.');
      } else {
        this.log(String(err));
      }
    }
    callback();
  });

vorpal
  .command('remove <name>', 'Remove endpoint called "name".')
  .action(async function (args, callback) {
    try {
      await checkConnection(mongoURL, this);
    } catch (err) {
      showMongoNotSetError(vorpal);
      return callback();
    }

    if (!args.name) {
      this.log('Please give a name for the endpoint.');
      return callback();
    }
    try {
      await models.endpoints.remove({
        name: args.name
      });
    } catch (err) {
      this.log(chalk.red(`Failed to remove endpoint ${args.name}!`));
      this.log(chalk.red(String(err)));
    }
    this.log(`Removed endpoint ${args.name}.`);
    callback();
  });

vorpal
  .command('list', 'List all endpoints.')
  .action(async function (args, callback) {
    try {
      await checkConnection(mongoURL, this);
    } catch (err) {
      showMongoNotSetError(vorpal);
      return callback();
    }

    const endpoints = await models.endpoints.find({});
    endpoints.forEach(endpoint => {
      this.log(`${chalk(endpoint.name)}`);
    });
    callback();
  });

vorpal
  .command('upload <file> <endpoint>', 'Upload "file" to endpoint "endpoint".')
  .action(async function (args, callback) {
    try {
      await checkConnection(mongoURL, this);
    } catch (err) {
      showMongoNotSetError(vorpal);
      return callback();
    }

    if (!args.file || !args.endpoint) {
      this.log('Please provide both "file" and "endpoint" as arguments.');
      return callback();
    }

    const existing = await models.endpoints.findOne({name: args.endpoint});
    if (!existing) {
      this.log(chalk.red(`Endpoint ${args.endpoint} doesn't exist!`));
      return callback();
    }

    try {
      this.log(chalk.yellow(`Uploading function from file "${args.file}"...`));
      const data = fs.readFileSync(path.join(process.cwd(), args.file), 'utf-8');
      await models.endpoints.update(
        {name: args.endpoint},
        {code: data, name: args.endpoint},
        {upsert: true});
      this.log(chalk.green(`Uploaded function successfully to endpoint ${args.endpoint}!`));
    } catch (err) {
      this.log(chalk.red(`Failed to upload to endpoint ${args.endpoint}!`));
      this.log(chalk.red(String(err)));
    }
    callback();
  });

vorpal
  .command('start dev <file>', 'Run a function locally for development purposes.')
  .action(async function (args, callback) {
    if (!args.file) {
      this.log('Please provide the "file" to run.');
      return callback();
    }
    const code = fs.readFileSync(path.join(process.cwd(), args.file), 'utf-8');
    if (serverInstance) {
      serverInstance.close();
    }
    const app = express();
    const func = requireFromString(code);
    app.all('*', async (req, res) => {
      func(req, res);
    });
    const port = 1337;
    serverInstance = app.listen(port, () =>
      this.log(`${chalk.yellow('Debug server')} listening on port ${port}! URL: ${chalk.yellow(`http://localhost:${port}`)}`)
    );
    callback();
  });

vorpal
  .command('stop dev', 'Stop the development server.')
  .action(async function (args, callback) {
    if (serverInstance) {
      serverInstance.close();
      this.log(`${chalk.yellow('Debug server')} stopped.`);
    } else {
      this.log(chalk.red('Debug server is not running.'));
    }
    callback();
  });

vorpal
  .command('secret set <key> <value>', 'Set a secret key value pair.')
  .action(async function (args, callback) {
    try {
      await checkConnection(mongoURL, this);
    } catch (err) {
      showMongoNotSetError(vorpal);
      return callback();
    }

    if (!args.key || !args.value) {
      this.log('Please provide both "key" and "value" arguments.');
      return callback();
    }

    try {
      await models.secrets.update(
        {key: args.key},
        {key: args.key, value: args.value},
        {upsert: true});
      this.log(chalk.green(`Secret "${args.key}" set successfully.`));
    } catch (err) {
      this.log(chalk.red(`Failed to set secret ${args.key}!`));
      this.log(chalk.red(String(err)));
    }
    callback();
  });

vorpal
  .command('secret remove <key>', 'Remove a secret key value pair.')
  .action(async function (args, callback) {
    try {
      await checkConnection(mongoURL, this);
    } catch (err) {
      showMongoNotSetError(vorpal);
      return callback();
    }

    if (!args.key) {
      this.log('Please provide the "key" argument.');
      return callback();
    }

    try {
      await models.secrets.remove({key: args.key});
      this.log(chalk.green(`Secret "${args.key}" removed successfully.`));
    } catch (err) {
      this.log(chalk.red(`Failed to remove secret ${args.key}!`));
      this.log(chalk.red(String(err)));
    }
    callback();
  });

vorpal
  .command('package install <package>', `Install an NPM package on the host.`)
  .action(async function (args, callback) {
    try {
      await checkConnection(mongoURL, this);
    } catch (err) {
      showMongoNotSetError(vorpal);
      return callback();
    }

    if (!args.package) {
      this.log('Please provide the "package" argument.');
      return callback();
    }

    try {
      await models.packages.insert({
        name: args.package
      });
      this.log(chalk.green(`Package "${args.package}" added successfully to list of packages to install.`));
    } catch (err) {
      this.log(chalk.red(`Failed to add package ${args.package} to list of packages to install!`));
      this.log(chalk.red(String(err)));
    }
    callback();
  });

vorpal
  .command('info', 'Show information about the session')
  .action(async function (args, callback) {
    this.log('Mongo URL: ' + chalk.yellow(mongoURL));
    callback();
  });

vorpal.show();
