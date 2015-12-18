/* global h54s */

/*
* Call Sas program
*
* @param {string} sasProgram - Path of the sas program
* @param {function} callback - Callback function called when ajax call is finished
*
*/
module.exports.call = function(sasProgram, tablesObj, callback, params) {
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
    if(self._utils.needToLogin.call(self, res)) {
      //remember the call for latter use
      self._pendingCalls.push({
        sasProgram: sasProgram,
        callback:   callback,
        params:     params
      });

      //there's no need to continue if previous call returned login error
      if(self._disableCalls) {
        return;
      } else {
        self._disableCalls = true;
      }

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
module.exports.login = function(user, pass, callback) {
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

  var loginParams = {
    _sasapp: self.sasApp,
    _service: 'default',
    ux: user,
    px: pass,
    //for SAS 9.4,
    username: user,
    password: pass
  };

  for (var key in this._aditionalLoginParams) {
    loginParams[key] = this._aditionalLoginParams[key];
  }

  this._utils.ajax.post(this.loginUrl, loginParams).success(function(res) {
    if(self._utils.needToLogin.call(self, res)) {
      //we are getting form again after redirect
      //and need to login again using the new url
      //_loginChanged is set in _needToLogin function
      //but if login url is not different, we are checking if there are aditional parameters
      if(self._loginChanged || (self._isNewLoginPage && !self._aditionalLoginParams)) {
        delete self._loginChanged;

        var inputs = res.responseText.match(/<input.*"hidden"[^>]*>/g);
        if(inputs) {
          inputs.forEach(function(inputStr) {
            var valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
            loginParams[valueMatch[1]] = valueMatch[2];
          });
        }

        self._utils.ajax.post(self.loginUrl, loginParams).success(this.success).error(this.error);
      } else {
        //getting form again, but it wasn't a redirect
        self._utils.addApplicationLogs('Wrong username or password');
        callback(-1);
      }
    } else {
      callback(res.status);

      self._disableCalls = false;

      while(self._pendingCalls.length > 0) {
        var pendingCall     = self._pendingCalls.shift();
        var sasProgram      = pendingCall.sasProgram;
        var callbackPending = pendingCall.callback;
        var params          = pendingCall.params;

        //update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        if(self.retryAfterLogin) {
          self.call(sasProgram, null, callbackPending, params);
        }
      }
    }
  }).error(function(res) {
    //NOTE: error 502 if sasApp parameter is wrong
    self._utils.addApplicationLogs('Login failed with status code: ' + res.status);
    callback(res.status);
  });
};

/*
* Get sas errors if there are some
*
*/
module.exports.getSasErrors = function() {
  return h54s._logs.sasErrors;
};

/*
* Get application logs
*
*/
module.exports.getApplicationLogs = function() {
  return h54s._logs.applicationLogs;
};

/*
* Get debug data
*
*/
module.exports.getDebugData = function() {
  return h54s._logs.debugData;
};

/*
* Get failed requests
*
*/
module.exports.getFailedRequests = function() {
  return h54s._logs.failedRequests;
};

/*
* Enter debug mode
*
*/
module.exports.setDebugMode = function() {
  this.debug = true;
};

/*
* Exit debug mode
*
*/
module.exports.unsetDebugMode = function() {
  this.debug = false;
};

/*
* Clear application logs
*
*/
module.exports.clearApplicationLogs = function() {
  h54s._logs.applicationLogs = [];
};

/*
* Clear debug data
*
*/
module.exports.clearDebugData = function() {
  h54s._logs.debugData = [];
};

/*
* Clear Sas errors
*
*/
module.exports.clearSasErrors = function() {
  h54s._logs.sasErrors = [];
};

/*
* Clear failed requests
*
*/
module.exports.clearFailedRequests = function() {
  h54s._logs.failedRequests = [];
};

/*
* Clear all logs
*
*/
module.exports.clearAllLogs = function() {
  this.clearApplicationLogs();
  this.clearDebugData();
  this.clearSasErrors();
  this.clearFailedRequests();
};

module.exports._utils = require('./utils.js');
