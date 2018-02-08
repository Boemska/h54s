(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.h54s = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
* h54s error constructor
* @constructor
*
*@param {string} type - Error type
*@param {string} message - Error message
*
*/
function h54sError(type, message) {
  if(Error.captureStackTrace) {
    Error.captureStackTrace(this);
  }
  this.message = message;
  this.type    = type;
}

h54sError.prototype = Object.create(Error.prototype);

h54sError.prototype.constructor = h54sError;
h54sError.prototype.name = 'h54sError';

module.exports = h54sError;

},{}],2:[function(require,module,exports){
//self invoked function module
require('./ie_polyfills.js');

var h54sError = require('./error.js');

/*
* Represents html5 for sas adapter
* @constructor
*
*@param {object} config - adapter config object, with keys like url, debug, etc.
*
*/
var h54s = module.exports = function(config) {

  //default config values
  this.maxXhrRetries    = 5;
  this.url              = "/SASStoredProcess/do";
  this.debug            = false;
  this.loginUrl         = '/SASLogon/Logon.do';
  this.retryAfterLogin  = true;
  this.sasApp           = 'Stored Process Web App 9.3';
  this.ajaxTimeout      = 30000;

  this.remoteConfigUpdateCallbacks = [];

  this._pendingCalls    = [];

  this._ajax = require('./methods/ajax.js')();

  _setConfig.call(this, config);

  //override with remote if set
  if(config && config.isRemoteConfig) {
    var self = this;

    this._disableCalls = true;

    // '/base/test/h54sConfig.json' is for the testing with karma
    //replaced with gulp in dev build
    this._ajax.get('h54sConfig.json').success(function(res) {
      var remoteConfig = JSON.parse(res.responseText);

      for(var key in remoteConfig) {
        if(remoteConfig.hasOwnProperty(key) && config[key] === undefined && key !== 'isRemoteConfig') {
          config[key] = remoteConfig[key];
        }
      }

      _setConfig.call(self, config);

      //execute callbacks when we have remote config
      //note that remote conifg is merged with instance config
      for(var i = 0, n = self.remoteConfigUpdateCallbacks.length; i < n; i++) {
        var fn = self.remoteConfigUpdateCallbacks[i];
        fn();
      }

      //execute sas calls disabled while waiting for the config
      self._disableCalls = false;
      while(self._pendingCalls.length > 0) {
        var pendingCall = self._pendingCalls.shift();
        var sasProgram  = pendingCall.sasProgram;
        var callback    = pendingCall.callback;
        var params      = pendingCall.params;

        //update program with metadataRoot if it's not set
        if(self.metadataRoot && pendingCall.params._program.indexOf(self.metadataRoot) === -1) {
          pendingCall.params._program = self.metadataRoot.replace(/\/?$/, '/') + pendingCall.params._program.replace(/^\//, '');
        }

        //update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        self.call(sasProgram, null, callback, params);
      }
    }).error(function (err) {
      throw new h54sError('ajaxError', 'Remote config file cannot be loaded. Http status code: ' + err.status);
    });
  }

  // private function to set h54s instance properties
  function _setConfig(config) {
    if(!config) {
      this._ajax.setTimeout(this.ajaxTimeout);
      return;
    } else if(typeof config !== 'object') {
      throw new h54sError('argumentError', 'First parameter should be config object');
    }

    //merge config object from parameter with this
    for(var key in config) {
      if(config.hasOwnProperty(key)) {
        if((key === 'url' || key === 'loginUrl') && config[key].charAt(0) !== '/') {
          config[key] = '/' + config[key];
        }
        this[key] = config[key];
      }
    }

    //if server is remote use the full server url
    //NOTE: this is not permited by the same-origin policy
    if(config.hostUrl) {
      if(config.hostUrl.charAt(config.hostUrl.length - 1) === '/') {
        config.hostUrl = config.hostUrl.slice(0, -1);
      }
      this.hostUrl  = config.hostUrl;
      this.url      = config.hostUrl + this.url;
      this.loginUrl = config.hostUrl + this.loginUrl;
    }

    this._ajax.setTimeout(this.ajaxTimeout);
  }
};

//replaced with gulp
h54s.version = '0.11.1';


h54s.prototype = require('./methods/methods.js');

h54s.Tables = require('./tables/tables.js');

},{"./error.js":1,"./ie_polyfills.js":3,"./methods/ajax.js":5,"./methods/methods.js":6,"./tables/tables.js":8}],3:[function(require,module,exports){
module.exports = function() {
  if (!Object.create) {
    Object.create = function(proto, props) {
      if (typeof props !== "undefined") {
        throw "The multiple-argument version of Object.create is not provided by this browser and cannot be shimmed.";
      }
      function ctor() { }
      ctor.prototype = proto;
      return new ctor();
    };
  }


  // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
  if (!Object.keys) {
    Object.keys = (function () {
      'use strict';
      var hasOwnProperty = Object.prototype.hasOwnProperty,
          hasDontEnumBug = !({toString: null}).propertyIsEnumerable('toString'),
          dontEnums = [
            'toString',
            'toLocaleString',
            'valueOf',
            'hasOwnProperty',
            'isPrototypeOf',
            'propertyIsEnumerable',
            'constructor'
          ],
          dontEnumsLength = dontEnums.length;

      return function (obj) {
        if (typeof obj !== 'object' && (typeof obj !== 'function' || obj === null)) {
          throw new TypeError('Object.keys called on non-object');
        }

        var result = [], prop, i;

        for (prop in obj) {
          if (hasOwnProperty.call(obj, prop)) {
            result.push(prop);
          }
        }

        if (hasDontEnumBug) {
          for (i = 0; i < dontEnumsLength; i++) {
            if (hasOwnProperty.call(obj, dontEnums[i])) {
              result.push(dontEnums[i]);
            }
          }
        }
        return result;
      };
    }());
  }

  // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/lastIndexOf
  if (!Array.prototype.lastIndexOf) {
    Array.prototype.lastIndexOf = function(searchElement /*, fromIndex*/) {
      'use strict';

      if (this === void 0 || this === null) {
        throw new TypeError();
      }

      var n, k,
        t = Object(this),
        len = t.length >>> 0;
      if (len === 0) {
        return -1;
      }

      n = len - 1;
      if (arguments.length > 1) {
        n = Number(arguments[1]);
        if (n != n) {
          n = 0;
        }
        else if (n !== 0 && n != (1 / 0) && n != -(1 / 0)) {
          n = (n > 0 || -1) * Math.floor(Math.abs(n));
        }
      }

      for (k = n >= 0 ? Math.min(n, len - 1) : len - Math.abs(n); k >= 0; k--) {
        if (k in t && t[k] === searchElement) {
          return k;
        }
      }
      return -1;
    };
  }
}();

},{}],4:[function(require,module,exports){
var logs = {
  applicationLogs: [],
  debugData: [],
  sasErrors: [],
  failedRequests: []
};

var limits = {
  applicationLogs: 100,
  debugData: 20,
  failedRequests: 20,
  sasErrors: 100
};

module.exports.get = {
  getSasErrors: function() {
    return logs.sasErrors;
  },
  getApplicationLogs: function() {
    return logs.applicationLogs;
  },
  getDebugData: function() {
    return logs.debugData;
  },
  getFailedRequests: function() {
    return logs.failedRequests;
  }
};

module.exports.clear = {
  clearApplicationLogs: function() {
    logs.applicationLogs.splice(0, logs.applicationLogs.length);
  },
  clearDebugData: function() {
    logs.debugData.splice(0, logs.debugData.length);
  },
  clearSasErrors: function() {
    logs.sasErrors.splice(0, logs.sasErrors.length);
  },
  clearFailedRequests: function() {
    logs.failedRequests.splice(0, logs.failedRequests.length);
  },
  clearAllLogs: function() {
    this.clearApplicationLogs();
    this.clearDebugData();
    this.clearSasErrors();
    this.clearFailedRequests();
  }
};

/*
* Adds application logs to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addApplicationLog = function(message, sasProgram) {
  if(message === 'blank') {
    return;
  }
  var log = {
    message:    message,
    time:       new Date(),
    sasProgram: sasProgram
  };
  logs.applicationLogs.push(log);

  if(logs.applicationLogs.length > limits.applicationLogs) {
    logs.applicationLogs.shift();
  }
};

/*
* Adds debug data to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addDebugData = function(htmlData, debugText, sasProgram, params) {
  logs.debugData.push({
    debugHtml:  htmlData,
    debugText:  debugText,
    sasProgram: sasProgram,
    params:     params,
    time:       new Date()
  });

  if(logs.debugData.length > limits.debugData) {
    logs.debugData.shift();
  }
};

/*
* Adds failed requests to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addFailedRequest = function(responseText, debugText, sasProgram) {
  logs.failedRequests.push({
    responseHtml: responseText,
    responseText: debugText,
    sasProgram:   sasProgram,
    time:         new Date()
  });

  //max 20 failed requests
  if(logs.failedRequests.length > limits.failedRequests) {
    logs.failedRequests.shift();
  }
};

/*
* Adds SAS errors to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addSasErrors = function(errors) {
  logs.sasErrors = logs.sasErrors.concat(errors);

  while(logs.sasErrors.length > limits.sasErrors) {
    logs.sasErrors.shift();
  }
};

},{}],5:[function(require,module,exports){
module.exports = function() {
  var timeout = 30000;
  var timeoutHandle;

  var xhr = function(type, url, data, multipartFormData) {
    var methods = {
      success: function() {},
      error:   function() {}
    };
    var XHR     = XMLHttpRequest || ActiveXObject;
    var request = new XHR('MSXML2.XMLHTTP.3.0');

    request.open(type, url, true);

    //multipart/form-data is set automatically so no need for else block
    if(!multipartFormData) {
      request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    }
    request.onreadystatechange = function () {
      if (request.readyState === 4) {
        clearTimeout(timeoutHandle);
        if (request.status >= 200 && request.status < 300) {
          methods.success.call(methods, request);
        } else {
          methods.error.call(methods, request);
        }
      }
    };

    if(timeout > 0) {
      timeoutHandle = setTimeout(function() {
        request.abort();
      }, timeout);
    }

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
    for(var p in obj) {
      if (obj.hasOwnProperty(p)) {
        if(obj[p] instanceof Array) {
          for(var i = 0, n = obj[p].length; i < n; i++) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p][i]));
          }
        } else {
          str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
      }
    }
    return str.join("&");
  };

  var createMultipartFormDataPayload = function(obj) {
    var data = new FormData();
    for(var p in obj) {
      if(obj.hasOwnProperty(p)) {
        if(obj[p] instanceof Array) {
          for(var i = 0, n = obj[p].length; i < n; i++) {
            data.append(p, obj[p][i]);
          }
        } else {
          data.append(p, obj[p]);
        }
      }
    }
    return data;
  };

  return {
    get: function(url, data) {
      var dataStr;
      if(typeof data === 'object') {
        dataStr = serialize(data);
      }
      var urlWithParams = dataStr ? (url + '?' + dataStr) : url;
      return xhr('GET', urlWithParams);
    },
    post: function(url, data, multipartFormData) {
      var payload;
      if(typeof data === 'object') {
        if(multipartFormData) {
          payload = createMultipartFormDataPayload(data);
        } else {
          payload = serialize(data);
        }
      }
      return xhr('POST', url, payload, multipartFormData);
    },
    setTimeout: function(t) {
      timeout = t;
    }
  };
};

},{}],6:[function(require,module,exports){
var h54sError = require('../error.js');
var logs = require('../logs.js');

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
    throw new h54sError('argumentError', 'You must provide callback');
  }
  if(!sasProgram) {
    throw new h54sError('argumentError', 'You must provide Sas program file path');
  }
  if(typeof sasProgram !== 'string') {
    throw new h54sError('argumentError', 'First parameter should be string');
  }

  if(!params) {
    params = {
      _program: this.metadataRoot ? this.metadataRoot.replace(/\/?$/, '/') + sasProgram.replace(/^\//, '') : sasProgram,
      _debug:   this.debug ? 131 : 0,
      _service: 'default'
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
      throw new h54sError('argumentError', 'Wrong type of tables object');
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

  this._ajax.post(this.url, params, true).success(function(res) {
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
        logs.addApplicationLog('Cannot extract _sasapp parameter from login URL');
      }

      callback(new h54sError('notLoggedinError', 'You are not logged in'));
    } else {
      var resObj, unescapedResObj;
      if(!dbg) {
        try {
          resObj = self._utils.parseRes(res.responseText, sasProgram, params);
          logs.addApplicationLog(resObj.logmessage, sasProgram);

          resObj          = self._utils.convertDates(resObj);
          unescapedResObj = self._utils.unescapeValues(resObj);

          callback(undefined, unescapedResObj);
        } catch(e) {
          if(e instanceof SyntaxError) {
            if(retryCount < self.maxXhrRetries) {
              self._ajax.post(self.url, params, true).success(this.success).error(this.error);
              retryCount++;
              logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
            } else {
              self._utils.parseErrorResponse(res.responseText, sasProgram);
              self._utils.addFailedResponse(res.responseText, sasProgram);
              callback(new h54sError('parseError', 'Unable to parse response json'));
            }
          } else if(e instanceof h54sError) {
            self._utils.parseErrorResponse(res.responseText, sasProgram);
            self._utils.addFailedResponse(res.responseText, sasProgram);
            callback(e);
          } else {
            self._utils.parseErrorResponse(res.responseText, sasProgram);
            self._utils.addFailedResponse(res.responseText, sasProgram);
            var err = new h54sError('unknownError', e.message);
            err.stack = e.stack;
            callback(err);
          }
        }
      } else {
        try {
          resObj          = self._utils.parseDebugRes(res.responseText, sasProgram, params);
          logs.addApplicationLog(resObj.logmessage, sasProgram);

          resObj          = self._utils.convertDates(resObj);
          unescapedResObj = self._utils.unescapeValues(resObj);

          callback(undefined, unescapedResObj);
        } catch(e) {
          if(e instanceof SyntaxError) {
            callback(new h54sError('parseError', e.message));
          } else if(e instanceof h54sError) {
            callback(e);
          } else {
            var error = new h54sError('unknownError', e.message);
            error.stack = e.stack;
            callback(error);
          }
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

  this._ajax.post(this.loginUrl, loginParams).success(function(res) {
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
    //NOTE: error 502 if sasApp parameter is wrong
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

},{"../error.js":1,"../logs.js":4,"./utils.js":7}],7:[function(require,module,exports){
var logs = require('../logs.js');
var h54sError = require('../error.js');

var programNotFoundPatt = /<title>(Stored Process Error|SASStoredProcess)<\/title>[\s\S]*<h2>Stored process not found:.*<\/h2>/;

/*
* Parse response from server
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
* @param {object} params - params sent to sas program with addTable
*
*/
module.exports.parseRes = function(responseText, sasProgram, params) {
  var matches = responseText.match(programNotFoundPatt);
  if(matches) {
    throw new h54sError('programNotFound', 'Sas program completed with errors');
  }
  //remove new lines in json response
  return JSON.parse(responseText.replace(/(\r\n|\r|\n)/g, ''));
};

/*
* Parse response from server in debug mode
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
* @param {object} params - params sent to sas program with addTable
*
*/
module.exports.parseDebugRes = function(responseText, sasProgram, params) {
  var matches = responseText.match(programNotFoundPatt);
  if(matches) {
    throw new h54sError('programNotFound', 'Sas program completed with errors');
  }

  //find json
  patt              = /^(.?--h54s-data-start--)([\S\s]*?)(--h54s-data-end--)/m;
  matches           = responseText.match(patt);

  var page          = responseText.replace(patt, '');
  var htmlBodyPatt  = /<body.*>([\s\S]*)<\/body>/;
  var bodyMatches   = page.match(htmlBodyPatt);

  //remove html tags
  var debugText = bodyMatches[1].replace(/<[^>]*>/g, '');
  debugText     = this.decodeHTMLEntities(debugText);

  logs.addDebugData(bodyMatches[1], debugText, sasProgram, params);

  if(this.parseErrorResponse(responseText, sasProgram)) {
    throw new h54sError('sasError', 'Sas program completed with errors');
  }

  if(!matches) {
    throw new h54sError('parseError', 'Unable to parse response json');
  }
  //remove new lines in json response
  var jsonObj = JSON.parse(matches[2].replace(/(\r\n|\r|\n)/g, ''));

  return jsonObj;
};

/*
* Add failed response to logs - used only if debug=false
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
*
*/
module.exports.addFailedResponse = function(responseText, sasProgram) {
  var patt      = /<script([\s\S]*)\/form>/;
  var patt2     = /display\s?:\s?none;?\s?/;
  //remove script with form for toggling the logs and "display:none" from style
  responseText  = responseText.replace(patt, '').replace(patt2, '');
  var debugText = responseText.replace(/<[^>]*>/g, '');
  debugText = this.decodeHTMLEntities(debugText);

  logs.addFailedRequest(responseText, debugText, sasProgram);
};

/*
* Unescape all string values in returned object
*
* @param {object} obj
*
*/
module.exports.unescapeValues = function(obj) {
  for (var key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = decodeURIComponent(obj[key]);
    } else if(typeof obj === 'object') {
      this.unescapeValues(obj[key]);
    }
  }
  return obj;
};

/*
* Parse error response from server and save errors in memory
*
* @param {string} res - server response
* #param {string} sasProgram - sas program which returned the response
*
*/
module.exports.parseErrorResponse = function(res, sasProgram) {
  //capture 'ERROR: [text].' or 'ERROR xx [text].'
  var patt    = /ERROR(:\s|\s\d\d)(.*\.|.*\n.*\.)/gm;
  var errors  = res.match(patt);
  if(!errors) {
    return;
  }

  var errMessage;
  for(var i = 0, n = errors.length; i < n; i++) {
    errMessage  = errors[i].replace(/<[^>]*>/g, '').replace(/(\n|\s{2,})/g, ' ');
    errMessage  = this.decodeHTMLEntities(errMessage);
    errors[i]   = {
      sasProgram: sasProgram,
      message:    errMessage,
      time:       new Date()
    };
  }

  logs.addSasErrors(errors);

  return true;
};

/*
* Decode HTML entities
*
* @param {string} res - server response
*
*/
module.exports.decodeHTMLEntities = function (html) {
  var tempElement = document.createElement('span');
  var str         = html.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    function (str) {
      tempElement.innerHTML = str;
      str                   = tempElement.textContent || tempElement.innerText;
      return str;
    }
  );
  return str;
};

/*
* Convert sas time to javascript date
*
* @param {number} sasDate - sas Tate object
*
*/
module.exports.fromSasDateTime = function (sasDate) {
  var basedate = new Date("January 1, 1960 00:00:00");
  var currdate = sasDate;

  // offsets for UTC and timezones and BST
  var baseOffset = basedate.getTimezoneOffset(); // in minutes

  // convert sas datetime to a current valid javascript date
  var basedateMs  = basedate.getTime(); // in ms
  var currdateMs  = currdate * 1000; // to ms
  var sasDatetime = currdateMs + basedateMs;
  var jsDate      = new Date();
  jsDate.setTime(sasDatetime); // first time to get offset BST daylight savings etc
  var currOffset  = jsDate.getTimezoneOffset(); // adjust for offset in minutes
  var offsetVar   = (baseOffset - currOffset) * 60 * 1000; // difference in milliseconds
  var offsetTime  = sasDatetime - offsetVar; // finding BST and daylight savings
  jsDate.setTime(offsetTime); // update with offset
  return jsDate;
};

/*
* Convert sas timestamps to javascript Date object
*
* @param {object} obj
*
*/
module.exports.convertDates = function(obj) {
  for (var key in obj) {
    if (typeof obj[key] === 'number' && (key.indexOf('dt_') === 0 || key.indexOf('DT_') === 0)) {
      obj[key] = this.fromSasDateTime(obj[key]);
    } else if(typeof obj === 'object') {
      this.convertDates(obj[key]);
    }
  }
  return obj;
};

module.exports.needToLogin = function(responseObj) {
  var patt = /<form.+action="(.*Logon[^"]*).*>/;
  var matches = patt.exec(responseObj.responseText);
  var newLoginUrl;

  if(!matches) {
    //there's no form, we are in. hooray!
    return false;
  } else {
    var actionUrl = matches[1].replace(/\?.*/, '');
    if(actionUrl.charAt(0) === '/') {
      newLoginUrl = this.hostUrl ? this.hostUrl + actionUrl : actionUrl;
      if(newLoginUrl !== this.loginUrl) {
        this._loginChanged = true;
        this.loginUrl = newLoginUrl;
      }
    } else {
      //relative path

      var lastIndOfSlash = responseObj.responseURL.lastIndexOf('/') + 1;
      //remove everything after the last slash, and everything until the first
      var relativeLoginUrl = responseObj.responseURL.substr(0, lastIndOfSlash).replace(/.*\/{2}[^\/]*/, '') + actionUrl;
      newLoginUrl = this.hostUrl ? this.hostUrl + relativeLoginUrl : relativeLoginUrl;
      if(newLoginUrl !== this.loginUrl) {
        this._loginChanged = true;
        this.loginUrl = newLoginUrl;
      }
    }

    //save parameters from hidden form fields
    var inputs = responseObj.responseText.match(/<input.*"hidden"[^>]*>/g);
    var hiddenFormParams = {};
    if(inputs) {
      //it's new login page if we have these additional parameters
      this._isNewLoginPage = true;
      inputs.forEach(function(inputStr) {
        var valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
        hiddenFormParams[valueMatch[1]] = valueMatch[2];
      });
      this._aditionalLoginParams = hiddenFormParams;
    }

    return true;
  }
};

},{"../error.js":1,"../logs.js":4}],8:[function(require,module,exports){
var h54sError = require('../error.js');

/*
* h54s tables object constructor
* @constructor
*
*@param {array} table - Table added when object is created
*@param {string} macroName - macro name
*@param {number} parameterThreshold - size of data objects sent to SAS
*
*/
function Tables(table, macroName, parameterThreshold) {
  this._tables = {};
  this._parameterThreshold = parameterThreshold || 30000;

  this.add(table, macroName);
}

/*
* Add table to tables object
* @param {array} table - Array of table objects
* @param {string} macroName - Sas macro name
*
*/
Tables.prototype.add = function(table, macroName) {
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

  var result = this._utils.convertTableObject(table, this._parameterThreshold);

  var tableArray = [];
  tableArray.push(JSON.stringify(result.spec));
  for (var numberOfTables = 0; numberOfTables < result.data.length; numberOfTables++) {
    var outString = JSON.stringify(result.data[numberOfTables]);
    tableArray.push(outString);
  }
  this._tables[macroName] = tableArray;
};

Tables.prototype._utils = require('./utils.js');

module.exports = Tables;

},{"../error.js":1,"./utils.js":9}],9:[function(require,module,exports){
var h54sError = require('../error.js');
var logs = require('../logs.js');

/*
* Convert table object to Sas readable object
*
* @param {object} inObject - Object to convert
*
*/
module.exports.convertTableObject = function(inObject, chunkThreshold) {
  var self            = this;

  if(chunkThreshold > 30000) {
    console.warn('You should not set threshold larger than 30kb because of the SAS limitations');
  }

  // first check that the object is an array
  if (typeof (inObject) !== 'object') {
    throw new h54sError('argumentError', 'The parameter passed to checkAndGetTypeObject is not an object');
  }

  var arrayLength = inObject.length;
  if (typeof (arrayLength) !== 'number') {
    throw new h54sError('argumentError', 'The parameter passed to checkAndGetTypeObject does not have a valid length and is most likely not an array');
  }

  var existingCols = {}; // this is just to make lookup easier rather than traversing array each time. Will transform after

  // function checkAndSetArray - this will check an inObject current key against the existing typeArray and either return -1 if there
  // is a type mismatch or add an element and update/increment the length if needed

  function checkAndIncrement(colSpec) {
    if (typeof (existingCols[colSpec.colName]) === 'undefined') {
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
  var j                       = 0;
  for (var i = 0; i < inObject.length; i++) {
    targetArray[currentTarget][j] = {};
    var chunkRowCount             = 0;

    for (var key in inObject[i]) {
      var thisSpec  = {};
      var thisValue = inObject[i][key];

      //skip undefined values
      if(thisValue === undefined || thisValue === null) {
        continue;
      }

      //throw an error if there's NaN value
      if(typeof thisValue === 'number' && isNaN(thisValue)) {
        throw new h54sError('typeError', 'NaN value in one of the values (columns) is not allowed');
      }

      if(thisValue === -Infinity || thisValue === Infinity) {
        throw new h54sError('typeError', thisValue.toString() + ' value in one of the values (columns) is not allowed');
      }

      if(thisValue === true || thisValue === false) {
        throw new h54sError('typeError', 'Boolean value in one of the values (columns) is not allowed');
      }

      // get type... if it is an object then convert it to json and store as a string
      var thisType  = typeof (thisValue);
      var isDate = thisValue instanceof Date;
      if (thisType === 'number') { // straightforward number
        if(thisValue < Number.MIN_SAFE_INTEGER || thisValue > Number.MAX_SAFE_INTEGER) {
          logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
        }
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'num';
        thisSpec.colLength                  = 8;
        thisSpec.encodedLength              = thisValue.toString().length;
        targetArray[currentTarget][j][key]  = thisValue;
      } else if (thisType === 'string' && !isDate) { // straightforward string
        thisSpec.colName    = key;
        thisSpec.colType    = 'string';
        thisSpec.colLength  = thisValue.length;

        if (thisValue === "") {
          targetArray[currentTarget][j][key] = " ";
        } else {
          targetArray[currentTarget][j][key] = encodeURIComponent(thisValue).replace(/'/g, '%27');
        }
        thisSpec.encodedLength = targetArray[currentTarget][j][key].length;
      } else if(isDate) {
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'date';
        thisSpec.colLength                  = 8;
        targetArray[currentTarget][j][key]  = self.toSasDateTime(thisValue);
        thisSpec.encodedLength              = targetArray[currentTarget][j][key].toString().length;
      } else if (thisType == 'object') {
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'json';
        thisSpec.colLength                  = JSON.stringify(thisValue).length;
        targetArray[currentTarget][j][key]  = encodeURIComponent(JSON.stringify(thisValue)).replace(/'/g, '%27');
        thisSpec.encodedLength              = targetArray[currentTarget][j][key].length;
      }

      chunkRowCount = chunkRowCount + 6 + key.length + thisSpec.encodedLength;

      if (checkAndIncrement(thisSpec) == -1) {
        throw new h54sError('typeError', 'There is a type mismatch in the array between values (columns) of the same name.');
      }
    }

    //remove last added row if it's empty
    if(Object.keys(targetArray[currentTarget][j]).length === 0) {
      targetArray[currentTarget].splice(j, 1);
      continue;
    }

    if (chunkRowCount > chunkThreshold) {
      throw new h54sError('argumentError', 'Row ' + j + ' exceeds size limit of 32kb');
    } else if(chunkArrayCount + chunkRowCount > chunkThreshold) {
      //create new array if this one is full and move the last item to the new array
      var lastRow = targetArray[currentTarget].pop(); // get rid of that last row
      currentTarget++; // move onto the next array
      targetArray[currentTarget]  = [lastRow]; // make it an array
      j                           = 0; // initialise new row counter for new array - it will be incremented at the end of the function
      chunkArrayCount             = chunkRowCount; // this is the new chunk max size
    } else {
      chunkArrayCount = chunkArrayCount + chunkRowCount;
    }
    j++;
  }

  // reformat existingCols into an array so sas can parse it;
  var specArray = [];
  for (var k in existingCols) {
    specArray.push(existingCols[k]);
  }
  return {
    spec:       specArray,
    data:       targetArray,
    jsonLength: chunkArrayCount
  }; // the spec will be the macro[0], with the data split into arrays of macro[1-n]
  // means in terms of dojo xhr object at least they need to go into the same array
};

/*
* Convert javascript date to sas time
*
* @param {object} jsDate - javascript Date object
*
*/
module.exports.toSasDateTime = function (jsDate) {
  var basedate = new Date("January 1, 1960 00:00:00");
  var currdate = jsDate;

  // offsets for UTC and timezones and BST
  var baseOffset = basedate.getTimezoneOffset(); // in minutes
  var currOffset = currdate.getTimezoneOffset(); // in minutes

  // convert currdate to a sas datetime
  var offsetSecs    = (currOffset - baseOffset) * 60; // offsetDiff is in minutes to start with
  var baseDateSecs  = basedate.getTime() / 1000; // get rid of ms
  var currdateSecs  = currdate.getTime() / 1000; // get rid of ms
  var sasDatetime   = Math.round(currdateSecs - baseDateSecs - offsetSecs); // adjust

  return sasDatetime;
};

},{"../error.js":1,"../logs.js":4}]},{},[2])(2)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9tZXRob2RzLmpzIiwic3JjL21ldGhvZHMvdXRpbHMuanMiLCJzcmMvdGFibGVzL3RhYmxlcy5qcyIsInNyYy90YWJsZXMvdXRpbHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuKiBoNTRzIGVycm9yIGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gRXJyb3IgdHlwZVxuKkBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlIC0gRXJyb3IgbWVzc2FnZVxuKlxuKi9cbmZ1bmN0aW9uIGg1NHNFcnJvcih0eXBlLCBtZXNzYWdlKSB7XG4gIGlmKEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKSB7XG4gICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcyk7XG4gIH1cbiAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgdGhpcy50eXBlICAgID0gdHlwZTtcbn1cblxuaDU0c0Vycm9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoRXJyb3IucHJvdG90eXBlKTtcblxuaDU0c0Vycm9yLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGg1NHNFcnJvcjtcbmg1NHNFcnJvci5wcm90b3R5cGUubmFtZSA9ICdoNTRzRXJyb3InO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGg1NHNFcnJvcjtcbiIsIi8vc2VsZiBpbnZva2VkIGZ1bmN0aW9uIG1vZHVsZVxucmVxdWlyZSgnLi9pZV9wb2x5ZmlsbHMuanMnKTtcblxudmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4vZXJyb3IuanMnKTtcblxuLypcbiogUmVwcmVzZW50cyBodG1sNSBmb3Igc2FzIGFkYXB0ZXJcbiogQGNvbnN0cnVjdG9yXG4qXG4qQHBhcmFtIHtvYmplY3R9IGNvbmZpZyAtIGFkYXB0ZXIgY29uZmlnIG9iamVjdCwgd2l0aCBrZXlzIGxpa2UgdXJsLCBkZWJ1ZywgZXRjLlxuKlxuKi9cbnZhciBoNTRzID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihjb25maWcpIHtcblxuICAvL2RlZmF1bHQgY29uZmlnIHZhbHVlc1xuICB0aGlzLm1heFhoclJldHJpZXMgICAgPSA1O1xuICB0aGlzLnVybCAgICAgICAgICAgICAgPSBcIi9TQVNTdG9yZWRQcm9jZXNzL2RvXCI7XG4gIHRoaXMuZGVidWcgICAgICAgICAgICA9IGZhbHNlO1xuICB0aGlzLmxvZ2luVXJsICAgICAgICAgPSAnL1NBU0xvZ29uL0xvZ29uLmRvJztcbiAgdGhpcy5yZXRyeUFmdGVyTG9naW4gID0gdHJ1ZTtcbiAgdGhpcy5zYXNBcHAgICAgICAgICAgID0gJ1N0b3JlZCBQcm9jZXNzIFdlYiBBcHAgOS4zJztcbiAgdGhpcy5hamF4VGltZW91dCAgICAgID0gMzAwMDA7XG5cbiAgdGhpcy5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MgPSBbXTtcblxuICB0aGlzLl9wZW5kaW5nQ2FsbHMgICAgPSBbXTtcblxuICB0aGlzLl9hamF4ID0gcmVxdWlyZSgnLi9tZXRob2RzL2FqYXguanMnKSgpO1xuXG4gIF9zZXRDb25maWcuY2FsbCh0aGlzLCBjb25maWcpO1xuXG4gIC8vb3ZlcnJpZGUgd2l0aCByZW1vdGUgaWYgc2V0XG4gIGlmKGNvbmZpZyAmJiBjb25maWcuaXNSZW1vdGVDb25maWcpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB0aGlzLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xuXG4gICAgLy8gJy9iYXNlL3Rlc3QvaDU0c0NvbmZpZy5qc29uJyBpcyBmb3IgdGhlIHRlc3Rpbmcgd2l0aCBrYXJtYVxuICAgIC8vcmVwbGFjZWQgd2l0aCBndWxwIGluIGRldiBidWlsZFxuICAgIHRoaXMuX2FqYXguZ2V0KCcvYmFzZS90ZXN0L2g1NHNDb25maWcuanNvbicpLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgICB2YXIgcmVtb3RlQ29uZmlnID0gSlNPTi5wYXJzZShyZXMucmVzcG9uc2VUZXh0KTtcblxuICAgICAgZm9yKHZhciBrZXkgaW4gcmVtb3RlQ29uZmlnKSB7XG4gICAgICAgIGlmKHJlbW90ZUNvbmZpZy5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIGNvbmZpZ1trZXldID09PSB1bmRlZmluZWQgJiYga2V5ICE9PSAnaXNSZW1vdGVDb25maWcnKSB7XG4gICAgICAgICAgY29uZmlnW2tleV0gPSByZW1vdGVDb25maWdba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBfc2V0Q29uZmlnLmNhbGwoc2VsZiwgY29uZmlnKTtcblxuICAgICAgLy9leGVjdXRlIGNhbGxiYWNrcyB3aGVuIHdlIGhhdmUgcmVtb3RlIGNvbmZpZ1xuICAgICAgLy9ub3RlIHRoYXQgcmVtb3RlIGNvbmlmZyBpcyBtZXJnZWQgd2l0aCBpbnN0YW5jZSBjb25maWdcbiAgICAgIGZvcih2YXIgaSA9IDAsIG4gPSBzZWxmLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgdmFyIGZuID0gc2VsZi5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3NbaV07XG4gICAgICAgIGZuKCk7XG4gICAgICB9XG5cbiAgICAgIC8vZXhlY3V0ZSBzYXMgY2FsbHMgZGlzYWJsZWQgd2hpbGUgd2FpdGluZyBmb3IgdGhlIGNvbmZpZ1xuICAgICAgc2VsZi5fZGlzYWJsZUNhbGxzID0gZmFsc2U7XG4gICAgICB3aGlsZShzZWxmLl9wZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xuICAgICAgICB2YXIgcGVuZGluZ0NhbGwgPSBzZWxmLl9wZW5kaW5nQ2FsbHMuc2hpZnQoKTtcbiAgICAgICAgdmFyIHNhc1Byb2dyYW0gID0gcGVuZGluZ0NhbGwuc2FzUHJvZ3JhbTtcbiAgICAgICAgdmFyIGNhbGxiYWNrICAgID0gcGVuZGluZ0NhbGwuY2FsbGJhY2s7XG4gICAgICAgIHZhciBwYXJhbXMgICAgICA9IHBlbmRpbmdDYWxsLnBhcmFtcztcblxuICAgICAgICAvL3VwZGF0ZSBwcm9ncmFtIHdpdGggbWV0YWRhdGFSb290IGlmIGl0J3Mgbm90IHNldFxuICAgICAgICBpZihzZWxmLm1ldGFkYXRhUm9vdCAmJiBwZW5kaW5nQ2FsbC5wYXJhbXMuX3Byb2dyYW0uaW5kZXhPZihzZWxmLm1ldGFkYXRhUm9vdCkgPT09IC0xKSB7XG4gICAgICAgICAgcGVuZGluZ0NhbGwucGFyYW1zLl9wcm9ncmFtID0gc2VsZi5tZXRhZGF0YVJvb3QucmVwbGFjZSgvXFwvPyQvLCAnLycpICsgcGVuZGluZ0NhbGwucGFyYW1zLl9wcm9ncmFtLnJlcGxhY2UoL15cXC8vLCAnJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG4gICAgICAgIHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblxuICAgICAgICBzZWxmLmNhbGwoc2FzUHJvZ3JhbSwgbnVsbCwgY2FsbGJhY2ssIHBhcmFtcyk7XG4gICAgICB9XG4gICAgfSkuZXJyb3IoZnVuY3Rpb24gKGVycikge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYWpheEVycm9yJywgJ1JlbW90ZSBjb25maWcgZmlsZSBjYW5ub3QgYmUgbG9hZGVkLiBIdHRwIHN0YXR1cyBjb2RlOiAnICsgZXJyLnN0YXR1cyk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBwcml2YXRlIGZ1bmN0aW9uIHRvIHNldCBoNTRzIGluc3RhbmNlIHByb3BlcnRpZXNcbiAgZnVuY3Rpb24gX3NldENvbmZpZyhjb25maWcpIHtcbiAgICBpZighY29uZmlnKSB7XG4gICAgICB0aGlzLl9hamF4LnNldFRpbWVvdXQodGhpcy5hamF4VGltZW91dCk7XG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIGlmKHR5cGVvZiBjb25maWcgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IHBhcmFtZXRlciBzaG91bGQgYmUgY29uZmlnIG9iamVjdCcpO1xuICAgIH1cblxuICAgIC8vbWVyZ2UgY29uZmlnIG9iamVjdCBmcm9tIHBhcmFtZXRlciB3aXRoIHRoaXNcbiAgICBmb3IodmFyIGtleSBpbiBjb25maWcpIHtcbiAgICAgIGlmKGNvbmZpZy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgIGlmKChrZXkgPT09ICd1cmwnIHx8IGtleSA9PT0gJ2xvZ2luVXJsJykgJiYgY29uZmlnW2tleV0uY2hhckF0KDApICE9PSAnLycpIHtcbiAgICAgICAgICBjb25maWdba2V5XSA9ICcvJyArIGNvbmZpZ1trZXldO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNba2V5XSA9IGNvbmZpZ1trZXldO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vaWYgc2VydmVyIGlzIHJlbW90ZSB1c2UgdGhlIGZ1bGwgc2VydmVyIHVybFxuICAgIC8vTk9URTogdGhpcyBpcyBub3QgcGVybWl0ZWQgYnkgdGhlIHNhbWUtb3JpZ2luIHBvbGljeVxuICAgIGlmKGNvbmZpZy5ob3N0VXJsKSB7XG4gICAgICBpZihjb25maWcuaG9zdFVybC5jaGFyQXQoY29uZmlnLmhvc3RVcmwubGVuZ3RoIC0gMSkgPT09ICcvJykge1xuICAgICAgICBjb25maWcuaG9zdFVybCA9IGNvbmZpZy5ob3N0VXJsLnNsaWNlKDAsIC0xKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuaG9zdFVybCAgPSBjb25maWcuaG9zdFVybDtcbiAgICAgIHRoaXMudXJsICAgICAgPSBjb25maWcuaG9zdFVybCArIHRoaXMudXJsO1xuICAgICAgdGhpcy5sb2dpblVybCA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy5sb2dpblVybDtcbiAgICB9XG5cbiAgICB0aGlzLl9hamF4LnNldFRpbWVvdXQodGhpcy5hamF4VGltZW91dCk7XG4gIH1cbn07XG5cbi8vcmVwbGFjZWQgd2l0aCBndWxwXG5oNTRzLnZlcnNpb24gPSAnX192ZXJzaW9uX18nO1xuXG5cbmg1NHMucHJvdG90eXBlID0gcmVxdWlyZSgnLi9tZXRob2RzL21ldGhvZHMuanMnKTtcblxuaDU0cy5UYWJsZXMgPSByZXF1aXJlKCcuL3RhYmxlcy90YWJsZXMuanMnKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gIGlmICghT2JqZWN0LmNyZWF0ZSkge1xuICAgIE9iamVjdC5jcmVhdGUgPSBmdW5jdGlvbihwcm90bywgcHJvcHMpIHtcbiAgICAgIGlmICh0eXBlb2YgcHJvcHMgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgdGhyb3cgXCJUaGUgbXVsdGlwbGUtYXJndW1lbnQgdmVyc2lvbiBvZiBPYmplY3QuY3JlYXRlIGlzIG5vdCBwcm92aWRlZCBieSB0aGlzIGJyb3dzZXIgYW5kIGNhbm5vdCBiZSBzaGltbWVkLlwiO1xuICAgICAgfVxuICAgICAgZnVuY3Rpb24gY3RvcigpIHsgfVxuICAgICAgY3Rvci5wcm90b3R5cGUgPSBwcm90bztcbiAgICAgIHJldHVybiBuZXcgY3RvcigpO1xuICAgIH07XG4gIH1cblxuXG4gIC8vIEZyb20gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvT2JqZWN0L2tleXNcbiAgaWYgKCFPYmplY3Qua2V5cykge1xuICAgIE9iamVjdC5rZXlzID0gKGZ1bmN0aW9uICgpIHtcbiAgICAgICd1c2Ugc3RyaWN0JztcbiAgICAgIHZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHksXG4gICAgICAgICAgaGFzRG9udEVudW1CdWcgPSAhKHt0b1N0cmluZzogbnVsbH0pLnByb3BlcnR5SXNFbnVtZXJhYmxlKCd0b1N0cmluZycpLFxuICAgICAgICAgIGRvbnRFbnVtcyA9IFtcbiAgICAgICAgICAgICd0b1N0cmluZycsXG4gICAgICAgICAgICAndG9Mb2NhbGVTdHJpbmcnLFxuICAgICAgICAgICAgJ3ZhbHVlT2YnLFxuICAgICAgICAgICAgJ2hhc093blByb3BlcnR5JyxcbiAgICAgICAgICAgICdpc1Byb3RvdHlwZU9mJyxcbiAgICAgICAgICAgICdwcm9wZXJ0eUlzRW51bWVyYWJsZScsXG4gICAgICAgICAgICAnY29uc3RydWN0b3InXG4gICAgICAgICAgXSxcbiAgICAgICAgICBkb250RW51bXNMZW5ndGggPSBkb250RW51bXMubGVuZ3RoO1xuXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKG9iaikge1xuICAgICAgICBpZiAodHlwZW9mIG9iaiAhPT0gJ29iamVjdCcgJiYgKHR5cGVvZiBvYmogIT09ICdmdW5jdGlvbicgfHwgb2JqID09PSBudWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ09iamVjdC5rZXlzIGNhbGxlZCBvbiBub24tb2JqZWN0Jyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmVzdWx0ID0gW10sIHByb3AsIGk7XG5cbiAgICAgICAgZm9yIChwcm9wIGluIG9iaikge1xuICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCkpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKHByb3ApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChoYXNEb250RW51bUJ1Zykge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBkb250RW51bXNMZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqLCBkb250RW51bXNbaV0pKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGRvbnRFbnVtc1tpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9O1xuICAgIH0oKSk7XG4gIH1cblxuICAvLyBGcm9tIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL0FycmF5L2xhc3RJbmRleE9mXG4gIGlmICghQXJyYXkucHJvdG90eXBlLmxhc3RJbmRleE9mKSB7XG4gICAgQXJyYXkucHJvdG90eXBlLmxhc3RJbmRleE9mID0gZnVuY3Rpb24oc2VhcmNoRWxlbWVudCAvKiwgZnJvbUluZGV4Ki8pIHtcbiAgICAgICd1c2Ugc3RyaWN0JztcblxuICAgICAgaWYgKHRoaXMgPT09IHZvaWQgMCB8fCB0aGlzID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoKTtcbiAgICAgIH1cblxuICAgICAgdmFyIG4sIGssXG4gICAgICAgIHQgPSBPYmplY3QodGhpcyksXG4gICAgICAgIGxlbiA9IHQubGVuZ3RoID4+PiAwO1xuICAgICAgaWYgKGxlbiA9PT0gMCkge1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgICB9XG5cbiAgICAgIG4gPSBsZW4gLSAxO1xuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIG4gPSBOdW1iZXIoYXJndW1lbnRzWzFdKTtcbiAgICAgICAgaWYgKG4gIT0gbikge1xuICAgICAgICAgIG4gPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG4gIT09IDAgJiYgbiAhPSAoMSAvIDApICYmIG4gIT0gLSgxIC8gMCkpIHtcbiAgICAgICAgICBuID0gKG4gPiAwIHx8IC0xKSAqIE1hdGguZmxvb3IoTWF0aC5hYnMobikpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAoayA9IG4gPj0gMCA/IE1hdGgubWluKG4sIGxlbiAtIDEpIDogbGVuIC0gTWF0aC5hYnMobik7IGsgPj0gMDsgay0tKSB7XG4gICAgICAgIGlmIChrIGluIHQgJiYgdFtrXSA9PT0gc2VhcmNoRWxlbWVudCkge1xuICAgICAgICAgIHJldHVybiBrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gLTE7XG4gICAgfTtcbiAgfVxufSgpO1xuIiwidmFyIGxvZ3MgPSB7XG4gIGFwcGxpY2F0aW9uTG9nczogW10sXG4gIGRlYnVnRGF0YTogW10sXG4gIHNhc0Vycm9yczogW10sXG4gIGZhaWxlZFJlcXVlc3RzOiBbXVxufTtcblxudmFyIGxpbWl0cyA9IHtcbiAgYXBwbGljYXRpb25Mb2dzOiAxMDAsXG4gIGRlYnVnRGF0YTogMjAsXG4gIGZhaWxlZFJlcXVlc3RzOiAyMCxcbiAgc2FzRXJyb3JzOiAxMDBcbn07XG5cbm1vZHVsZS5leHBvcnRzLmdldCA9IHtcbiAgZ2V0U2FzRXJyb3JzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5zYXNFcnJvcnM7XG4gIH0sXG4gIGdldEFwcGxpY2F0aW9uTG9nczogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3MuYXBwbGljYXRpb25Mb2dzO1xuICB9LFxuICBnZXREZWJ1Z0RhdGE6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmRlYnVnRGF0YTtcbiAgfSxcbiAgZ2V0RmFpbGVkUmVxdWVzdHM6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmZhaWxlZFJlcXVlc3RzO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5jbGVhciA9IHtcbiAgY2xlYXJBcHBsaWNhdGlvbkxvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnNwbGljZSgwLCBsb2dzLmFwcGxpY2F0aW9uTG9ncy5sZW5ndGgpO1xuICB9LFxuICBjbGVhckRlYnVnRGF0YTogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5kZWJ1Z0RhdGEuc3BsaWNlKDAsIGxvZ3MuZGVidWdEYXRhLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyU2FzRXJyb3JzOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLnNhc0Vycm9ycy5zcGxpY2UoMCwgbG9ncy5zYXNFcnJvcnMubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJGYWlsZWRSZXF1ZXN0czogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5zcGxpY2UoMCwgbG9ncy5mYWlsZWRSZXF1ZXN0cy5sZW5ndGgpO1xuICB9LFxuICBjbGVhckFsbExvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuY2xlYXJBcHBsaWNhdGlvbkxvZ3MoKTtcbiAgICB0aGlzLmNsZWFyRGVidWdEYXRhKCk7XG4gICAgdGhpcy5jbGVhclNhc0Vycm9ycygpO1xuICAgIHRoaXMuY2xlYXJGYWlsZWRSZXF1ZXN0cygpO1xuICB9XG59O1xuXG4vKlxuKiBBZGRzIGFwcGxpY2F0aW9uIGxvZ3MgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkQXBwbGljYXRpb25Mb2cgPSBmdW5jdGlvbihtZXNzYWdlLCBzYXNQcm9ncmFtKSB7XG4gIGlmKG1lc3NhZ2UgPT09ICdibGFuaycpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIGxvZyA9IHtcbiAgICBtZXNzYWdlOiAgICBtZXNzYWdlLFxuICAgIHRpbWU6ICAgICAgIG5ldyBEYXRlKCksXG4gICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbVxuICB9O1xuICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5wdXNoKGxvZyk7XG5cbiAgaWYobG9ncy5hcHBsaWNhdGlvbkxvZ3MubGVuZ3RoID4gbGltaXRzLmFwcGxpY2F0aW9uTG9ncykge1xuICAgIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnNoaWZ0KCk7XG4gIH1cbn07XG5cbi8qXG4qIEFkZHMgZGVidWcgZGF0YSB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGREZWJ1Z0RhdGEgPSBmdW5jdGlvbihodG1sRGF0YSwgZGVidWdUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgbG9ncy5kZWJ1Z0RhdGEucHVzaCh7XG4gICAgZGVidWdIdG1sOiAgaHRtbERhdGEsXG4gICAgZGVidWdUZXh0OiAgZGVidWdUZXh0LFxuICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgcGFyYW1zOiAgICAgcGFyYW1zLFxuICAgIHRpbWU6ICAgICAgIG5ldyBEYXRlKClcbiAgfSk7XG5cbiAgaWYobG9ncy5kZWJ1Z0RhdGEubGVuZ3RoID4gbGltaXRzLmRlYnVnRGF0YSkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNoaWZ0KCk7XG4gIH1cbn07XG5cbi8qXG4qIEFkZHMgZmFpbGVkIHJlcXVlc3RzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEZhaWxlZFJlcXVlc3QgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSkge1xuICBsb2dzLmZhaWxlZFJlcXVlc3RzLnB1c2goe1xuICAgIHJlc3BvbnNlSHRtbDogcmVzcG9uc2VUZXh0LFxuICAgIHJlc3BvbnNlVGV4dDogZGVidWdUZXh0LFxuICAgIHNhc1Byb2dyYW06ICAgc2FzUHJvZ3JhbSxcbiAgICB0aW1lOiAgICAgICAgIG5ldyBEYXRlKClcbiAgfSk7XG5cbiAgLy9tYXggMjAgZmFpbGVkIHJlcXVlc3RzXG4gIGlmKGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoID4gbGltaXRzLmZhaWxlZFJlcXVlc3RzKSB7XG4gICAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5zaGlmdCgpO1xuICB9XG59O1xuXG4vKlxuKiBBZGRzIFNBUyBlcnJvcnMgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkU2FzRXJyb3JzID0gZnVuY3Rpb24oZXJyb3JzKSB7XG4gIGxvZ3Muc2FzRXJyb3JzID0gbG9ncy5zYXNFcnJvcnMuY29uY2F0KGVycm9ycyk7XG5cbiAgd2hpbGUobG9ncy5zYXNFcnJvcnMubGVuZ3RoID4gbGltaXRzLnNhc0Vycm9ycykge1xuICAgIGxvZ3Muc2FzRXJyb3JzLnNoaWZ0KCk7XG4gIH1cbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgdGltZW91dCA9IDMwMDAwO1xuICB2YXIgdGltZW91dEhhbmRsZTtcblxuICB2YXIgeGhyID0gZnVuY3Rpb24odHlwZSwgdXJsLCBkYXRhLCBtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgIHZhciBtZXRob2RzID0ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24oKSB7fSxcbiAgICAgIGVycm9yOiAgIGZ1bmN0aW9uKCkge31cbiAgICB9O1xuICAgIHZhciBYSFIgICAgID0gWE1MSHR0cFJlcXVlc3QgfHwgQWN0aXZlWE9iamVjdDtcbiAgICB2YXIgcmVxdWVzdCA9IG5ldyBYSFIoJ01TWE1MMi5YTUxIVFRQLjMuMCcpO1xuXG4gICAgcmVxdWVzdC5vcGVuKHR5cGUsIHVybCwgdHJ1ZSk7XG5cbiAgICAvL211bHRpcGFydC9mb3JtLWRhdGEgaXMgc2V0IGF1dG9tYXRpY2FsbHkgc28gbm8gbmVlZCBmb3IgZWxzZSBibG9ja1xuICAgIGlmKCFtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgICAgcmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyk7XG4gICAgfVxuICAgIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHJlcXVlc3QucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dEhhbmRsZSk7XG4gICAgICAgIGlmIChyZXF1ZXN0LnN0YXR1cyA+PSAyMDAgJiYgcmVxdWVzdC5zdGF0dXMgPCAzMDApIHtcbiAgICAgICAgICBtZXRob2RzLnN1Y2Nlc3MuY2FsbChtZXRob2RzLCByZXF1ZXN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtZXRob2RzLmVycm9yLmNhbGwobWV0aG9kcywgcmVxdWVzdCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgaWYodGltZW91dCA+IDApIHtcbiAgICAgIHRpbWVvdXRIYW5kbGUgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICByZXF1ZXN0LmFib3J0KCk7XG4gICAgICB9LCB0aW1lb3V0KTtcbiAgICB9XG5cbiAgICByZXF1ZXN0LnNlbmQoZGF0YSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIG1ldGhvZHMuc3VjY2VzcyA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH0sXG4gICAgICBlcnJvcjogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIG1ldGhvZHMuZXJyb3IgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG4gICAgfTtcbiAgfTtcblxuICB2YXIgc2VyaWFsaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHN0ciA9IFtdO1xuICAgIGZvcih2YXIgcCBpbiBvYmopIHtcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcbiAgICAgICAgaWYob2JqW3BdIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICBmb3IodmFyIGkgPSAwLCBuID0gb2JqW3BdLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgc3RyLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KHApICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQob2JqW3BdW2ldKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXSkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzdHIuam9pbihcIiZcIik7XG4gIH07XG5cbiAgdmFyIGNyZWF0ZU11bHRpcGFydEZvcm1EYXRhUGF5bG9hZCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBkYXRhID0gbmV3IEZvcm1EYXRhKCk7XG4gICAgZm9yKHZhciBwIGluIG9iaikge1xuICAgICAgaWYob2JqLmhhc093blByb3BlcnR5KHApKSB7XG4gICAgICAgIGlmKG9ialtwXSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgZm9yKHZhciBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXVtpXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH07XG5cbiAgcmV0dXJuIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKHVybCwgZGF0YSkge1xuICAgICAgdmFyIGRhdGFTdHI7XG4gICAgICBpZih0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgZGF0YVN0ciA9IHNlcmlhbGl6ZShkYXRhKTtcbiAgICAgIH1cbiAgICAgIHZhciB1cmxXaXRoUGFyYW1zID0gZGF0YVN0ciA/ICh1cmwgKyAnPycgKyBkYXRhU3RyKSA6IHVybDtcbiAgICAgIHJldHVybiB4aHIoJ0dFVCcsIHVybFdpdGhQYXJhbXMpO1xuICAgIH0sXG4gICAgcG9zdDogZnVuY3Rpb24odXJsLCBkYXRhLCBtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgICAgdmFyIHBheWxvYWQ7XG4gICAgICBpZih0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYobXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICAgICAgICBwYXlsb2FkID0gY3JlYXRlTXVsdGlwYXJ0Rm9ybURhdGFQYXlsb2FkKGRhdGEpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBheWxvYWQgPSBzZXJpYWxpemUoZGF0YSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiB4aHIoJ1BPU1QnLCB1cmwsIHBheWxvYWQsIG11bHRpcGFydEZvcm1EYXRhKTtcbiAgICB9LFxuICAgIHNldFRpbWVvdXQ6IGZ1bmN0aW9uKHQpIHtcbiAgICAgIHRpbWVvdXQgPSB0O1xuICAgIH1cbiAgfTtcbn07XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcbnZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xuXG4vKlxuKiBDYWxsIFNhcyBwcm9ncmFtXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gUGF0aCBvZiB0aGUgc2FzIHByb2dyYW1cbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5jYWxsID0gZnVuY3Rpb24oc2FzUHJvZ3JhbSwgdGFibGVzT2JqLCBjYWxsYmFjaywgcGFyYW1zKSB7XG4gIHZhciBzZWxmICAgICAgICA9IHRoaXM7XG4gIHZhciByZXRyeUNvdW50ICA9IDA7XG4gIHZhciBkYmcgICAgICAgICA9IHRoaXMuZGVidWc7XG5cbiAgaWYgKCFjYWxsYmFjayB8fCB0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpe1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBjYWxsYmFjaycpO1xuICB9XG4gIGlmKCFzYXNQcm9ncmFtKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdZb3UgbXVzdCBwcm92aWRlIFNhcyBwcm9ncmFtIGZpbGUgcGF0aCcpO1xuICB9XG4gIGlmKHR5cGVvZiBzYXNQcm9ncmFtICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgcGFyYW1ldGVyIHNob3VsZCBiZSBzdHJpbmcnKTtcbiAgfVxuXG4gIGlmKCFwYXJhbXMpIHtcbiAgICBwYXJhbXMgPSB7XG4gICAgICBfcHJvZ3JhbTogdGhpcy5tZXRhZGF0YVJvb3QgPyB0aGlzLm1ldGFkYXRhUm9vdC5yZXBsYWNlKC9cXC8/JC8sICcvJykgKyBzYXNQcm9ncmFtLnJlcGxhY2UoL15cXC8vLCAnJykgOiBzYXNQcm9ncmFtLFxuICAgICAgX2RlYnVnOiAgIHRoaXMuZGVidWcgPyAxMzEgOiAwLFxuICAgICAgX3NlcnZpY2U6ICdkZWZhdWx0J1xuICAgIH07XG4gIH1cblxuICBpZih0YWJsZXNPYmopIHtcbiAgICBpZih0YWJsZXNPYmogaW5zdGFuY2VvZiBoNTRzLlRhYmxlcykge1xuICAgICAgZm9yKHZhciBrZXkgaW4gdGFibGVzT2JqLl90YWJsZXMpIHtcbiAgICAgICAgaWYodGFibGVzT2JqLl90YWJsZXMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgIHBhcmFtc1trZXldID0gdGFibGVzT2JqLl90YWJsZXNba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1dyb25nIHR5cGUgb2YgdGFibGVzIG9iamVjdCcpO1xuICAgIH1cbiAgfVxuXG4gIGlmKHRoaXMuX2Rpc2FibGVDYWxscykge1xuICAgIHRoaXMuX3BlbmRpbmdDYWxscy5wdXNoKHtcbiAgICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgICBjYWxsYmFjazogICBjYWxsYmFjayxcbiAgICAgIHBhcmFtczogICAgIHBhcmFtc1xuICAgIH0pO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRoaXMuX2FqYXgucG9zdCh0aGlzLnVybCwgcGFyYW1zLCB0cnVlKS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xuICAgIGlmKHNlbGYuX3V0aWxzLm5lZWRUb0xvZ2luLmNhbGwoc2VsZiwgcmVzKSkge1xuICAgICAgLy9yZW1lbWJlciB0aGUgY2FsbCBmb3IgbGF0dGVyIHVzZVxuICAgICAgc2VsZi5fcGVuZGluZ0NhbGxzLnB1c2goe1xuICAgICAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgICAgICBjYWxsYmFjazogICBjYWxsYmFjayxcbiAgICAgICAgcGFyYW1zOiAgICAgcGFyYW1zXG4gICAgICB9KTtcblxuICAgICAgLy90aGVyZSdzIG5vIG5lZWQgdG8gY29udGludWUgaWYgcHJldmlvdXMgY2FsbCByZXR1cm5lZCBsb2dpbiBlcnJvclxuICAgICAgaWYoc2VsZi5fZGlzYWJsZUNhbGxzKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYuX2Rpc2FibGVDYWxscyA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIHZhciBzYXNBcHBNYXRjaGVzID0gcmVzLnJlc3BvbnNlVVJMLm1hdGNoKC9fc2FzYXBwPShbXiZdKikvKTtcbiAgICAgICAgc2VsZi5zYXNBcHAgPSBzYXNBcHBNYXRjaGVzWzFdLnJlcGxhY2UoL1xcKy9nLCAnICcpO1xuICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0Nhbm5vdCBleHRyYWN0IF9zYXNhcHAgcGFyYW1ldGVyIGZyb20gbG9naW4gVVJMJyk7XG4gICAgICB9XG5cbiAgICAgIGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ25vdExvZ2dlZGluRXJyb3InLCAnWW91IGFyZSBub3QgbG9nZ2VkIGluJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVzT2JqLCB1bmVzY2FwZWRSZXNPYmo7XG4gICAgICBpZighZGJnKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVzT2JqID0gc2VsZi5fdXRpbHMucGFyc2VSZXMocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKTtcbiAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKHJlc09iai5sb2dtZXNzYWdlLCBzYXNQcm9ncmFtKTtcblxuICAgICAgICAgIHJlc09iaiAgICAgICAgICA9IHNlbGYuX3V0aWxzLmNvbnZlcnREYXRlcyhyZXNPYmopO1xuICAgICAgICAgIHVuZXNjYXBlZFJlc09iaiA9IHNlbGYuX3V0aWxzLnVuZXNjYXBlVmFsdWVzKHJlc09iaik7XG5cbiAgICAgICAgICBjYWxsYmFjayh1bmRlZmluZWQsIHVuZXNjYXBlZFJlc09iaik7XG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgIGlmKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xuICAgICAgICAgICAgaWYocmV0cnlDb3VudCA8IHNlbGYubWF4WGhyUmV0cmllcykge1xuICAgICAgICAgICAgICBzZWxmLl9hamF4LnBvc3Qoc2VsZi51cmwsIHBhcmFtcywgdHJ1ZSkuc3VjY2Vzcyh0aGlzLnN1Y2Nlc3MpLmVycm9yKHRoaXMuZXJyb3IpO1xuICAgICAgICAgICAgICByZXRyeUNvdW50Kys7XG4gICAgICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coXCJSZXRyeWluZyAjXCIgKyByZXRyeUNvdW50LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgICAgc2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICAgIGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgY2FsbGJhY2soZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgdmFyIGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Vua25vd25FcnJvcicsIGUubWVzc2FnZSk7XG4gICAgICAgICAgICBlcnIuc3RhY2sgPSBlLnN0YWNrO1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVzT2JqICAgICAgICAgID0gc2VsZi5fdXRpbHMucGFyc2VEZWJ1Z1JlcyhyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpO1xuICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2cocmVzT2JqLmxvZ21lc3NhZ2UsIHNhc1Byb2dyYW0pO1xuXG4gICAgICAgICAgcmVzT2JqICAgICAgICAgID0gc2VsZi5fdXRpbHMuY29udmVydERhdGVzKHJlc09iaik7XG4gICAgICAgICAgdW5lc2NhcGVkUmVzT2JqID0gc2VsZi5fdXRpbHMudW5lc2NhcGVWYWx1ZXMocmVzT2JqKTtcblxuICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgdW5lc2NhcGVkUmVzT2JqKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgaWYoZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgZS5tZXNzYWdlKSk7XG4gICAgICAgICAgfSBlbHNlIGlmKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZXJyb3IgPSBuZXcgaDU0c0Vycm9yKCd1bmtub3duRXJyb3InLCBlLm1lc3NhZ2UpO1xuICAgICAgICAgICAgZXJyb3Iuc3RhY2sgPSBlLnN0YWNrO1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSkuZXJyb3IoZnVuY3Rpb24ocmVzKSB7XG4gICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnUmVxdWVzdCBmYWlsZWQgd2l0aCBzdGF0dXM6ICcgKyByZXMuc3RhdHVzLCBzYXNQcm9ncmFtKTtcbiAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdodHRwRXJyb3InLCByZXMuc3RhdHVzVGV4dCkpO1xuICB9KTtcbn07XG5cbi8qXG4qIExvZ2luIG1ldGhvZFxuKlxuKiBAcGFyYW0ge3N0cmluZ30gdXNlciAtIExvZ2luIHVzZXJuYW1lXG4qIEBwYXJhbSB7c3RyaW5nfSBwYXNzIC0gTG9naW4gcGFzc3dvcmRcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiogT1JcbipcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5sb2dpbiA9IGZ1bmN0aW9uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZighdXNlciB8fCAhcGFzcykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnQ3JlZGVudGlhbHMgbm90IHNldCcpO1xuICB9XG4gIGlmKHR5cGVvZiB1c2VyICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgcGFzcyAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1VzZXIgYW5kIHBhc3MgcGFyYW1ldGVycyBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgfVxuICAvL05PVEU6IGNhbGxiYWNrIG9wdGlvbmFsP1xuICBpZighY2FsbGJhY2sgfHwgdHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdZb3UgbXVzdCBwcm92aWRlIGNhbGxiYWNrJyk7XG4gIH1cblxuICB2YXIgbG9naW5QYXJhbXMgPSB7XG4gICAgX3Nhc2FwcDogc2VsZi5zYXNBcHAsXG4gICAgX3NlcnZpY2U6ICdkZWZhdWx0JyxcbiAgICB1eDogdXNlcixcbiAgICBweDogcGFzcyxcbiAgICAvL2ZvciBTQVMgOS40LFxuICAgIHVzZXJuYW1lOiB1c2VyLFxuICAgIHBhc3N3b3JkOiBwYXNzXG4gIH07XG5cbiAgZm9yICh2YXIga2V5IGluIHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zKSB7XG4gICAgbG9naW5QYXJhbXNba2V5XSA9IHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zW2tleV07XG4gIH1cblxuICB0aGlzLl9hamF4LnBvc3QodGhpcy5sb2dpblVybCwgbG9naW5QYXJhbXMpLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgaWYoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XG4gICAgICAvL3dlIGFyZSBnZXR0aW5nIGZvcm0gYWdhaW4gYWZ0ZXIgcmVkaXJlY3RcbiAgICAgIC8vYW5kIG5lZWQgdG8gbG9naW4gYWdhaW4gdXNpbmcgdGhlIG5ldyB1cmxcbiAgICAgIC8vX2xvZ2luQ2hhbmdlZCBpcyBzZXQgaW4gbmVlZFRvTG9naW4gZnVuY3Rpb25cbiAgICAgIC8vYnV0IGlmIGxvZ2luIHVybCBpcyBub3QgZGlmZmVyZW50LCB3ZSBhcmUgY2hlY2tpbmcgaWYgdGhlcmUgYXJlIGFkaXRpb25hbCBwYXJhbWV0ZXJzXG4gICAgICBpZihzZWxmLl9sb2dpbkNoYW5nZWQgfHwgKHNlbGYuX2lzTmV3TG9naW5QYWdlICYmICFzZWxmLl9hZGl0aW9uYWxMb2dpblBhcmFtcykpIHtcbiAgICAgICAgZGVsZXRlIHNlbGYuX2xvZ2luQ2hhbmdlZDtcblxuICAgICAgICB2YXIgaW5wdXRzID0gcmVzLnJlc3BvbnNlVGV4dC5tYXRjaCgvPGlucHV0LipcImhpZGRlblwiW14+XSo+L2cpO1xuICAgICAgICBpZihpbnB1dHMpIHtcbiAgICAgICAgICBpbnB1dHMuZm9yRWFjaChmdW5jdGlvbihpbnB1dFN0cikge1xuICAgICAgICAgICAgdmFyIHZhbHVlTWF0Y2ggPSBpbnB1dFN0ci5tYXRjaCgvbmFtZT1cIihbXlwiXSopXCJcXHN2YWx1ZT1cIihbXlwiXSopLyk7XG4gICAgICAgICAgICBsb2dpblBhcmFtc1t2YWx1ZU1hdGNoWzFdXSA9IHZhbHVlTWF0Y2hbMl07XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3VjY2VzcyA9IHRoaXMuc3VjY2VzcywgZXJyb3IgPSB0aGlzLmVycm9yO1xuICAgICAgICBzZWxmLl9hamF4LnBvc3Qoc2VsZi5sb2dpblVybCwgbG9naW5QYXJhbXMpLnN1Y2Nlc3MoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgLy93ZSBuZWVkIHRoaXMgZ2V0IHJlcXVlc3QgYmVjYXVzZSBvZiB0aGUgc2FzIDkuNCBzZWN1cml0eSBjaGVja3NcbiAgICAgICAgICBzZWxmLl9hamF4LmdldChzZWxmLnVybCkuc3VjY2VzcyhzdWNjZXNzKS5lcnJvcihlcnJvcik7XG4gICAgICAgIH0pLmVycm9yKHRoaXMuZXJyb3IpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy9nZXR0aW5nIGZvcm0gYWdhaW4sIGJ1dCBpdCB3YXNuJ3QgYSByZWRpcmVjdFxuICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdXcm9uZyB1c2VybmFtZSBvciBwYXNzd29yZCcpO1xuICAgICAgICBjYWxsYmFjaygtMSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXG4gICAgICBzZWxmLl9kaXNhYmxlQ2FsbHMgPSBmYWxzZTtcblxuICAgICAgd2hpbGUoc2VsZi5fcGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFyIHBlbmRpbmdDYWxsICAgICA9IHNlbGYuX3BlbmRpbmdDYWxscy5zaGlmdCgpO1xuICAgICAgICB2YXIgc2FzUHJvZ3JhbSAgICAgID0gcGVuZGluZ0NhbGwuc2FzUHJvZ3JhbTtcbiAgICAgICAgdmFyIGNhbGxiYWNrUGVuZGluZyA9IHBlbmRpbmdDYWxsLmNhbGxiYWNrO1xuICAgICAgICB2YXIgcGFyYW1zICAgICAgICAgID0gcGVuZGluZ0NhbGwucGFyYW1zO1xuXG4gICAgICAgIC8vdXBkYXRlIGRlYnVnIGJlY2F1c2UgaXQgbWF5IGNoYW5nZSBpbiB0aGUgbWVhbnRpbWVcbiAgICAgICAgcGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xuXG4gICAgICAgIGlmKHNlbGYucmV0cnlBZnRlckxvZ2luKSB7XG4gICAgICAgICAgc2VsZi5jYWxsKHNhc1Byb2dyYW0sIG51bGwsIGNhbGxiYWNrUGVuZGluZywgcGFyYW1zKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSkuZXJyb3IoZnVuY3Rpb24ocmVzKSB7XG4gICAgLy9OT1RFOiBlcnJvciA1MDIgaWYgc2FzQXBwIHBhcmFtZXRlciBpcyB3cm9uZ1xuICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG4gICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG4gIH0pO1xufTtcblxuLypcbiogTG9nb3V0IG1ldGhvZFxuKlxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKi9cblxubW9kdWxlLmV4cG9ydHMubG9nb3V0ID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgdGhpcy5fYWpheC5nZXQodGhpcy51cmwsIHtfYWN0aW9uOiAnbG9nb2ZmJ30pLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgY2FsbGJhY2soKTtcbiAgfSkuZXJyb3IoZnVuY3Rpb24ocmVzKSB7XG4gICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9nb3V0IGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG4gICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG4gIH0pO1xufTtcblxuLypcbiogRW50ZXIgZGVidWcgbW9kZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnNldERlYnVnTW9kZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmRlYnVnID0gdHJ1ZTtcbn07XG5cbi8qXG4qIEV4aXQgZGVidWcgbW9kZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnVuc2V0RGVidWdNb2RlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZGVidWcgPSBmYWxzZTtcbn07XG5cbmZvcih2YXIga2V5IGluIGxvZ3MuZ2V0KSB7XG4gIGlmKGxvZ3MuZ2V0Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICBtb2R1bGUuZXhwb3J0c1trZXldID0gbG9ncy5nZXRba2V5XTtcbiAgfVxufVxuXG5mb3IodmFyIGtleSBpbiBsb2dzLmNsZWFyKSB7XG4gIGlmKGxvZ3MuY2xlYXIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgIG1vZHVsZS5leHBvcnRzW2tleV0gPSBsb2dzLmNsZWFyW2tleV07XG4gIH1cbn1cblxuLypcbiogQWRkIGNhbGxiYWNrIGZ1bmN0aW9ucyBleGVjdXRlZCB3aGVuIHByb3BlcnRpZXMgYXJlIHVwZGF0ZWQgd2l0aCByZW1vdGUgY29uZmlnXG4qXG4qQGNhbGxiYWNrIC0gY2FsbGJhY2sgcHVzaGVkIHRvIGFycmF5XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMub25SZW1vdGVDb25maWdVcGRhdGUgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICB0aGlzLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLl91dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcbiIsInZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xudmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5cbnZhciBwcm9ncmFtTm90Rm91bmRQYXR0ID0gLzx0aXRsZT4oU3RvcmVkIFByb2Nlc3MgRXJyb3J8U0FTU3RvcmVkUHJvY2Vzcyk8XFwvdGl0bGU+W1xcc1xcU10qPGgyPlN0b3JlZCBwcm9jZXNzIG5vdCBmb3VuZDouKjxcXC9oMj4vO1xuXG4vKlxuKiBQYXJzZSByZXNwb25zZSBmcm9tIHNlcnZlclxuKlxuKiBAcGFyYW0ge29iamVjdH0gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSBwYXRoXG4qIEBwYXJhbSB7b2JqZWN0fSBwYXJhbXMgLSBwYXJhbXMgc2VudCB0byBzYXMgcHJvZ3JhbSB3aXRoIGFkZFRhYmxlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMucGFyc2VSZXMgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcykge1xuICB2YXIgbWF0Y2hlcyA9IHJlc3BvbnNlVGV4dC5tYXRjaChwcm9ncmFtTm90Rm91bmRQYXR0KTtcbiAgaWYobWF0Y2hlcykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1Ob3RGb3VuZCcsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKTtcbiAgfVxuICAvL3JlbW92ZSBuZXcgbGluZXMgaW4ganNvbiByZXNwb25zZVxuICByZXR1cm4gSlNPTi5wYXJzZShyZXNwb25zZVRleHQucmVwbGFjZSgvKFxcclxcbnxcXHJ8XFxuKS9nLCAnJykpO1xufTtcblxuLypcbiogUGFyc2UgcmVzcG9uc2UgZnJvbSBzZXJ2ZXIgaW4gZGVidWcgbW9kZVxuKlxuKiBAcGFyYW0ge29iamVjdH0gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSBwYXRoXG4qIEBwYXJhbSB7b2JqZWN0fSBwYXJhbXMgLSBwYXJhbXMgc2VudCB0byBzYXMgcHJvZ3JhbSB3aXRoIGFkZFRhYmxlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMucGFyc2VEZWJ1Z1JlcyA9IGZ1bmN0aW9uKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKSB7XG4gIHZhciBtYXRjaGVzID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHByb2dyYW1Ob3RGb3VuZFBhdHQpO1xuICBpZihtYXRjaGVzKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcigncHJvZ3JhbU5vdEZvdW5kJywgJ1NhcyBwcm9ncmFtIGNvbXBsZXRlZCB3aXRoIGVycm9ycycpO1xuICB9XG5cbiAgLy9maW5kIGpzb25cbiAgcGF0dCAgICAgICAgICAgICAgPSAvXiguPy0taDU0cy1kYXRhLXN0YXJ0LS0pKFtcXFNcXHNdKj8pKC0taDU0cy1kYXRhLWVuZC0tKS9tO1xuICBtYXRjaGVzICAgICAgICAgICA9IHJlc3BvbnNlVGV4dC5tYXRjaChwYXR0KTtcblxuICB2YXIgcGFnZSAgICAgICAgICA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKHBhdHQsICcnKTtcbiAgdmFyIGh0bWxCb2R5UGF0dCAgPSAvPGJvZHkuKj4oW1xcc1xcU10qKTxcXC9ib2R5Pi87XG4gIHZhciBib2R5TWF0Y2hlcyAgID0gcGFnZS5tYXRjaChodG1sQm9keVBhdHQpO1xuXG4gIC8vcmVtb3ZlIGh0bWwgdGFnc1xuICB2YXIgZGVidWdUZXh0ID0gYm9keU1hdGNoZXNbMV0ucmVwbGFjZSgvPFtePl0qPi9nLCAnJyk7XG4gIGRlYnVnVGV4dCAgICAgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhkZWJ1Z1RleHQpO1xuXG4gIGxvZ3MuYWRkRGVidWdEYXRhKGJvZHlNYXRjaGVzWzFdLCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0sIHBhcmFtcyk7XG5cbiAgaWYodGhpcy5wYXJzZUVycm9yUmVzcG9uc2UocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKSkge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3Nhc0Vycm9yJywgJ1NhcyBwcm9ncmFtIGNvbXBsZXRlZCB3aXRoIGVycm9ycycpO1xuICB9XG5cbiAgaWYoIW1hdGNoZXMpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJyk7XG4gIH1cbiAgLy9yZW1vdmUgbmV3IGxpbmVzIGluIGpzb24gcmVzcG9uc2VcbiAgdmFyIGpzb25PYmogPSBKU09OLnBhcnNlKG1hdGNoZXNbMl0ucmVwbGFjZSgvKFxcclxcbnxcXHJ8XFxuKS9nLCAnJykpO1xuXG4gIHJldHVybiBqc29uT2JqO1xufTtcblxuLypcbiogQWRkIGZhaWxlZCByZXNwb25zZSB0byBsb2dzIC0gdXNlZCBvbmx5IGlmIGRlYnVnPWZhbHNlXG4qXG4qIEBwYXJhbSB7b2JqZWN0fSByZXNwb25zZVRleHQgLSByZXNwb25zZSBodG1sIGZyb20gdGhlIHNlcnZlclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGRGYWlsZWRSZXNwb25zZSA9IGZ1bmN0aW9uKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSkge1xuICB2YXIgcGF0dCAgICAgID0gLzxzY3JpcHQoW1xcc1xcU10qKVxcL2Zvcm0+LztcbiAgdmFyIHBhdHQyICAgICA9IC9kaXNwbGF5XFxzPzpcXHM/bm9uZTs/XFxzPy87XG4gIC8vcmVtb3ZlIHNjcmlwdCB3aXRoIGZvcm0gZm9yIHRvZ2dsaW5nIHRoZSBsb2dzIGFuZCBcImRpc3BsYXk6bm9uZVwiIGZyb20gc3R5bGVcbiAgcmVzcG9uc2VUZXh0ICA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKHBhdHQsICcnKS5yZXBsYWNlKHBhdHQyLCAnJyk7XG4gIHZhciBkZWJ1Z1RleHQgPSByZXNwb25zZVRleHQucmVwbGFjZSgvPFtePl0qPi9nLCAnJyk7XG4gIGRlYnVnVGV4dCA9IHRoaXMuZGVjb2RlSFRNTEVudGl0aWVzKGRlYnVnVGV4dCk7XG5cbiAgbG9ncy5hZGRGYWlsZWRSZXF1ZXN0KHJlc3BvbnNlVGV4dCwgZGVidWdUZXh0LCBzYXNQcm9ncmFtKTtcbn07XG5cbi8qXG4qIFVuZXNjYXBlIGFsbCBzdHJpbmcgdmFsdWVzIGluIHJldHVybmVkIG9iamVjdFxuKlxuKiBAcGFyYW0ge29iamVjdH0gb2JqXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMudW5lc2NhcGVWYWx1ZXMgPSBmdW5jdGlvbihvYmopIHtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmICh0eXBlb2Ygb2JqW2tleV0gPT09ICdzdHJpbmcnKSB7XG4gICAgICBvYmpba2V5XSA9IGRlY29kZVVSSUNvbXBvbmVudChvYmpba2V5XSk7XG4gICAgfSBlbHNlIGlmKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgICB0aGlzLnVuZXNjYXBlVmFsdWVzKG9ialtrZXldKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG9iajtcbn07XG5cbi8qXG4qIFBhcnNlIGVycm9yIHJlc3BvbnNlIGZyb20gc2VydmVyIGFuZCBzYXZlIGVycm9ycyBpbiBtZW1vcnlcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKiAjcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHdoaWNoIHJldHVybmVkIHRoZSByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlRXJyb3JSZXNwb25zZSA9IGZ1bmN0aW9uKHJlcywgc2FzUHJvZ3JhbSkge1xuICAvL2NhcHR1cmUgJ0VSUk9SOiBbdGV4dF0uJyBvciAnRVJST1IgeHggW3RleHRdLidcbiAgdmFyIHBhdHQgICAgPSAvRVJST1IoOlxcc3xcXHNcXGRcXGQpKC4qXFwufC4qXFxuLipcXC4pL2dtO1xuICB2YXIgZXJyb3JzICA9IHJlcy5tYXRjaChwYXR0KTtcbiAgaWYoIWVycm9ycykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBlcnJNZXNzYWdlO1xuICBmb3IodmFyIGkgPSAwLCBuID0gZXJyb3JzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgIGVyck1lc3NhZ2UgID0gZXJyb3JzW2ldLnJlcGxhY2UoLzxbXj5dKj4vZywgJycpLnJlcGxhY2UoLyhcXG58XFxzezIsfSkvZywgJyAnKTtcbiAgICBlcnJNZXNzYWdlICA9IHRoaXMuZGVjb2RlSFRNTEVudGl0aWVzKGVyck1lc3NhZ2UpO1xuICAgIGVycm9yc1tpXSAgID0ge1xuICAgICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbSxcbiAgICAgIG1lc3NhZ2U6ICAgIGVyck1lc3NhZ2UsXG4gICAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpXG4gICAgfTtcbiAgfVxuXG4gIGxvZ3MuYWRkU2FzRXJyb3JzKGVycm9ycyk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vKlxuKiBEZWNvZGUgSFRNTCBlbnRpdGllc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuZGVjb2RlSFRNTEVudGl0aWVzID0gZnVuY3Rpb24gKGh0bWwpIHtcbiAgdmFyIHRlbXBFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICB2YXIgc3RyICAgICAgICAgPSBodG1sLnJlcGxhY2UoLyYoIyg/OnhbMC05YS1mXSt8XFxkKyl8W2Etel0rKTsvZ2ksXG4gICAgZnVuY3Rpb24gKHN0cikge1xuICAgICAgdGVtcEVsZW1lbnQuaW5uZXJIVE1MID0gc3RyO1xuICAgICAgc3RyICAgICAgICAgICAgICAgICAgID0gdGVtcEVsZW1lbnQudGV4dENvbnRlbnQgfHwgdGVtcEVsZW1lbnQuaW5uZXJUZXh0O1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICk7XG4gIHJldHVybiBzdHI7XG59O1xuXG4vKlxuKiBDb252ZXJ0IHNhcyB0aW1lIHRvIGphdmFzY3JpcHQgZGF0ZVxuKlxuKiBAcGFyYW0ge251bWJlcn0gc2FzRGF0ZSAtIHNhcyBUYXRlIG9iamVjdFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmZyb21TYXNEYXRlVGltZSA9IGZ1bmN0aW9uIChzYXNEYXRlKSB7XG4gIHZhciBiYXNlZGF0ZSA9IG5ldyBEYXRlKFwiSmFudWFyeSAxLCAxOTYwIDAwOjAwOjAwXCIpO1xuICB2YXIgY3VycmRhdGUgPSBzYXNEYXRlO1xuXG4gIC8vIG9mZnNldHMgZm9yIFVUQyBhbmQgdGltZXpvbmVzIGFuZCBCU1RcbiAgdmFyIGJhc2VPZmZzZXQgPSBiYXNlZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXG5cbiAgLy8gY29udmVydCBzYXMgZGF0ZXRpbWUgdG8gYSBjdXJyZW50IHZhbGlkIGphdmFzY3JpcHQgZGF0ZVxuICB2YXIgYmFzZWRhdGVNcyAgPSBiYXNlZGF0ZS5nZXRUaW1lKCk7IC8vIGluIG1zXG4gIHZhciBjdXJyZGF0ZU1zICA9IGN1cnJkYXRlICogMTAwMDsgLy8gdG8gbXNcbiAgdmFyIHNhc0RhdGV0aW1lID0gY3VycmRhdGVNcyArIGJhc2VkYXRlTXM7XG4gIHZhciBqc0RhdGUgICAgICA9IG5ldyBEYXRlKCk7XG4gIGpzRGF0ZS5zZXRUaW1lKHNhc0RhdGV0aW1lKTsgLy8gZmlyc3QgdGltZSB0byBnZXQgb2Zmc2V0IEJTVCBkYXlsaWdodCBzYXZpbmdzIGV0Y1xuICB2YXIgY3Vyck9mZnNldCAgPSBqc0RhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gYWRqdXN0IGZvciBvZmZzZXQgaW4gbWludXRlc1xuICB2YXIgb2Zmc2V0VmFyICAgPSAoYmFzZU9mZnNldCAtIGN1cnJPZmZzZXQpICogNjAgKiAxMDAwOyAvLyBkaWZmZXJlbmNlIGluIG1pbGxpc2Vjb25kc1xuICB2YXIgb2Zmc2V0VGltZSAgPSBzYXNEYXRldGltZSAtIG9mZnNldFZhcjsgLy8gZmluZGluZyBCU1QgYW5kIGRheWxpZ2h0IHNhdmluZ3NcbiAganNEYXRlLnNldFRpbWUob2Zmc2V0VGltZSk7IC8vIHVwZGF0ZSB3aXRoIG9mZnNldFxuICByZXR1cm4ganNEYXRlO1xufTtcblxuLypcbiogQ29udmVydCBzYXMgdGltZXN0YW1wcyB0byBqYXZhc2NyaXB0IERhdGUgb2JqZWN0XG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBvYmpcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5jb252ZXJ0RGF0ZXMgPSBmdW5jdGlvbihvYmopIHtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmICh0eXBlb2Ygb2JqW2tleV0gPT09ICdudW1iZXInICYmIChrZXkuaW5kZXhPZignZHRfJykgPT09IDAgfHwga2V5LmluZGV4T2YoJ0RUXycpID09PSAwKSkge1xuICAgICAgb2JqW2tleV0gPSB0aGlzLmZyb21TYXNEYXRlVGltZShvYmpba2V5XSk7XG4gICAgfSBlbHNlIGlmKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgICB0aGlzLmNvbnZlcnREYXRlcyhvYmpba2V5XSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvYmo7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5uZWVkVG9Mb2dpbiA9IGZ1bmN0aW9uKHJlc3BvbnNlT2JqKSB7XG4gIHZhciBwYXR0ID0gLzxmb3JtLithY3Rpb249XCIoLipMb2dvblteXCJdKikuKj4vO1xuICB2YXIgbWF0Y2hlcyA9IHBhdHQuZXhlYyhyZXNwb25zZU9iai5yZXNwb25zZVRleHQpO1xuICB2YXIgbmV3TG9naW5Vcmw7XG5cbiAgaWYoIW1hdGNoZXMpIHtcbiAgICAvL3RoZXJlJ3Mgbm8gZm9ybSwgd2UgYXJlIGluLiBob29yYXkhXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9IGVsc2Uge1xuICAgIHZhciBhY3Rpb25VcmwgPSBtYXRjaGVzWzFdLnJlcGxhY2UoL1xcPy4qLywgJycpO1xuICAgIGlmKGFjdGlvblVybC5jaGFyQXQoMCkgPT09ICcvJykge1xuICAgICAgbmV3TG9naW5VcmwgPSB0aGlzLmhvc3RVcmwgPyB0aGlzLmhvc3RVcmwgKyBhY3Rpb25VcmwgOiBhY3Rpb25Vcmw7XG4gICAgICBpZihuZXdMb2dpblVybCAhPT0gdGhpcy5sb2dpblVybCkge1xuICAgICAgICB0aGlzLl9sb2dpbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmxvZ2luVXJsID0gbmV3TG9naW5Vcmw7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vcmVsYXRpdmUgcGF0aFxuXG4gICAgICB2YXIgbGFzdEluZE9mU2xhc2ggPSByZXNwb25zZU9iai5yZXNwb25zZVVSTC5sYXN0SW5kZXhPZignLycpICsgMTtcbiAgICAgIC8vcmVtb3ZlIGV2ZXJ5dGhpbmcgYWZ0ZXIgdGhlIGxhc3Qgc2xhc2gsIGFuZCBldmVyeXRoaW5nIHVudGlsIHRoZSBmaXJzdFxuICAgICAgdmFyIHJlbGF0aXZlTG9naW5VcmwgPSByZXNwb25zZU9iai5yZXNwb25zZVVSTC5zdWJzdHIoMCwgbGFzdEluZE9mU2xhc2gpLnJlcGxhY2UoLy4qXFwvezJ9W15cXC9dKi8sICcnKSArIGFjdGlvblVybDtcbiAgICAgIG5ld0xvZ2luVXJsID0gdGhpcy5ob3N0VXJsID8gdGhpcy5ob3N0VXJsICsgcmVsYXRpdmVMb2dpblVybCA6IHJlbGF0aXZlTG9naW5Vcmw7XG4gICAgICBpZihuZXdMb2dpblVybCAhPT0gdGhpcy5sb2dpblVybCkge1xuICAgICAgICB0aGlzLl9sb2dpbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmxvZ2luVXJsID0gbmV3TG9naW5Vcmw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy9zYXZlIHBhcmFtZXRlcnMgZnJvbSBoaWRkZW4gZm9ybSBmaWVsZHNcbiAgICB2YXIgaW5wdXRzID0gcmVzcG9uc2VPYmoucmVzcG9uc2VUZXh0Lm1hdGNoKC88aW5wdXQuKlwiaGlkZGVuXCJbXj5dKj4vZyk7XG4gICAgdmFyIGhpZGRlbkZvcm1QYXJhbXMgPSB7fTtcbiAgICBpZihpbnB1dHMpIHtcbiAgICAgIC8vaXQncyBuZXcgbG9naW4gcGFnZSBpZiB3ZSBoYXZlIHRoZXNlIGFkZGl0aW9uYWwgcGFyYW1ldGVyc1xuICAgICAgdGhpcy5faXNOZXdMb2dpblBhZ2UgPSB0cnVlO1xuICAgICAgaW5wdXRzLmZvckVhY2goZnVuY3Rpb24oaW5wdXRTdHIpIHtcbiAgICAgICAgdmFyIHZhbHVlTWF0Y2ggPSBpbnB1dFN0ci5tYXRjaCgvbmFtZT1cIihbXlwiXSopXCJcXHN2YWx1ZT1cIihbXlwiXSopLyk7XG4gICAgICAgIGhpZGRlbkZvcm1QYXJhbXNbdmFsdWVNYXRjaFsxXV0gPSB2YWx1ZU1hdGNoWzJdO1xuICAgICAgfSk7XG4gICAgICB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtcyA9IGhpZGRlbkZvcm1QYXJhbXM7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn07XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcblxuLypcbiogaDU0cyB0YWJsZXMgb2JqZWN0IGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7YXJyYXl9IHRhYmxlIC0gVGFibGUgYWRkZWQgd2hlbiBvYmplY3QgaXMgY3JlYXRlZFxuKkBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBtYWNybyBuYW1lXG4qQHBhcmFtIHtudW1iZXJ9IHBhcmFtZXRlclRocmVzaG9sZCAtIHNpemUgb2YgZGF0YSBvYmplY3RzIHNlbnQgdG8gU0FTXG4qXG4qL1xuZnVuY3Rpb24gVGFibGVzKHRhYmxlLCBtYWNyb05hbWUsIHBhcmFtZXRlclRocmVzaG9sZCkge1xuICB0aGlzLl90YWJsZXMgPSB7fTtcbiAgdGhpcy5fcGFyYW1ldGVyVGhyZXNob2xkID0gcGFyYW1ldGVyVGhyZXNob2xkIHx8IDMwMDAwO1xuXG4gIHRoaXMuYWRkKHRhYmxlLCBtYWNyb05hbWUpO1xufVxuXG4vKlxuKiBBZGQgdGFibGUgdG8gdGFibGVzIG9iamVjdFxuKiBAcGFyYW0ge2FycmF5fSB0YWJsZSAtIEFycmF5IG9mIHRhYmxlIG9iamVjdHNcbiogQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIFNhcyBtYWNybyBuYW1lXG4qXG4qL1xuVGFibGVzLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbih0YWJsZSwgbWFjcm9OYW1lKSB7XG4gIGlmKHRhYmxlICYmIG1hY3JvTmFtZSkge1xuICAgIGlmKCEodGFibGUgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgYXJndW1lbnQgbXVzdCBiZSBhcnJheScpO1xuICAgIH1cbiAgICBpZih0eXBlb2YgbWFjcm9OYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdTZWNvbmQgYXJndW1lbnQgbXVzdCBiZSBzdHJpbmcnKTtcbiAgICB9XG4gICAgaWYoIWlzTmFOKG1hY3JvTmFtZVttYWNyb05hbWUubGVuZ3RoIC0gMV0pKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01hY3JvIG5hbWUgY2Fubm90IGhhdmUgbnVtYmVyIGF0IHRoZSBlbmQnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGFyZ3VtZW50cycpO1xuICB9XG5cbiAgdmFyIHJlc3VsdCA9IHRoaXMuX3V0aWxzLmNvbnZlcnRUYWJsZU9iamVjdCh0YWJsZSwgdGhpcy5fcGFyYW1ldGVyVGhyZXNob2xkKTtcblxuICB2YXIgdGFibGVBcnJheSA9IFtdO1xuICB0YWJsZUFycmF5LnB1c2goSlNPTi5zdHJpbmdpZnkocmVzdWx0LnNwZWMpKTtcbiAgZm9yICh2YXIgbnVtYmVyT2ZUYWJsZXMgPSAwOyBudW1iZXJPZlRhYmxlcyA8IHJlc3VsdC5kYXRhLmxlbmd0aDsgbnVtYmVyT2ZUYWJsZXMrKykge1xuICAgIHZhciBvdXRTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShyZXN1bHQuZGF0YVtudW1iZXJPZlRhYmxlc10pO1xuICAgIHRhYmxlQXJyYXkucHVzaChvdXRTdHJpbmcpO1xuICB9XG4gIHRoaXMuX3RhYmxlc1ttYWNyb05hbWVdID0gdGFibGVBcnJheTtcbn07XG5cblRhYmxlcy5wcm90b3R5cGUuX3V0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRhYmxlcztcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xudmFyIGxvZ3MgPSByZXF1aXJlKCcuLi9sb2dzLmpzJyk7XG5cbi8qXG4qIENvbnZlcnQgdGFibGUgb2JqZWN0IHRvIFNhcyByZWFkYWJsZSBvYmplY3RcbipcbiogQHBhcmFtIHtvYmplY3R9IGluT2JqZWN0IC0gT2JqZWN0IHRvIGNvbnZlcnRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5jb252ZXJ0VGFibGVPYmplY3QgPSBmdW5jdGlvbihpbk9iamVjdCwgY2h1bmtUaHJlc2hvbGQpIHtcbiAgdmFyIHNlbGYgICAgICAgICAgICA9IHRoaXM7XG5cbiAgaWYoY2h1bmtUaHJlc2hvbGQgPiAzMDAwMCkge1xuICAgIGNvbnNvbGUud2FybignWW91IHNob3VsZCBub3Qgc2V0IHRocmVzaG9sZCBsYXJnZXIgdGhhbiAzMGtiIGJlY2F1c2Ugb2YgdGhlIFNBUyBsaW1pdGF0aW9ucycpO1xuICB9XG5cbiAgLy8gZmlyc3QgY2hlY2sgdGhhdCB0aGUgb2JqZWN0IGlzIGFuIGFycmF5XG4gIGlmICh0eXBlb2YgKGluT2JqZWN0KSAhPT0gJ29iamVjdCcpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RoZSBwYXJhbWV0ZXIgcGFzc2VkIHRvIGNoZWNrQW5kR2V0VHlwZU9iamVjdCBpcyBub3QgYW4gb2JqZWN0Jyk7XG4gIH1cblxuICB2YXIgYXJyYXlMZW5ndGggPSBpbk9iamVjdC5sZW5ndGg7XG4gIGlmICh0eXBlb2YgKGFycmF5TGVuZ3RoKSAhPT0gJ251bWJlcicpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RoZSBwYXJhbWV0ZXIgcGFzc2VkIHRvIGNoZWNrQW5kR2V0VHlwZU9iamVjdCBkb2VzIG5vdCBoYXZlIGEgdmFsaWQgbGVuZ3RoIGFuZCBpcyBtb3N0IGxpa2VseSBub3QgYW4gYXJyYXknKTtcbiAgfVxuXG4gIHZhciBleGlzdGluZ0NvbHMgPSB7fTsgLy8gdGhpcyBpcyBqdXN0IHRvIG1ha2UgbG9va3VwIGVhc2llciByYXRoZXIgdGhhbiB0cmF2ZXJzaW5nIGFycmF5IGVhY2ggdGltZS4gV2lsbCB0cmFuc2Zvcm0gYWZ0ZXJcblxuICAvLyBmdW5jdGlvbiBjaGVja0FuZFNldEFycmF5IC0gdGhpcyB3aWxsIGNoZWNrIGFuIGluT2JqZWN0IGN1cnJlbnQga2V5IGFnYWluc3QgdGhlIGV4aXN0aW5nIHR5cGVBcnJheSBhbmQgZWl0aGVyIHJldHVybiAtMSBpZiB0aGVyZVxuICAvLyBpcyBhIHR5cGUgbWlzbWF0Y2ggb3IgYWRkIGFuIGVsZW1lbnQgYW5kIHVwZGF0ZS9pbmNyZW1lbnQgdGhlIGxlbmd0aCBpZiBuZWVkZWRcblxuICBmdW5jdGlvbiBjaGVja0FuZEluY3JlbWVudChjb2xTcGVjKSB7XG4gICAgaWYgKHR5cGVvZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0pID09PSAndW5kZWZpbmVkJykge1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0gICAgICAgICAgID0ge307XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xOYW1lICAgPSBjb2xTcGVjLmNvbE5hbWU7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xUeXBlICAgPSBjb2xTcGVjLmNvbFR5cGU7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xMZW5ndGggPSBjb2xTcGVjLmNvbExlbmd0aCA+IDAgPyBjb2xTcGVjLmNvbExlbmd0aCA6IDE7XG4gICAgICByZXR1cm4gMDsgLy8gYWxsIG9rXG4gICAgfVxuICAgIC8vIGNoZWNrIHR5cGUgbWF0Y2hcbiAgICBpZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sVHlwZSAhPT0gY29sU3BlYy5jb2xUeXBlKSB7XG4gICAgICByZXR1cm4gLTE7IC8vIHRoZXJlIGlzIGEgZnVkZ2UgaW4gdGhlIHR5cGluZ1xuICAgIH1cbiAgICBpZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoIDwgY29sU3BlYy5jb2xMZW5ndGgpIHtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbExlbmd0aCA9IGNvbFNwZWMuY29sTGVuZ3RoID4gMCA/IGNvbFNwZWMuY29sTGVuZ3RoIDogMTsgLy8gaW5jcmVtZW50IHRoZSBtYXggbGVuZ3RoIG9mIHRoaXMgY29sdW1uXG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gIH1cbiAgdmFyIGNodW5rQXJyYXlDb3VudCAgICAgICAgID0gMDsgLy8gdGhpcyBpcyBmb3Iga2VlcGluZyB0YWJzIG9uIGhvdyBsb25nIHRoZSBjdXJyZW50IGFycmF5IHN0cmluZyB3b3VsZCBiZVxuICB2YXIgdGFyZ2V0QXJyYXkgICAgICAgICAgICAgPSBbXTsgLy8gdGhpcyBpcyB0aGUgYXJyYXkgb2YgdGFyZ2V0IGFycmF5c1xuICB2YXIgY3VycmVudFRhcmdldCAgICAgICAgICAgPSAwO1xuICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XSAgPSBbXTtcbiAgdmFyIGogICAgICAgICAgICAgICAgICAgICAgID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbk9iamVjdC5sZW5ndGg7IGkrKykge1xuICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdID0ge307XG4gICAgdmFyIGNodW5rUm93Q291bnQgICAgICAgICAgICAgPSAwO1xuXG4gICAgZm9yICh2YXIga2V5IGluIGluT2JqZWN0W2ldKSB7XG4gICAgICB2YXIgdGhpc1NwZWMgID0ge307XG4gICAgICB2YXIgdGhpc1ZhbHVlID0gaW5PYmplY3RbaV1ba2V5XTtcblxuICAgICAgLy9za2lwIHVuZGVmaW5lZCB2YWx1ZXNcbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHRoaXNWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy90aHJvdyBhbiBlcnJvciBpZiB0aGVyZSdzIE5hTiB2YWx1ZVxuICAgICAgaWYodHlwZW9mIHRoaXNWYWx1ZSA9PT0gJ251bWJlcicgJiYgaXNOYU4odGhpc1ZhbHVlKSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnTmFOIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgfVxuXG4gICAgICBpZih0aGlzVmFsdWUgPT09IC1JbmZpbml0eSB8fCB0aGlzVmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsIHRoaXNWYWx1ZS50b1N0cmluZygpICsgJyB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgIH1cblxuICAgICAgaWYodGhpc1ZhbHVlID09PSB0cnVlIHx8IHRoaXNWYWx1ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ0Jvb2xlYW4gdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIGdldCB0eXBlLi4uIGlmIGl0IGlzIGFuIG9iamVjdCB0aGVuIGNvbnZlcnQgaXQgdG8ganNvbiBhbmQgc3RvcmUgYXMgYSBzdHJpbmdcbiAgICAgIHZhciB0aGlzVHlwZSAgPSB0eXBlb2YgKHRoaXNWYWx1ZSk7XG4gICAgICB2YXIgaXNEYXRlID0gdGhpc1ZhbHVlIGluc3RhbmNlb2YgRGF0ZTtcbiAgICAgIGlmICh0aGlzVHlwZSA9PT0gJ251bWJlcicpIHsgLy8gc3RyYWlnaHRmb3J3YXJkIG51bWJlclxuICAgICAgICBpZih0aGlzVmFsdWUgPCBOdW1iZXIuTUlOX1NBRkVfSU5URUdFUiB8fCB0aGlzVmFsdWUgPiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikge1xuICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ09iamVjdFsnICsgaSArICddLicgKyBrZXkgKyAnIC0gVGhpcyB2YWx1ZSBleGNlZWRzIGV4cGVjdGVkIG51bWVyaWMgcHJlY2lzaW9uLicpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgICAgICAgICAgICAgICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgICAgICAgICAgICAgICAgICA9ICdudW0nO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggICAgICAgICAgICAgICAgICA9IDg7XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggICAgICAgICAgICAgID0gdGhpc1ZhbHVlLnRvU3RyaW5nKCkubGVuZ3RoO1xuICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldICA9IHRoaXNWYWx1ZTtcbiAgICAgIH0gZWxzZSBpZiAodGhpc1R5cGUgPT09ICdzdHJpbmcnICYmICFpc0RhdGUpIHsgLy8gc3RyYWlnaHRmb3J3YXJkIHN0cmluZ1xuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgID0gJ3N0cmluZyc7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgPSB0aGlzVmFsdWUubGVuZ3RoO1xuXG4gICAgICAgIGlmICh0aGlzVmFsdWUgPT09IFwiXCIpIHtcbiAgICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldID0gXCIgXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSA9IGVuY29kZVVSSUNvbXBvbmVudCh0aGlzVmFsdWUpLnJlcGxhY2UoLycvZywgJyUyNycpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldLmxlbmd0aDtcbiAgICAgIH0gZWxzZSBpZihpc0RhdGUpIHtcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICAgICAgICAgICAgICAgICAgPSBrZXk7XG4gICAgICAgIHRoaXNTcGVjLmNvbFR5cGUgICAgICAgICAgICAgICAgICAgID0gJ2RhdGUnO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggICAgICAgICAgICAgICAgICA9IDg7XG4gICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gID0gc2VsZi50b1Nhc0RhdGVUaW1lKHRoaXNWYWx1ZSk7XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggICAgICAgICAgICAgID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XS50b1N0cmluZygpLmxlbmd0aDtcbiAgICAgIH0gZWxzZSBpZiAodGhpc1R5cGUgPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICAgICAgICAgICAgICAgICAgPSBrZXk7XG4gICAgICAgIHRoaXNTcGVjLmNvbFR5cGUgICAgICAgICAgICAgICAgICAgID0gJ2pzb24nO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggICAgICAgICAgICAgICAgICA9IEpTT04uc3RyaW5naWZ5KHRoaXNWYWx1ZSkubGVuZ3RoO1xuICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldICA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzVmFsdWUpKS5yZXBsYWNlKC8nL2csICclMjcnKTtcbiAgICAgICAgdGhpc1NwZWMuZW5jb2RlZExlbmd0aCAgICAgICAgICAgICAgPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldLmxlbmd0aDtcbiAgICAgIH1cblxuICAgICAgY2h1bmtSb3dDb3VudCA9IGNodW5rUm93Q291bnQgKyA2ICsga2V5Lmxlbmd0aCArIHRoaXNTcGVjLmVuY29kZWRMZW5ndGg7XG5cbiAgICAgIGlmIChjaGVja0FuZEluY3JlbWVudCh0aGlzU3BlYykgPT0gLTEpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ1RoZXJlIGlzIGEgdHlwZSBtaXNtYXRjaCBpbiB0aGUgYXJyYXkgYmV0d2VlbiB2YWx1ZXMgKGNvbHVtbnMpIG9mIHRoZSBzYW1lIG5hbWUuJyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy9yZW1vdmUgbGFzdCBhZGRlZCByb3cgaWYgaXQncyBlbXB0eVxuICAgIGlmKE9iamVjdC5rZXlzKHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdKS5sZW5ndGggPT09IDApIHtcbiAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdLnNwbGljZShqLCAxKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChjaHVua1Jvd0NvdW50ID4gY2h1bmtUaHJlc2hvbGQpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnUm93ICcgKyBqICsgJyBleGNlZWRzIHNpemUgbGltaXQgb2YgMzJrYicpO1xuICAgIH0gZWxzZSBpZihjaHVua0FycmF5Q291bnQgKyBjaHVua1Jvd0NvdW50ID4gY2h1bmtUaHJlc2hvbGQpIHtcbiAgICAgIC8vY3JlYXRlIG5ldyBhcnJheSBpZiB0aGlzIG9uZSBpcyBmdWxsIGFuZCBtb3ZlIHRoZSBsYXN0IGl0ZW0gdG8gdGhlIG5ldyBhcnJheVxuICAgICAgdmFyIGxhc3RSb3cgPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XS5wb3AoKTsgLy8gZ2V0IHJpZCBvZiB0aGF0IGxhc3Qgcm93XG4gICAgICBjdXJyZW50VGFyZ2V0Kys7IC8vIG1vdmUgb250byB0aGUgbmV4dCBhcnJheVxuICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0gID0gW2xhc3RSb3ddOyAvLyBtYWtlIGl0IGFuIGFycmF5XG4gICAgICBqICAgICAgICAgICAgICAgICAgICAgICAgICAgPSAwOyAvLyBpbml0aWFsaXNlIG5ldyByb3cgY291bnRlciBmb3IgbmV3IGFycmF5IC0gaXQgd2lsbCBiZSBpbmNyZW1lbnRlZCBhdCB0aGUgZW5kIG9mIHRoZSBmdW5jdGlvblxuICAgICAgY2h1bmtBcnJheUNvdW50ICAgICAgICAgICAgID0gY2h1bmtSb3dDb3VudDsgLy8gdGhpcyBpcyB0aGUgbmV3IGNodW5rIG1heCBzaXplXG4gICAgfSBlbHNlIHtcbiAgICAgIGNodW5rQXJyYXlDb3VudCA9IGNodW5rQXJyYXlDb3VudCArIGNodW5rUm93Q291bnQ7XG4gICAgfVxuICAgIGorKztcbiAgfVxuXG4gIC8vIHJlZm9ybWF0IGV4aXN0aW5nQ29scyBpbnRvIGFuIGFycmF5IHNvIHNhcyBjYW4gcGFyc2UgaXQ7XG4gIHZhciBzcGVjQXJyYXkgPSBbXTtcbiAgZm9yICh2YXIgayBpbiBleGlzdGluZ0NvbHMpIHtcbiAgICBzcGVjQXJyYXkucHVzaChleGlzdGluZ0NvbHNba10pO1xuICB9XG4gIHJldHVybiB7XG4gICAgc3BlYzogICAgICAgc3BlY0FycmF5LFxuICAgIGRhdGE6ICAgICAgIHRhcmdldEFycmF5LFxuICAgIGpzb25MZW5ndGg6IGNodW5rQXJyYXlDb3VudFxuICB9OyAvLyB0aGUgc3BlYyB3aWxsIGJlIHRoZSBtYWNyb1swXSwgd2l0aCB0aGUgZGF0YSBzcGxpdCBpbnRvIGFycmF5cyBvZiBtYWNyb1sxLW5dXG4gIC8vIG1lYW5zIGluIHRlcm1zIG9mIGRvam8geGhyIG9iamVjdCBhdCBsZWFzdCB0aGV5IG5lZWQgdG8gZ28gaW50byB0aGUgc2FtZSBhcnJheVxufTtcblxuLypcbiogQ29udmVydCBqYXZhc2NyaXB0IGRhdGUgdG8gc2FzIHRpbWVcbipcbiogQHBhcmFtIHtvYmplY3R9IGpzRGF0ZSAtIGphdmFzY3JpcHQgRGF0ZSBvYmplY3RcbipcbiovXG5tb2R1bGUuZXhwb3J0cy50b1Nhc0RhdGVUaW1lID0gZnVuY3Rpb24gKGpzRGF0ZSkge1xuICB2YXIgYmFzZWRhdGUgPSBuZXcgRGF0ZShcIkphbnVhcnkgMSwgMTk2MCAwMDowMDowMFwiKTtcbiAgdmFyIGN1cnJkYXRlID0ganNEYXRlO1xuXG4gIC8vIG9mZnNldHMgZm9yIFVUQyBhbmQgdGltZXpvbmVzIGFuZCBCU1RcbiAgdmFyIGJhc2VPZmZzZXQgPSBiYXNlZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXG4gIHZhciBjdXJyT2Zmc2V0ID0gY3VycmRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xuXG4gIC8vIGNvbnZlcnQgY3VycmRhdGUgdG8gYSBzYXMgZGF0ZXRpbWVcbiAgdmFyIG9mZnNldFNlY3MgICAgPSAoY3Vyck9mZnNldCAtIGJhc2VPZmZzZXQpICogNjA7IC8vIG9mZnNldERpZmYgaXMgaW4gbWludXRlcyB0byBzdGFydCB3aXRoXG4gIHZhciBiYXNlRGF0ZVNlY3MgID0gYmFzZWRhdGUuZ2V0VGltZSgpIC8gMTAwMDsgLy8gZ2V0IHJpZCBvZiBtc1xuICB2YXIgY3VycmRhdGVTZWNzICA9IGN1cnJkYXRlLmdldFRpbWUoKSAvIDEwMDA7IC8vIGdldCByaWQgb2YgbXNcbiAgdmFyIHNhc0RhdGV0aW1lICAgPSBNYXRoLnJvdW5kKGN1cnJkYXRlU2VjcyAtIGJhc2VEYXRlU2VjcyAtIG9mZnNldFNlY3MpOyAvLyBhZGp1c3RcblxuICByZXR1cm4gc2FzRGF0ZXRpbWU7XG59O1xuIl19
