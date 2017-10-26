var h54sError = require('../error.js');
var logs = require('../logs.js');
var Tables = require('../tables');
var SasData = require('../sasData.js');
var Files = require('../files');

/*
* Call Sas program
*
* @param {string} sasProgram - Path of the sas program
* @param {function} callback - Callback function called when ajax call is finished
*
*/
module.exports.call = function(sasProgram, dataObj, callback, params) {
  var self        = this;
  var retryCount  = 0;
  var dbg         = this.debug;

  if (!callback || typeof callback !== 'function'){
    throw new h54sError('argumentError', 'You must provide callback');
  }
  if(!sasProgram) {
    throw new h54sError('argumentError', 'You must provide Sas program file path');
  }
  if(typeof sasProgram !== 'string') {
    throw new h54sError('argumentError', 'First parameter should be string');
  }
  if(this.useMultipartFormData === false && !(dataObj instanceof Tables)) {
    throw new h54sError('argumentError', 'Cannot send files using application/x-www-form-urlencoded. Please use Tables or default value for useMultipartFormData');
  }

  if(!params) {
    params = {
      _program: this._utils.getFullProgramPath(this.metadataRoot, sasProgram),
      _debug:   this.debug ? 131 : 0,
      _service: 'default',
    };
  }

  if(dataObj) {
    var key, dataProvider;
    if(dataObj instanceof Tables) {
      dataProvider = dataObj._tables;
    } else if(dataObj instanceof Files || dataObj instanceof SasData){
      dataProvider = dataObj._files;
    } else {
      throw new h54sError('argumentError', 'Wrong type of tables object');
    }
    for(key in dataProvider) {
      if(dataProvider.hasOwnProperty(key)) {
        params[key] = dataProvider[key];
      }
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

  this._ajax.post(this.url, params, this.useMultipartFormData).success(function(res) {
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

      callback(new h54sError('notLoggedinError', 'You are not logged in'));
    } else {
      var resObj, unescapedResObj, err;
      if(!dbg) {
        var done = false;
        try {
          resObj = self._utils.parseRes(res.responseText, sasProgram, params);
          logs.addApplicationLog(resObj.logmessage, sasProgram);

          if(dataObj instanceof Tables) {
            unescapedResObj = self._utils.unescapeValues(resObj);
          } else {
            unescapedResObj = resObj;
          }

          if(resObj.status !== 'success') {
            err = new h54sError('programError', resObj.errormessage, resObj.status);
          }

          done = true;
        } catch(e) {
          if(e instanceof SyntaxError) {
            if(retryCount < self.maxXhrRetries) {
              done = false;
              self._ajax.post(self.url, params, self.useMultipartFormData).success(this.success).error(this.error);
              retryCount++;
              logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
            } else {
              self._utils.parseErrorResponse(res.responseText, sasProgram);
              self._utils.addFailedResponse(res.responseText, sasProgram);
              err = new h54sError('parseError', 'Unable to parse response json');
              done = true;
            }
          } else if(e instanceof h54sError) {
            self._utils.parseErrorResponse(res.responseText, sasProgram);
            self._utils.addFailedResponse(res.responseText, sasProgram);
            err = e;
            done = true;
          } else {
            self._utils.parseErrorResponse(res.responseText, sasProgram);
            self._utils.addFailedResponse(res.responseText, sasProgram);
            err = new h54sError('unknownError', e.message);
            err.stack = e.stack;
            done = true;
          }
        } finally {
          if(done) {
            callback(err, unescapedResObj);
          }
        }
      } else {
        try {
          resObj = self._utils.parseDebugRes(res.responseText, sasProgram, params);
          logs.addApplicationLog(resObj.logmessage, sasProgram);

          if(dataObj instanceof Tables) {
            unescapedResObj = self._utils.unescapeValues(resObj);
          } else {
            unescapedResObj = resObj;
          }

          if(resObj.status !== 'success') {
            err = new h54sError('programError', resObj.errormessage, resObj.status);
          }
        } catch(e) {
          if(e instanceof SyntaxError) {
            err = new h54sError('parseError', e.message);
          } else if(e instanceof h54sError) {
            err = e;
          } else {
            err = new h54sError('unknownError', e.message);
            err.stack = e.stack;
          }
        } finally {
          callback(err, unescapedResObj);
        }
      }
    }
  }).error(function(res) {
    logs.addApplicationLog('Request failed with status: ' + res.status, sasProgram);
    callback(new h54sError('httpError', res.statusText));
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
    throw new h54sError('argumentError', 'Credentials not set');
  }
  if(typeof user !== 'string' || typeof pass !== 'string') {
    throw new h54sError('argumentError', 'User and pass parameters must be strings');
  }
  //NOTE: callback optional?
  if(!callback || typeof callback !== 'function') {
    throw new h54sError('argumentError', 'You must provide callback');
  }

  var loginParams = {
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

  this._loginAttempts = 0;

  this._ajax.post(this.loginUrl, loginParams).success(function(res) {
    if(++self._loginAttempts === 3) {
      return callback(-2);
    }

    if(self._utils.needToLogin.call(self, res)) {
      //we are getting form again after redirect
      //and need to login again using the new url
      //_loginChanged is set in needToLogin function
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

        var success = this.success, error = this.error;
        self._ajax.post(self.loginUrl, loginParams).success(function() {
          //we need this get request because of the sas 9.4 security checks
          self._ajax.get(self.url).success(success).error(error);
        }).error(this.error);
      } else {
        //getting form again, but it wasn't a redirect
        logs.addApplicationLog('Wrong username or password');
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
    logs.addApplicationLog('Login failed with status code: ' + res.status);
    callback(res.status);
  });
};

/*
* Logout method
*
* @param {function} callback - Callback function called when ajax call is finished
*
*/

module.exports.logout = function(callback) {
  this._ajax.get(this.url, {_action: 'logoff'}).success(function(res) {
    callback();
  }).error(function(res) {
    logs.addApplicationLog('Logout failed with status code: ' + res.status);
    callback(res.status);
  });
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

for(var key in logs.get) {
  if(logs.get.hasOwnProperty(key)) {
    module.exports[key] = logs.get[key];
  }
}

for(var key in logs.clear) {
  if(logs.clear.hasOwnProperty(key)) {
    module.exports[key] = logs.clear[key];
  }
}

/*
* Add callback functions executed when properties are updated with remote config
*
*@callback - callback pushed to array
*
*/
module.exports.onRemoteConfigUpdate = function(callback) {
  this.remoteConfigUpdateCallbacks.push(callback);
};

module.exports._utils = require('./utils.js');
