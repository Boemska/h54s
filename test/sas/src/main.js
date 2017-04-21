#! /usr/bin/env node
"use strict";

var inquirer = require('inquirer');
var fs = require('fs');
var suspend = require('suspend');
var readline = require('readline');
var clc = require('cli-color');
var rl = readline.createInterface({
  output: process.stdout,
  input: process.stdin
});
var chance = require('chance').Chance();
var path = require('path');
var methodUtils = require('../../../src/methods/utils.js');

var inputValidators = require('./inputValidators.js');
var generator = require('./generator.js');
var executor = require('./executor.js');
var sasReader = require('./sasReader.js');

var argv = require('minimist')(process.argv.slice(2));
if(argv.log) {
  let logDir = path.join(__dirname, '..', 'log');
  if(!fs.existsSync(logDir)) {
    fs.mkdir(logDir);
  }
}

try {
  fs.statSync(path.join(__dirname, '..', 'settings.json')); //throws an error if the file does not exist
  inquirer.prompt([{
    type: 'confirm',
    name: 'useSettings',
    message: 'Use settings.json - previous values',
    default: true
  }], answers => {
    if(answers.useSettings) {
      inquirer.prompt([{
        type: 'confirm',
        name: 'useOldGeneratedFile',
        message: 'Use old generated.sas (do not create new)',
        default: true
      }], answers => {
        var values = require(path.join(__dirname, '..', 'settings.json'));
        suspend(run(values, answers.useOldGeneratedFile))();
      });
    } else {
      getUserInput().then((values) => {
        suspend(run(values))();
      }).catch(handleError);
    }
  });
} catch(e) {
  getUserInput().then((values) => {
    suspend(run(values))();
  }).catch(handleError);
}

function run(values, useOldGeneratedFile) {
  //convert number of columns to string of column types
  if(!isNaN(values.columns)) {
    let columns = '';
    for(let i = 0; i < values.columns; i++) {
      columns += chance.character({pool: 'NDS'});
    }
    values.columns = columns;
  }

  if(argv.log) {
    var compareStream = fs.createWriteStream(path.join(__dirname, '..', 'log', 'compare.log'));
  }

  return function*() {
    var gt;

    try {
      if(useOldGeneratedFile) {
        gt = yield sasReader();
      } else {
        gt = yield generator(values);
      }

      var data = yield executor(values.execFile, argv.log);

      var resJson = /--h54s-data-start--([\S\s]*)--h54s-data-end--/.exec(data.out.replace(/(\r\n|\r|\n)/g, ''));
      var resObj = JSON.parse(resJson[1]);
      resObj = methodUtils.convertDates(resObj);
      resObj = methodUtils.unescapeValues(resObj);

      var lineStr = '';
      for(let compareRes of compare(resObj.bounced, gt)) {
        //new row
        if(compareRes.col === 0 && compareRes.row !== 0) {
          rl.write('\n');
          lineStr = '';
        }

        if(compareRes.diff === true) {
          if(argv.log) {
            compareStream.write(compareRes.message + '\n\n');
          }
          lineStr += ` ${clc.red(values.columns[compareRes.col])}`;
        } else {
          lineStr += ` ${values.columns[compareRes.col]}`;
        }

        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        rl.write(lineStr);
      }
      rl.write('\n\n');

      rl.write(`Startup Time: ${data.startupTime}ms\n`);
      rl.write(`Read Time: ${data.readTime}ms\n`);
      rl.write(`Parse Time: ${data.parseTime}ms\n`);
      rl.write(`Output Time: ${data.outputTime}ms\n`);
      rl.close();

    } catch(e) {
      console.log(e.stack);
    }
  }
}

function* compare(response, generated) {
  if(response.length !== generated.length) {
    return 'Number of rows is not the same';
  }
  //compare number of properties/columns
  if(Object.keys(response[0]).length !== Object.keys(generated[0]).length) {
    return 'Number of columns is not the same';
  }
  for(let i = 0; i < response.length; i++) {
    var j = 0;
    for(let key in response[i]) {
      if(generated[i][key] instanceof Date) {
        //check if milliseconds difference is greater than 1000 because sas is rounding the value to seconds
        if(Math.abs(generated[i][key].getTime() - response[i][key].getTime()) > 1000) {
          yield {
            diff: true,
            message: `row ${i}, column ${key}(${j})\ngenerated: ${generated[i][key].getTime()}, response: ${response[i][key].getTime()}`,
            row: i,
            col: j
          };
        } else {
          yield {
            diff: false,
            row: i,
            col: j
          };
        }
      } else {
        if(response[i][key] !== generated[i][key]) {
          yield {
            diff: true,
            message: `row ${i}, column ${key}(${j})\ngenerated: ${generated[i][key]}, response: ${response[i][key]}`,
            row: i,
            col: j
          };
        } else {
          yield {
            diff: false,
            row: i,
            col: j
          };
        }
      }
      j++;
    }
  }
}

function handleError(err) {
  console.log(err);
  console.log(err.stack);
}

function getUserInput() {
  return new Promise((resolve, reject) => {
    inquirer.prompt([
      {
        type: 'input',
        name: 'columns',
        message: 'Random table width (# of columns), or string with data types (more in readme)',
        validate: inputValidators.numberOrDataTypesValidator
      }, {
        type: 'input',
        name: 'varLength',
        message: 'Random table width (string variable length)',
        validate: inputValidators.numberValidator
      }, {
        type: 'input',
        name: 'rows',
        message: 'Random table height (# of rows)',
        validate: inputValidators.numberValidator
      }, {
        type: 'input',
        name: 'chunkSize',
        message: 'Parameter Chunk Size (min 50, max 32767)',
        validate: inputValidators.chunkValidator
      }, {
        type: 'input',
        name: 'execFile',
        message: 'Executable path',
        validate: inputValidators.pathValidator
      }
    ], (answers) => {
      resolve(answers);
    });
  });
}
