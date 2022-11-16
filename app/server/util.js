/* jshint esversion: 6, asi: true, node: true */
// util.js

let defaultCredentials = { username: null, password: null, privatekey: null };

exports.setDefaultCredentials = function setDefaultCredentials({
  name: username,
  password,
  privatekey,
  overridebasic,
}) {
  defaultCredentials = { username, password, privatekey, overridebasic };
};

exports.basicAuth = function basicAuth(req, res, next) {
  const { username, password, privatekey } = defaultCredentials;
  req.session.username = username;
  req.session.userpassword = password;
  req.session.privatekey = privatekey;
  next();
};

// takes a string, makes it boolean (true if the string is true, false otherwise)
exports.parseBool = function parseBool(str) {
  return str.toLowerCase() === 'true';
};
