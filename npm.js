const npm = require('npm');
const intercept = require('intercept-stdout');

module.exports = models => {
  const npmLoad = () => new Promise((resolve, reject) => {
    npm.load(err => {
      if (err) {
        reject(err);
      }
      resolve();
    });
  });

  const npmList = () => new Promise((resolve, reject) => {
    const unhookIntercept = intercept(() => '');
    npm.config.set('depth', 0);
    npm.commands.list([], (err, data) => {
      unhookIntercept();
      if (err) {
        reject(err);
      }
      resolve(Object.keys(data._dependencies));
    });
  });

  const npmInstall = packages => new Promise((resolve, reject) => {
    const unhookIntercept = intercept(() => '');
    npm.config.set('progress', 'false');
    npm.config.set('silent', 'true');
    npm.config.set('save', 'false');
    npm.config.set('no-save', 'true');
    npm.commands.install(packages, (err, data) => {
      unhookIntercept();
      if (err) {
        reject(err);
      }
      resolve(data);
    });
  });

  async function installPackagesFromDatabase(showInfo = false) {
    try {
      await npmLoad();
      // Handle errors
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
        // Install module
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

  return {
    npmInstall,
    npmList,
    npmLoad,
    installPackagesFromDatabase
  };
};
