var h54sError = require('./error.js');
var logs      = require('./logs.js');
var Tables    = require('./tables/tables.js');
var Files     = require('./files/files.js');
var toSasDateTime = require('./tables/utils.js').toSasDateTime;

/*
* h54s SAS data object constructor
* @constructor
*
*@param {array|file} data - Table or file added when object is created
*@param {string} macroName - macro name
*@param {number} parameterThreshold - size of data objects sent to SAS
*
*/
function SasData(data, macroName, specs) {
  if(data instanceof Array) {
    this._files = {};
    this.addTable(data, macroName, specs);
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
SasData.prototype.addTable = function(table, macroName, specs) {
  var isSpecsProvided = !!specs;
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

  var key;
  if(specs) {
    if(specs.constructor !== Object) {
      throw new h54sError('argumentError', 'Specs data type wrong. Object expected.');
    }
    for(key in table[0]) {
      if(!specs[key]) {
        throw new h54sError('argumentError', 'Missing columns in specs data.');
      }
    }
    for(key in specs) {
      if(specs[key].constructor !== Object) {
        throw new h54sError('argumentError', 'Wrong column descriptor in specs data.');
      }
      if(!specs[key].colType || !specs[key].colLength) {
        throw new h54sError('argumentError', 'Missing columns in specs descriptor.');
      }
    }
  }

  if(!specs) {
    specs = {};
  }
  var i, j, //counters used latter in code
      specialChars = ['"', '\\', '/', '\n', '\t', '\f', '\r', '\b'];

  //going backwards and removing empty rows
  for (i = table.length - 1; i >= 0; i--) {
    var row = table[i];

    if(typeof row !== 'object') {
      throw new h54sError('argumentError', 'Table item is not an object');
    }

    for(key in row) {
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

        if(specs[key] === undefined) {
          specs[key] = {};

          if (type === 'number') {
            if(val < Number.MIN_SAFE_INTEGER || val > Number.MAX_SAFE_INTEGER) {
              logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
            }
            specs[key].colType   = 'num';
            specs[key].colLength = 8;
          } else if (type === 'string' && !(val instanceof Date)) { // straightforward string
            specs[key].colType    = 'string';
            specs[key].colLength  = val.length;
            for(j = 0; j < val.length; j++) {
              if(specialChars.indexOf(val[j]) !== -1) {
                specs[key].colLength++;
              }
            }
          } else if(val instanceof Date) {
            specs[key].colType   = 'date';
            specs[key].colLength = 8;
          } else if (type === 'object') {
            specs[key].colType   = 'json';
            specs[key].colLength = JSON.stringify(val).length;
          }
        } else if ((type === 'number' && specs[key].colType !== 'num') ||
          (type === 'string' && !(val instanceof Date) && specs[key].colType !== 'string') ||
          (val instanceof Date && specs[key].colType !== 'date') ||
          ((type === 'object' && val.constructor !== Date) && specs[key].colType !== 'json'))
        {
          throw new h54sError('typeError', 'There is a specs mismatch in the array between values (columns) of the same name.');
        } else if(!isSpecsProvided && type === 'string' && specs[key].colLength < val.length) {
          specs[key].colLength = val.length;
        } else if((type === 'string' && specs[key].colLength < val.length) || (type !== 'string' && specs[key].colLength !== 8)) {
          throw new h54sError('typeError', 'There is a specs mismatch in the array between values (columns) of the same name.');
        }

        if (val instanceof Date) {
          table[i][key] = toSasDateTime(val);
        }
      }
    }

    //delete row if it's empty
    if(Object.keys(row).length === 0) {
      table.splice(i, 1);
    }
  }

  //convert specs to csv with pipes
  var specString = Object.keys(specs).map(function(key) {
    return key + ',' + specs[key].colType + ',' + specs[key].colLength;
  }).join('|');

  var sasJson = JSON.stringify(table).replace('\\"', '""');
  this._files[macroName] = [
    specString,
    new File([sasJson], 'table.json', {type: 'text/plain;charset=UTF-8'})
  ];
};

SasData.prototype.addFile  = function(file, macroName) {
  Files.prototype.add.call(this, file, macroName);
};

module.exports = SasData;
