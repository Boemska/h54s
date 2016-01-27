var fs = require('fs');

module.exports = function() {
  return new Promise((resolve, reject) => {
    fs.readFile('generated.sas', (err, data) => {
      if(err) {
        return reject(err);
      }

      var patt = /DATA[^1|0]=(\[.*\])/gm;
      var matches = patt.exec(data.toString());
      matches.shift();

      resolve(matches.map(val => {
        return JSON.parse(val);
      }).reduce((prev, cur) => {
        return prev.concat(cur);
      }));
    });
  });
}
