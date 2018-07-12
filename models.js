module.exports = db => {
  const endpoints = db.get('endpoints');
  endpoints.createIndex({name: 1}, {unique: true});

  const secrets = db.get('secrets');
  secrets.createIndex({key: 1}, {unique: true});

  const packages = db.get('packages');

  return {
    endpoints,
    secrets,
    packages
  };
};
