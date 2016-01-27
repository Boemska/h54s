"use strict";

var chance = require('chance').Chance();
var fs = require('fs');

var tableUtils = require('../../../src/tables/utils.js');

module.exports = function (settings) {
  return new Promise((resolve, reject) => {
    var tableArray = [];
    var table = [];
    var row = {};

    if(isNaN(settings.columns)) {
      for(let i = 0; i < settings.columns.length; i++) {
        if(settings.columns[i].toLowerCase() === 'n') {
          //random int or float
          if(chance.bool()) {
            row['PROP'+i] = chance.integer();
          } else {
            row['PROP'+i] = chance.floating();
          }
        } else if(settings.columns[i].toLowerCase() === 'd') {
          row['DT_PROP'+i] = chance.date();
        } else if(settings.columns[i].toLowerCase() === 's') {
          row['PROP'+i] = chance.string({length: settings.varLength});
        }
      }
    }

    for(let i = 0; i < settings.rows; i++) {
      table.push(row);
    }

    var converted = tableUtils.convertTableObject(table);
    tableArray.push(JSON.stringify(converted.spec));
    for (var numberOfTables = 0; numberOfTables < converted.data.length; numberOfTables++) {
      var outString = JSON.stringify(converted.data[numberOfTables]);
      tableArray.push(outString);
    }

    var written = 0;
    fs.writeFile('../generated.sas', `%LET DATA0=${tableArray.length};\n`);
    for(let i = 0; i < tableArray.length; i++) {
      fs.appendFile('../generated.sas', `%LET DATA${i+1}=${tableArray[i]};\n`, (err) => {
        if(err) {
          reject(err);
        } else {
          if(++written === tableArray.length) {
            resolve(table);
          }
        }
      });
    }

    fs.writeFile('../settings.json', JSON.stringify(settings));
  });
}
