# faaslift

[![Build Status](https://travis-ci.org/jantuomi/faaslift.svg?branch=master)](https://travis-ci.org/jantuomi/faaslift)

Small Function as a Service (FaaS) server built with Node.js and MongoDB. Useful for deploying quick endpoint prototypes to your own server.

# Setup

## Server

Clone the repository to your server.

```
git clone https://github.com/jantuomi/faaslift.git
```

Create a file called `.env` in the project directory and add the following fields:

```
MONGODB_URL=<YOUR MONGO URL WITH AUTH>
PORT=<YOUR FAVOURITE HTTP PORT (default 3000)>
PACKAGE_POLL_INTERVAL=<PACKAGE POLL INTERVAL IN MILLISECONDS (default 60000)>
```

A great place to host the Mongo instance is https://mlab.com/.

Start the server with your favourite production grade Node.js runner, e.g. `pm2`.

```
pm2 start index.js --name faaslift
```

## Client

Install the package globally with npm.

```
npm i -g faaslift
```

Run faaslift with `faaslift`. Authorize the CLI with the `authorize <MONGO URL>` command (same URL as on the server).

Create a new endpoint with `create <name>`. Your endpoint is now live at http://your-server/name.

Use `upload <file> <endpoint>` to upload a file from your current working directory to an endpoint. Below is an example of such a file.

```
module.exports = function (req, res, secrets) {
  res.type('text/html');
  res.send(<h1>Hello world!</h1>');
};
```

`req` and `res` are Express objects.

# Developing functions

Implement the following in your function file.

* Export a function (with `module.exports`).
* Use the parameters `req` (request), `res` (response) and optionally, `secrets`.

To test your function, use the `start dev <file>` command in the `faaslift` CLI. Use `stop dev` to stop the server.

To `require` 3rd party libraries, they have to be installed on the host server with NPM.

# Security

`faaslift` relies on MongoDB for user authentication. Please use secure Mongo instance with a username and password set.

The functions are *NOT* containerized in any way! This means that code running at an endpoint is e.g. able to crash the server or manipulate other endpoints, among other evil deeds, with a little bit of tinkering. That's why this project is solely meant for prototyping purposes.

# Author

Jan Tuomi <jans.tuomi@gmail.com>, 2018
