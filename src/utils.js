h54s.prototype.utils = {};
h54s.prototype.utils.ajax = (function () {
  var xhr = function(type, url, data) {
    var methods = {
      success: function() {},
      error: function() {}
    };
    var XHR     = XMLHttpRequest || ActiveXObject;
    var request = new XHR('MSXML2.XMLHTTP.3.0');

    request.open(type, url, true);
    request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    request.onreadystatechange = function () {
      if (request.readyState === 4) {
        if (request.status >= 200 && request.status < 300) {
          methods.success.call(methods, request);
        } else {
          methods.error.call(methods, request);
        }
      }
    };

    request.send(data);

    return {
      success: function (callback) {
        methods.success = callback;
        return this;
      },
      error: function (callback) {
        methods.error = callback;
        return this;
      }
    };
  };

  var serialize = function(obj) {
    var str = [];
    for(var p in obj)
      if (obj.hasOwnProperty(p)) {
        if(obj[p] instanceof Array) {
          for(var i = 0, n = obj[p].length; i < n; i++) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p][i]));
          }
        } else {
          str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
      }
    return str.join("&");
  };

  return {
    get: function(url, data) {
      var dataStr;
      if(typeof data === 'object') {
        dataStr = serialize(data);
      }
      var urlWithParams = dataStr ? (url + '?' + dataStr) : '';
      return xhr('GET', urlWithParams);
    },
    post: function(url, data) {
      var dataStr;
      if(typeof data === 'object') {
        dataStr = serialize(data);
      }
      return xhr('POST', url, dataStr);
    }
  };
})();

/*
* Convert table object to Sas readable object
*
* @param {object} inObject - Object to convert
*
*/
h54s.prototype.utils.convertTableObject = function(inObject) {
  var chunkThreshold = 32000; // this goes to 32k for SAS
  // first check that the object is an array
  if (typeof (inObject) !== 'object') {
    throw new Error('The parameter passed to checkAndGetTypeObject is not an object');
  }

  var arrayLength = inObject.length;
  if (typeof (arrayLength) !== 'number') {
    throw new Error('The parameter passed to checkAndGetTypeObject does not have a valid length and is most likely not an array');
  }

  var existingCols = {}; // this is just to make lookup easier rather than traversing array each time. Will transform after

  // function checkAndSetArray - this will check an inObject current key against the existing typeArray and either return -1 if there
  // is a type mismatch or add an element and update/increment the length if needed

  function checkAndIncrement(colSpec) {
    if (typeof (existingCols[colSpec.colName]) == 'undefined') {
      existingCols[colSpec.colName]           = {};
      existingCols[colSpec.colName].colName   = colSpec.colName;
      existingCols[colSpec.colName].colType   = colSpec.colType;
      existingCols[colSpec.colName].colLength = colSpec.colLength > 0 ? colSpec.colLength : 1;
      return 0; // all ok
    }
    // check type match
    if (existingCols[colSpec.colName].colType !== colSpec.colType) {
      return -1; // there is a fudge in the typing
    }
    if (existingCols[colSpec.colName].colLength < colSpec.colLength) {
      existingCols[colSpec.colName].colLength = colSpec.colLength > 0 ? colSpec.colLength : 1; // increment the max length of this column
      return 0;
    }
  }
  var chunkArrayCount         = 0; // this is for keeping tabs on how long the current array string would be
  var targetArray             = []; // this is the array of target arrays
  var currentTarget           = 0;
  targetArray[currentTarget]  = [];
  var totalChars              = 0;
  var j                       = 0;
  for (var i = 0; i < inObject.length; i++) {
    targetArray[currentTarget][j] = {};
    var chunkRowCount             = 0;

    for (var key in inObject[i]) {
      // this.logd('i and j are ', i, j);
      var thisSpec  = {};
      var thisValue = inObject[i][key];
      // get type... if it is an object then convert it to json and store as a string
      var thisType  = typeof (thisValue);
      if (thisType == 'number') { // straightforward number
        // this.logd('Number on ', i, j, key);
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'num';
        thisSpec.colLength                  = 8;
        thisSpec.encodedLength              = thisValue.toString().length;
        targetArray[currentTarget][j][key]  = thisValue;

      }
      if (thisType == 'string') { // straightforward string
        // this.logd('String on ', i, j, key);
        thisSpec.colName    = key;
        thisSpec.colType    = 'string';
        thisSpec.colLength  = thisValue.length;
        if (thisValue === "") {
          targetArray[currentTarget][j][key] = " ";
        } else {
          targetArray[currentTarget][j][key] = escape(thisValue);
        }
        thisSpec.encodedLength = targetArray[currentTarget][j][key].length;
      }
      if (thisType == 'object') { // interesting bit. If it is a date then it will have a toDate
        if (typeof (thisValue.toDateString) !== 'undefined') { // it is a date
          thisSpec.colName                    = key;
          thisSpec.colType                    = 'date';
          thisSpec.colLength                  = 8;
          targetArray[currentTarget][j][key]  = this.formatDate(thisValue, "dd/MM/yyyy");
          thisSpec.encodedLength              = targetArray[currentTarget][j][key].toString().length;
        } else {
          thisSpec.colName                    = key;
          thisSpec.colType                    = 'json';
          thisSpec.colLength                  = JSON.stringify(thisValue).length;
          targetArray[currentTarget][j][key]  = escape(JSON.stringify(thisValue));
          thisSpec.encodedLength              = targetArray[currentTarget][j][key].length;
        }
      }
      chunkRowCount = chunkRowCount +
        6 +
        key.length +
        thisSpec.encodedLength;

      if (checkAndIncrement(thisSpec) == -1) {
        throw new Error('There is a type mismatch in the array between elements (columns) of the same name.');
      }
    }
    j++;
    // TODO: this needs to go into its own method so that it can be called from the ifs above
    //       rather than doing the postmortem. Needs to abort and start on new array if 32k is
    //       reached.
    if (chunkArrayCount + chunkRowCount > chunkThreshold) {
      targetArray[currentTarget].splice(j - 1, 1); // get rid of that last row
      currentTarget++; // move onto the next array
      this.logd('checkAndGetTypeObject: Constructing chunk #' + currentTarget);
      targetArray[currentTarget] = []; // make it an array
      i--; // go back to the last row in the source
      j = 0; // initialise new row counter for new array
      chunkArrayCount = 0; // this is the new chunk max size
    } else {
      chunkArrayCount = chunkArrayCount + chunkRowCount;
      // this.logd('not incrementing array, on ' + chunkArrayCount);
    }
  }

  // reformat existingCols into an array so sas can parse it;
  var specArray = [];
  for (var k in existingCols) {
    specArray.push(existingCols[k]);
  }
  return {
    spec: specArray,
    data: targetArray,
    jsonLength: chunkArrayCount
  }; // the spec will be the macro[0], with the data split into arrays of macro[1-n]
  // means in terms of dojo xhr object at least they need to go into the same array
};
