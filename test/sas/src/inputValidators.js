const fs = require('fs');
const os = require('os');

module.exports.numberValidator = function (input) {
  if(isNaN(input)) {
    return 'You need to provide a number';
  } else {
    return true;
  }
}

module.exports.pathValidator = function (input) {
  input = input.trim().replace('~', os.homedir());
  try {
    let stat = fs.lstatSync(input.replace('~', os.homedir()));
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

module.exports.chunkValidator = function (input) {
  if(isNaN(input)) {
    return 'This value needs to be a number';
  }
  if(input > 32767) {
    return 'This number must be less than 32767';
  }
  if(input < 50) {
    return 'This number must be greater than 50';
  }
 return true;
}
