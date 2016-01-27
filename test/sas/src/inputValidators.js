var fs = require('fs');
var os = require('os');

module.exports.numberValidator = function (input) {
  if(isNaN(input)) {
    return 'You need to provide a number';
  } else {
    return true;
  }
}

module.exports.pathValidator = function (input) {
  input = input.replace('~', os.homedir());
  try {
    var stat = fs.lstatSync(input.replace('~', os.homedir()));
    return stat.isFile() || 'Invalid path';
  } catch(e) {
    return 'Invalid path';
  }
}

module.exports.numberOrDataTypesValidator = function(input) {
  if(!isNaN(input)) {
    return true;
  } else {
    if(typeof input !== 'string') {
      return 'You need to provide number or string';
    }
    return /^(d|s|n)+$/.test(input.toLowerCase());
  }
}
