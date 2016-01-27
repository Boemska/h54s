#! /usr/bin/env node
"use strict";

var inquirer = require('inquirer');
var fs = require('fs');
var suspend = require('suspend');
var methodUtils = require('../../src/methods/utils.js');

var inputValidators = require('./inputValidators.js');
var generator = require('./generator.js');
var executor = require('./executor.js');
var sasReader = require('./sasReader.js');

var argv = require('minimist')(process.argv.slice(2));
if(argv.log) {
  fs.mkdir('log', () => {
    fs.writeFile('log/compare.log', '');
  });
}

try {
  fs.statSync(__dirname + '/settings.json'); //throws an error if the file does not exist
  inquirer.prompt([{
    type: 'confirm',
    name: 'useSettings',
    message: 'Use settings.json - previous values',
    default: true
  }, {
    type: 'confirm',
    name: 'useOldGeneratedFile',
    message: 'Use old generated.sas (do not create new)',
    default: true
  }], (answers) => {
    if(answers.useSettings) {
      var values = require(__dirname + '/settings.json');
      suspend(run(values, answers.useOldGeneratedFile))();
    } else {
      getUserInput().then((values) => {
        suspend(run(values, answers.useOldGeneratedFile))();
      }).catch(handleError);
    }
  });
} catch(e) {
  getUserInput().then((values) => {
    suspend(run(values))();
  }).catch(handleError);
}

function run(values, useOldGeneratedFile) {
  return function*() {
    var gt;

    if(useOldGeneratedFile) {
      gt = yield sasReader();
    } else {
      gt = yield generator(values);
    }

    var data = yield executor(values.execFile);

    if(argv.log) {
      fs.writeFile('log/sas-out.log', data.out);
      fs.writeFile('log/sas-err.log', data.err);
    }
    try {
      var resObj = JSON.parse(data.out.replace(/(\r\n|\r|\n)/g, ''));
      resObj = methodUtils.convertDates(resObj);
      resObj = methodUtils.unescapeValues(resObj);

      var uniform = compare(resObj.bounced, gt);
      if(uniform === true) {
        console.log('Whoohooo - SAS returned the same data');
      } else {
        //it's objectx
        console.log(uniform);
      }
    } catch(e) {
      console.log(e.stack);
    }
  }
}

function compare(response, generated) {
  if(response.length !== generated.length) {
    return 'Number of rows is not the same';
  }
  //compare number of properties/columns
  if(Object.keys(response[0]).length !== Object.keys(generated[0]).length) {
    return 'Number of columns is not the same';
  }
  for(let i = 0; i < response.length; i++) {
    for(let key in response[i]) {
      if(generated[i][key] instanceof Date) {
        //check if milliseconds difference is greater than 1000 because sas is rounding the value to seconds
        if(argv.log) {
          fs.appendFile('log/compare.log', `row ${i}, column ${key}\ngenerated: ${generated[i][key].getTime()}, response: ${response[i][key].getTime()}\n\n`);
        }

        if(Math.abs(generated[i][key].getTime() - response[i][key].getTime()) > 1000) {
          return `Value is different in row ${i}\ncolumn ${key}\n\ngenerated: ${generated[i][key].getTime()}\nresponse: ${response[i][key].getTime()}\n`;
        }
      } else {
        if(argv.log) {
          fs.appendFile('log/compare.log', `row ${i}, column ${key}\ngenerated: ${generated[i][key]}, response: ${response[i][key]}\n\n`);
        }

        if(response[i][key] !== generated[i][key]) {
          return `Value is different in row ${i}\ncolumn ${key}\n\ngenerated: ${generated[i][key]}\nresponse: ${response[i][key]}\n`;
        }
      }
    }
  }
  return true;
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
        name: 'execFile',
        message: 'Executable path',
        validate: inputValidators.pathValidator
      }
    ], (answers) => {
      resolve(answers);
    });
  });
}
