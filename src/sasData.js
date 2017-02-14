var h54sError = require('./error.js');
var logs      = require('./logs.js');
var Tables    = require('./tables/tables.js');
var Files     = require('./files/files.js');

/*
* h54s SAS data object constructor
* @constructor
*
*@param {array|file} data - Table or file added when object is created
*@param {string} macroName - macro name
*@param {number} parameterThreshold - size of data objects sent to SAS
*
*/
function SasData(data, macroName) {
  if(data instanceof Array) {
    this._files = {};
    this.addTable(data, macroName);
  } else if(data instanceof File) {
    Files.call(this, data, macroName);
  } else {
    throw new h54sError('argumentError', 'Data argument wrong type or missing');
  }
}

/*
* Add table to tables object
* @param {array} table - Array of table objects
* @param {string} macroName - Sas macro name
*
*/
SasData.prototype.addTable = function(table, macroName) {
  if(table && macroName) {
    if(!(table instanceof Array)) {
      throw new h54sError('argumentError', 'First argument must be array');
    }
    if(typeof macroName !== 'string') {
      throw new h54sError('argumentError', 'Second argument must be string');
    }
    if(!isNaN(macroName[macroName.length - 1])) {
      throw new h54sError('argumentError', 'Macro name cannot have number at the end');
    }
  } else {
    throw new h54sError('argumentError', 'Missing arguments');
  }

  if (typeof table !== 'object' || !(table instanceof Array)) {
    throw new h54sError('argumentError', 'Table argument is not an array');
  }

  var spec = {},
      i, j, //counters used latter in code
      specialChars = ['"', '\\', '/', '\n', '\t', '\f', '\r', '\b'];

  //going backwards and removing empty rows
  for (i = table.length - 1; i >= 0; i--) {
    var row = table[i];

    if(typeof row !== 'object') {
      throw new h54sError('argumentError', 'Table item is not an object');
    }

    for(var key in row) {
      if(row.hasOwnProperty(key)) {
        var val  = row[key];
        var type = typeof val;

        if(row[key] === null || row[key] === undefined) {
          delete row[key];
          continue;
        }

        if(type === 'number' && isNaN(val)) {
          throw new h54sError('typeError', 'NaN value in one of the values (columns) is not allowed');
        }
        if(val === -Infinity || val === Infinity) {
          throw new h54sError('typeError', val.toString() + ' value in one of the values (columns) is not allowed');
        }
        if(val === true || val === false) {
          throw new h54sError('typeError', 'Boolean value in one of the values (columns) is not allowed');
        }

        if(spec[key] === undefined) {
          spec[key] = {};

          if (type === 'number') {
            if(val < Number.MIN_SAFE_INTEGER || val > Number.MAX_SAFE_INTEGER) {
              logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
            }
            spec[key].colType   = 'num';
            spec[key].colLength = 8;
          } else if (type === 'string' && !(val instanceof Date)) { // straightforward string
            spec[key].colType    = 'string';
            spec[key].colLength  = val.length;
            for(j = 0; j < val.length; j++) {
              if(specialChars.indexOf(val[j]) !== -1) {
                spec[key].colLength++;
              }
            }
          } else if(val instanceof Date) {
            spec[key].colType   = 'date';
            spec[key].colLength = 8;
          } else if (type === 'object') {
            spec[key].colType   = 'json';
            spec[key].colLength = JSON.stringify(val).length;
          }
        } else if ((type === 'number' && spec[key].colType !== 'num') ||
          (type === 'string' && !(val instanceof Date) && spec[key].colType !== 'string') ||
          (val instanceof Date && spec[key].colType !== 'date') ||
          (type === 'object' && spec[key].colType !== 'json'))
        {
          throw new h54sError('typeError', 'There is a type mismatch in the array between values (columns) of the same name.');
        }
      }
    }

    //delete row if it's empty
    if(Object.keys(row).length === 0) {
      table.splice(i, 1);
    }
  }

  //convert spec to csv with pipes
  var specString = Object.keys(spec).map(function(key) {
    return key + ',' + spec[key].colType + ',' + spec[key].colLength;
  }).join('|');

  var sasJson = JSON.stringify(table);
  this._files[macroName] = [
    specString,
    new File([sasJson], 'table.json', {type: 'text/plain;charset=UTF-8'})
  ];
};

SasData.prototype.addFile  = function(file, macroName) {
  Files.prototype.add.call(this, file, macroName);
};

module.exports = SasData;
