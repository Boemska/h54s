const fs = require('fs');
const path = require('path');

const methodUtils = require(path.join(__dirname, '../../..', 'src/methods/utils.js'));

module.exports = function() {
  return new Promise((resolve, reject) => {
    fs.readFile(path.join(__dirname, '..', 'generated.sas'), (err, data) => {
      if(err) {
        return reject(err);
      }

      const matches = [];
      const patt = /DATA[^1|0]=(\[.*\])/gm;

      let match;
      while(match = patt.exec(data.toString())) {
        matches.push(match[1]);
      }

      resolve(matches.map(val => {
        return methodUtils.unescapeValues(JSON.parse(val));
      }).reduce((prev, cur) => {
        return prev.concat(cur);
      }));
    });
  });
}
