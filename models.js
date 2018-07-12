module.exports = db => {
  const endpoints = db.get('endpoints');
  endpoints.createIndex({ name: 1 }, { unique: true });

  return {
    endpoints,
  };
}
