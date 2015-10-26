/* global h54s */

/*
* Call Sas program
*
* @param {string} sasProgram - Path of the sas program
* @param {function} callback - Callback function called when ajax call is finished
*
*/
h54s.prototype.call = function(sasProgram, tablesObj, callback, params) {
  var self        = this;
  var retryCount  = 0;
  var dbg         = this.debug;

  if (!callback || typeof callback !== 'function'){
    throw new h54s.Error('argumentError', 'You must provide callback');
  }
  if(!sasProgram) {
    throw new h54s.Error('argumentError', 'You must provide Sas program file path');
  }
  if(typeof sasProgram !== 'string') {
    throw new h54s.Error('argumentError', 'First parameter should be string');
  }

  if(!params) {
    params = {
      _program: this.metadataRoot ? this.metadataRoot.replace(/\/?$/, '/') + sasProgram.replace(/^\//, '') : sasProgram,
      _debug:   this.debug ? 131 : 0,
      _service: 'default',
    };
  }

  if(tablesObj) {
    if(tablesObj instanceof h54s.Tables) {
      for(var key in tablesObj._tables) {
        if(tablesObj._tables.hasOwnProperty(key)) {
          params[key] = tablesObj._tables[key];
        }
      }
    } else {
      throw new h54s.Error('argumentError', 'Wrong type of tables object');
    }
  }

  if(this._disableCalls) {
    this._pendingCalls.push({
      sasProgram: sasProgram,
      callback:   callback,
      params:     params
    });
    return;
  }

  this._utils.ajax.post(this.url, params).success(function(res) {
    //maybe we already got past previous check
    if(self._disableCalls) {
      self._pendingCalls.push({
        sasProgram: sasProgram,
        callback:   callback,
        params:     params
      });
      return;
    }

    if(/<form.+action="Logon.do".+/.test(res.responseText)) {
      self._disableCalls = true;
      self._pendingCalls.push({
        sasProgram: sasProgram,
        callback:   callback,
        params:     params
      });

      try {
        var sasAppMatches = res.responseURL.match(/_sasapp=([^&]*)/);
        self.sasApp = sasAppMatches[1].replace(/\+/g, ' ');
      } catch(e) {
        self._utils.addApplicationLogs('Cannot extract _sasapp parameter from login URL');
      }

      callback(new h54s.Error('notLoggedinError', 'You are not logged in'));
    } else {
      var resObj, unescapedResObj;
      if(!dbg) {
        try {
          //remove new lines in json response
          resObj          = JSON.parse(res.responseText.replace(/(\r\n|\r|\n)/g, ''));
          resObj          = self._utils.convertDates(resObj);
          unescapedResObj = self._utils.unescapeValues(resObj);
        } catch(e) {
          if(retryCount < self.maxXhrRetries) {
            self._utils.ajax.post(self.url, params).success(this.success).error(this.error);
            retryCount++;
            self._utils.addApplicationLogs("Retrying #" + retryCount, sasProgram);
          } else {
            self._utils.parseErrorResponse(res.responseText, sasProgram);
            self._utils.addFailedResponse(res.responseText, sasProgram);
            callback(new h54s.Error('parseError', 'Unable to parse response json'));
          }
        } finally {
          if(unescapedResObj) {
            self._utils.addApplicationLogs(resObj.logmessage, sasProgram);
            callback(undefined, unescapedResObj);
          }
        }
      } else {
        try {
          resObj          = self._utils.parseDebugRes(res.responseText, sasProgram, params);
          resObj          = self._utils.convertDates(resObj);
          unescapedResObj = self._utils.unescapeValues(resObj);
        } catch(e) {
          self._utils.parseErrorResponse(res.responseText, sasProgram);
          callback(new h54s.Error('parseError', e.message));
        } finally {
          if(unescapedResObj) {
            self._utils.addApplicationLogs(resObj.logmessage);
            if(resObj.hasErrors) {
              callback(new h54s.Error('sasError', 'Sas program completed with errors'), unescapedResObj);
            } else {
              callback(undefined, unescapedResObj);
            }
          }
        }
      }
    }
  }).error(function(res) {
    self._utils.addApplicationLogs('Request failed with status: ' + res.status, sasProgram);
    callback(new h54s.Error('httpError', res.statusText));
  });
};

/*
* Login method
*
* @param {string} user - Login username
* @param {string} pass - Login password
* @param {function} callback - Callback function called when ajax call is finished
*
* OR
*
* @param {function} callback - Callback function called when ajax call is finished
*
*/
h54s.prototype.login = function(user, pass, callback) {
  var self = this;

  if(!user || !pass) {
    throw new h54s.Error('argumentError', 'Credentials not set');
  }
  if(typeof user !== 'string' || typeof pass !== 'string') {
    throw new h54s.Error('argumentError', 'User and pass parameters must be strings');
  }
  //NOTE: callback optional?
  if(!callback || typeof callback !== 'function') {
    throw new h54s.Error('argumentError', 'You must provide callback');
  }

  var callCallback = function(status) {
    if(typeof callback === 'function') {
      callback(status);
    }
  };

  this._utils.ajax.post(this.loginUrl, {
    _sasapp: self.sasApp,
    _service: 'default',
    ux: user,
    px: pass,
  }).success(function(res) {
    if(/<form.+action="Logon.do".+/.test(res.responseText)) {
      self._utils.addApplicationLogs('Wrong username or password');
      callCallback(-1);
    } else {
      callCallback(res.status);

      self._disableCalls = false;

      while(self._pendingCalls.length > 0) {
        var pendingCall = self._pendingCalls.shift();
        var sasProgram  = pendingCall.sasProgram;
        var callback    = pendingCall.callback;
        var params      = pendingCall.params;

        //update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        if(self.retryAfterLogin) {
          self.call(sasProgram, null, callback, params);
        }
      }
    }
  }).error(function(res) {
    //NOTE: error 502 if sasApp parameter is wrong
    self._utils.addApplicationLogs('Login failed with status code: ' + res.status);
    callCallback(res.status);
  });
};

/*
* Get sas errors if there are some
*
*/
h54s.prototype.getSasErrors = function() {
  return h54s._logs.sasErrors;
};

/*
* Get application logs
*
*/
h54s.prototype.getApplicationLogs = function() {
  return h54s._logs.applicationLogs;
};

/*
* Get debug data
*
*/
h54s.prototype.getDebugData = function() {
  return h54s._logs.debugData;
};

/*
* Get failed requests
*
*/
h54s.prototype.getFailedRequests = function() {
  return h54s._logs.failedRequests;
};

/*
* Enter debug mode
*
*/
h54s.prototype.setDebugMode = function() {
  this.debug = true;
};

/*
* Exit debug mode
*
*/
h54s.prototype.unsetDebugMode = function() {
  this.debug = false;
};

/*
* Clear application logs
*
*/
h54s.prototype.clearApplicationLogs = function() {
  h54s._logs.applicationLogs = [];
};

/*
* Clear debug data
*
*/
h54s.prototype.clearDebugData = function() {
  h54s._logs.debugData = [];
};

/*
* Clear Sas errors
*
*/
h54s.prototype.clearSasErrors = function() {
  h54s._logs.sasErrors = [];
};

/*
* Clear failed requests
*
*/
h54s.prototype.clearFailedRequests = function() {
  h54s._logs.failedRequests = [];
};

/*
* Clear all logs
*
*/
h54s.prototype.clearAllLogs = function() {
  this.clearApplicationLogs();
  this.clearDebugData();
  this.clearSasErrors();
  this.clearFailedRequests();
};

/*
* Add table to tables object
* @param {array} table - Array of table objects
* @param {string} macroName - Sas macro name
*
*/
h54s.Tables.prototype.add = function(table, macroName) {
  if(table && macroName) {
    if(!(table instanceof Array)) {
      throw new h54s.Error('argumentError', 'First argument must be array');
    }
    if(typeof macroName !== 'string') {
      throw new h54s.Error('argumentError', 'Second argument must be string');
    }
    if(!isNaN(macroName[macroName.length - 1])) {
      throw new h54s.Error('argumentError', 'Macro name cannot have number at the end');
    }
  } else {
    throw new h54s.Error('argumentError', 'Missing arguments');
  }

  var result = this._utils.convertTableObject(table);

  var tableArray = [];
  tableArray.push(JSON.stringify(result.spec));
  for (var numberOfTables = 0; numberOfTables < result.data.length; numberOfTables++) {
    var outString = JSON.stringify(result.data[numberOfTables]);
    tableArray.push(outString);
  }
  this._tables[macroName] = tableArray;
};
