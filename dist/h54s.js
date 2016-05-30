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

h54sError.prototype = Object.create(Error.prototype, {
  constructor: {
    configurable: false,
    enumerable: false,
    writable: false,
    value: h54sError
  },
  name: {
    configurable: false,
    enumerable: false,
    writable: false,
    value: 'h54sError'
  }
});

module.exports = h54sError;

},{}],2:[function(require,module,exports){
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
h54s.version = '0.10.0';


h54s.prototype = require('./methods/methods.js');

h54s.Tables = require('./tables/tables.js');

//self invoked function module
require('./ie_polyfills.js');

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

  var xhr = function(type, url, data) {
    var methods = {
      success: function() {},
      error:   function() {}
    };
    var XHR     = XMLHttpRequest || ActiveXObject;
    var request = new XHR('MSXML2.XMLHTTP.3.0');

    request.open(type, url, true);
    request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
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
      var urlWithParams = dataStr ? (url + '?' + dataStr) : url;
      return xhr('GET', urlWithParams);
    },
    post: function(url, data) {
      var dataStr;
      if(typeof data === 'object') {
        dataStr = serialize(data);
      }
      return xhr('POST', url, dataStr);
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

  this._ajax.post(this.url, params).success(function(res) {
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
              self._ajax.post(self.url, params).success(this.success).error(this.error);
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

        self._ajax.post(self.loginUrl, loginParams).success(this.success).error(this.error);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9tZXRob2RzLmpzIiwic3JjL21ldGhvZHMvdXRpbHMuanMiLCJzcmMvdGFibGVzL3RhYmxlcy5qcyIsInNyYy90YWJsZXMvdXRpbHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1UkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLypcbiogaDU0cyBlcnJvciBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge3N0cmluZ30gdHlwZSAtIEVycm9yIHR5cGVcbipAcGFyYW0ge3N0cmluZ30gbWVzc2FnZSAtIEVycm9yIG1lc3NhZ2VcbipcbiovXG5mdW5jdGlvbiBoNTRzRXJyb3IodHlwZSwgbWVzc2FnZSkge1xuICBpZihFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSkge1xuICAgIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKHRoaXMpO1xuICB9XG4gIHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG4gIHRoaXMudHlwZSAgICA9IHR5cGU7XG59XG5cbmg1NHNFcnJvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKEVycm9yLnByb3RvdHlwZSwge1xuICBjb25zdHJ1Y3Rvcjoge1xuICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgd3JpdGFibGU6IGZhbHNlLFxuICAgIHZhbHVlOiBoNTRzRXJyb3JcbiAgfSxcbiAgbmFtZToge1xuICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgd3JpdGFibGU6IGZhbHNlLFxuICAgIHZhbHVlOiAnaDU0c0Vycm9yJ1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBoNTRzRXJyb3I7XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi9lcnJvci5qcycpO1xuXG4vKlxuKiBSZXByZXNlbnRzIGh0bWw1IGZvciBzYXMgYWRhcHRlclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge29iamVjdH0gY29uZmlnIC0gYWRhcHRlciBjb25maWcgb2JqZWN0LCB3aXRoIGtleXMgbGlrZSB1cmwsIGRlYnVnLCBldGMuXG4qXG4qL1xudmFyIGg1NHMgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNvbmZpZykge1xuXG4gIC8vZGVmYXVsdCBjb25maWcgdmFsdWVzXG4gIHRoaXMubWF4WGhyUmV0cmllcyAgICA9IDU7XG4gIHRoaXMudXJsICAgICAgICAgICAgICA9IFwiL1NBU1N0b3JlZFByb2Nlc3MvZG9cIjtcbiAgdGhpcy5kZWJ1ZyAgICAgICAgICAgID0gZmFsc2U7XG4gIHRoaXMubG9naW5VcmwgICAgICAgICA9ICcvU0FTTG9nb24vTG9nb24uZG8nO1xuICB0aGlzLnJldHJ5QWZ0ZXJMb2dpbiAgPSB0cnVlO1xuICB0aGlzLnNhc0FwcCAgICAgICAgICAgPSAnU3RvcmVkIFByb2Nlc3MgV2ViIEFwcCA5LjMnO1xuICB0aGlzLmFqYXhUaW1lb3V0ICAgICAgPSAzMDAwMDtcblxuICB0aGlzLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXG4gIHRoaXMuX3BlbmRpbmdDYWxscyAgICA9IFtdO1xuXG4gIHRoaXMuX2FqYXggPSByZXF1aXJlKCcuL21ldGhvZHMvYWpheC5qcycpKCk7XG5cbiAgX3NldENvbmZpZy5jYWxsKHRoaXMsIGNvbmZpZyk7XG5cbiAgLy9vdmVycmlkZSB3aXRoIHJlbW90ZSBpZiBzZXRcbiAgaWYoY29uZmlnICYmIGNvbmZpZy5pc1JlbW90ZUNvbmZpZykge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHRoaXMuX2Rpc2FibGVDYWxscyA9IHRydWU7XG5cbiAgICAvLyAnL2Jhc2UvdGVzdC9oNTRzQ29uZmlnLmpzb24nIGlzIGZvciB0aGUgdGVzdGluZyB3aXRoIGthcm1hXG4gICAgLy9yZXBsYWNlZCB3aXRoIGd1bHAgaW4gZGV2IGJ1aWxkXG4gICAgdGhpcy5fYWpheC5nZXQoJy9iYXNlL3Rlc3QvaDU0c0NvbmZpZy5qc29uJykuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICAgIHZhciByZW1vdGVDb25maWcgPSBKU09OLnBhcnNlKHJlcy5yZXNwb25zZVRleHQpO1xuXG4gICAgICBmb3IodmFyIGtleSBpbiByZW1vdGVDb25maWcpIHtcbiAgICAgICAgaWYocmVtb3RlQ29uZmlnLmhhc093blByb3BlcnR5KGtleSkgJiYgY29uZmlnW2tleV0gPT09IHVuZGVmaW5lZCAmJiBrZXkgIT09ICdpc1JlbW90ZUNvbmZpZycpIHtcbiAgICAgICAgICBjb25maWdba2V5XSA9IHJlbW90ZUNvbmZpZ1trZXldO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIF9zZXRDb25maWcuY2FsbChzZWxmLCBjb25maWcpO1xuXG4gICAgICAvL2V4ZWN1dGUgY2FsbGJhY2tzIHdoZW4gd2UgaGF2ZSByZW1vdGUgY29uZmlnXG4gICAgICAvL25vdGUgdGhhdCByZW1vdGUgY29uaWZnIGlzIG1lcmdlZCB3aXRoIGluc3RhbmNlIGNvbmZpZ1xuICAgICAgZm9yKHZhciBpID0gMCwgbiA9IHNlbGYucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICB2YXIgZm4gPSBzZWxmLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrc1tpXTtcbiAgICAgICAgZm4oKTtcbiAgICAgIH1cblxuICAgICAgLy9leGVjdXRlIHNhcyBjYWxscyBkaXNhYmxlZCB3aGlsZSB3YWl0aW5nIGZvciB0aGUgY29uZmlnXG4gICAgICBzZWxmLl9kaXNhYmxlQ2FsbHMgPSBmYWxzZTtcbiAgICAgIHdoaWxlKHNlbGYuX3BlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHZhciBwZW5kaW5nQ2FsbCA9IHNlbGYuX3BlbmRpbmdDYWxscy5zaGlmdCgpO1xuICAgICAgICB2YXIgc2FzUHJvZ3JhbSAgPSBwZW5kaW5nQ2FsbC5zYXNQcm9ncmFtO1xuICAgICAgICB2YXIgY2FsbGJhY2sgICAgPSBwZW5kaW5nQ2FsbC5jYWxsYmFjaztcbiAgICAgICAgdmFyIHBhcmFtcyAgICAgID0gcGVuZGluZ0NhbGwucGFyYW1zO1xuXG4gICAgICAgIC8vdXBkYXRlIHByb2dyYW0gd2l0aCBtZXRhZGF0YVJvb3QgaWYgaXQncyBub3Qgc2V0XG4gICAgICAgIGlmKHNlbGYubWV0YWRhdGFSb290ICYmIHBlbmRpbmdDYWxsLnBhcmFtcy5fcHJvZ3JhbS5pbmRleE9mKHNlbGYubWV0YWRhdGFSb290KSA9PT0gLTEpIHtcbiAgICAgICAgICBwZW5kaW5nQ2FsbC5wYXJhbXMuX3Byb2dyYW0gPSBzZWxmLm1ldGFkYXRhUm9vdC5yZXBsYWNlKC9cXC8/JC8sICcvJykgKyBwZW5kaW5nQ2FsbC5wYXJhbXMuX3Byb2dyYW0ucmVwbGFjZSgvXlxcLy8sICcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vdXBkYXRlIGRlYnVnIGJlY2F1c2UgaXQgbWF5IGNoYW5nZSBpbiB0aGUgbWVhbnRpbWVcbiAgICAgICAgcGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xuXG4gICAgICAgIHNlbGYuY2FsbChzYXNQcm9ncmFtLCBudWxsLCBjYWxsYmFjaywgcGFyYW1zKTtcbiAgICAgIH1cbiAgICB9KS5lcnJvcihmdW5jdGlvbiAoZXJyKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhamF4RXJyb3InLCAnUmVtb3RlIGNvbmZpZyBmaWxlIGNhbm5vdCBiZSBsb2FkZWQuIEh0dHAgc3RhdHVzIGNvZGU6ICcgKyBlcnIuc3RhdHVzKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIHByaXZhdGUgZnVuY3Rpb24gdG8gc2V0IGg1NHMgaW5zdGFuY2UgcHJvcGVydGllc1xuICBmdW5jdGlvbiBfc2V0Q29uZmlnKGNvbmZpZykge1xuICAgIGlmKCFjb25maWcpIHtcbiAgICAgIHRoaXMuX2FqYXguc2V0VGltZW91dCh0aGlzLmFqYXhUaW1lb3V0KTtcbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2UgaWYodHlwZW9mIGNvbmZpZyAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgcGFyYW1ldGVyIHNob3VsZCBiZSBjb25maWcgb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgLy9tZXJnZSBjb25maWcgb2JqZWN0IGZyb20gcGFyYW1ldGVyIHdpdGggdGhpc1xuICAgIGZvcih2YXIga2V5IGluIGNvbmZpZykge1xuICAgICAgaWYoY29uZmlnLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgaWYoKGtleSA9PT0gJ3VybCcgfHwga2V5ID09PSAnbG9naW5VcmwnKSAmJiBjb25maWdba2V5XS5jaGFyQXQoMCkgIT09ICcvJykge1xuICAgICAgICAgIGNvbmZpZ1trZXldID0gJy8nICsgY29uZmlnW2tleV07XG4gICAgICAgIH1cbiAgICAgICAgdGhpc1trZXldID0gY29uZmlnW2tleV07XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy9pZiBzZXJ2ZXIgaXMgcmVtb3RlIHVzZSB0aGUgZnVsbCBzZXJ2ZXIgdXJsXG4gICAgLy9OT1RFOiB0aGlzIGlzIG5vdCBwZXJtaXRlZCBieSB0aGUgc2FtZS1vcmlnaW4gcG9saWN5XG4gICAgaWYoY29uZmlnLmhvc3RVcmwpIHtcbiAgICAgIGlmKGNvbmZpZy5ob3N0VXJsLmNoYXJBdChjb25maWcuaG9zdFVybC5sZW5ndGggLSAxKSA9PT0gJy8nKSB7XG4gICAgICAgIGNvbmZpZy5ob3N0VXJsID0gY29uZmlnLmhvc3RVcmwuc2xpY2UoMCwgLTEpO1xuICAgICAgfVxuICAgICAgdGhpcy5ob3N0VXJsICA9IGNvbmZpZy5ob3N0VXJsO1xuICAgICAgdGhpcy51cmwgICAgICA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy51cmw7XG4gICAgICB0aGlzLmxvZ2luVXJsID0gY29uZmlnLmhvc3RVcmwgKyB0aGlzLmxvZ2luVXJsO1xuICAgIH1cblxuICAgIHRoaXMuX2FqYXguc2V0VGltZW91dCh0aGlzLmFqYXhUaW1lb3V0KTtcbiAgfVxufTtcblxuLy9yZXBsYWNlZCB3aXRoIGd1bHBcbmg1NHMudmVyc2lvbiA9ICdfX3ZlcnNpb25fXyc7XG5cblxuaDU0cy5wcm90b3R5cGUgPSByZXF1aXJlKCcuL21ldGhvZHMvbWV0aG9kcy5qcycpO1xuXG5oNTRzLlRhYmxlcyA9IHJlcXVpcmUoJy4vdGFibGVzL3RhYmxlcy5qcycpO1xuXG4vL3NlbGYgaW52b2tlZCBmdW5jdGlvbiBtb2R1bGVcbnJlcXVpcmUoJy4vaWVfcG9seWZpbGxzLmpzJyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIU9iamVjdC5jcmVhdGUpIHtcbiAgICBPYmplY3QuY3JlYXRlID0gZnVuY3Rpb24ocHJvdG8sIHByb3BzKSB7XG4gICAgICBpZiAodHlwZW9mIHByb3BzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIHRocm93IFwiVGhlIG11bHRpcGxlLWFyZ3VtZW50IHZlcnNpb24gb2YgT2JqZWN0LmNyZWF0ZSBpcyBub3QgcHJvdmlkZWQgYnkgdGhpcyBicm93c2VyIGFuZCBjYW5ub3QgYmUgc2hpbW1lZC5cIjtcbiAgICAgIH1cbiAgICAgIGZ1bmN0aW9uIGN0b3IoKSB7IH1cbiAgICAgIGN0b3IucHJvdG90eXBlID0gcHJvdG87XG4gICAgICByZXR1cm4gbmV3IGN0b3IoKTtcbiAgICB9O1xuICB9XG5cblxuICAvLyBGcm9tIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL09iamVjdC9rZXlzXG4gIGlmICghT2JqZWN0LmtleXMpIHtcbiAgICBPYmplY3Qua2V5cyA9IChmdW5jdGlvbiAoKSB7XG4gICAgICAndXNlIHN0cmljdCc7XG4gICAgICB2YXIgaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LFxuICAgICAgICAgIGhhc0RvbnRFbnVtQnVnID0gISh7dG9TdHJpbmc6IG51bGx9KS5wcm9wZXJ0eUlzRW51bWVyYWJsZSgndG9TdHJpbmcnKSxcbiAgICAgICAgICBkb250RW51bXMgPSBbXG4gICAgICAgICAgICAndG9TdHJpbmcnLFxuICAgICAgICAgICAgJ3RvTG9jYWxlU3RyaW5nJyxcbiAgICAgICAgICAgICd2YWx1ZU9mJyxcbiAgICAgICAgICAgICdoYXNPd25Qcm9wZXJ0eScsXG4gICAgICAgICAgICAnaXNQcm90b3R5cGVPZicsXG4gICAgICAgICAgICAncHJvcGVydHlJc0VudW1lcmFibGUnLFxuICAgICAgICAgICAgJ2NvbnN0cnVjdG9yJ1xuICAgICAgICAgIF0sXG4gICAgICAgICAgZG9udEVudW1zTGVuZ3RoID0gZG9udEVudW1zLmxlbmd0aDtcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChvYmopIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnICYmICh0eXBlb2Ygb2JqICE9PSAnZnVuY3Rpb24nIHx8IG9iaiA9PT0gbnVsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdPYmplY3Qua2V5cyBjYWxsZWQgb24gbm9uLW9iamVjdCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdLCBwcm9wLCBpO1xuXG4gICAgICAgIGZvciAocHJvcCBpbiBvYmopIHtcbiAgICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApKSB7XG4gICAgICAgICAgICByZXN1bHQucHVzaChwcm9wKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaGFzRG9udEVudW1CdWcpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZG9udEVudW1zTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgZG9udEVudW1zW2ldKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChkb250RW51bXNbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfTtcbiAgICB9KCkpO1xuICB9XG5cbiAgLy8gRnJvbSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9BcnJheS9sYXN0SW5kZXhPZlxuICBpZiAoIUFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZikge1xuICAgIEFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZiA9IGZ1bmN0aW9uKHNlYXJjaEVsZW1lbnQgLyosIGZyb21JbmRleCovKSB7XG4gICAgICAndXNlIHN0cmljdCc7XG5cbiAgICAgIGlmICh0aGlzID09PSB2b2lkIDAgfHwgdGhpcyA9PT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCk7XG4gICAgICB9XG5cbiAgICAgIHZhciBuLCBrLFxuICAgICAgICB0ID0gT2JqZWN0KHRoaXMpLFxuICAgICAgICBsZW4gPSB0Lmxlbmd0aCA+Pj4gMDtcbiAgICAgIGlmIChsZW4gPT09IDApIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfVxuXG4gICAgICBuID0gbGVuIC0gMTtcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBuID0gTnVtYmVyKGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGlmIChuICE9IG4pIHtcbiAgICAgICAgICBuID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChuICE9PSAwICYmIG4gIT0gKDEgLyAwKSAmJiBuICE9IC0oMSAvIDApKSB7XG4gICAgICAgICAgbiA9IChuID4gMCB8fCAtMSkgKiBNYXRoLmZsb29yKE1hdGguYWJzKG4pKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGsgPSBuID49IDAgPyBNYXRoLm1pbihuLCBsZW4gLSAxKSA6IGxlbiAtIE1hdGguYWJzKG4pOyBrID49IDA7IGstLSkge1xuICAgICAgICBpZiAoayBpbiB0ICYmIHRba10gPT09IHNlYXJjaEVsZW1lbnQpIHtcbiAgICAgICAgICByZXR1cm4gaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG4gIH1cbn0oKTtcbiIsInZhciBsb2dzID0ge1xuICBhcHBsaWNhdGlvbkxvZ3M6IFtdLFxuICBkZWJ1Z0RhdGE6IFtdLFxuICBzYXNFcnJvcnM6IFtdLFxuICBmYWlsZWRSZXF1ZXN0czogW11cbn07XG5cbnZhciBsaW1pdHMgPSB7XG4gIGFwcGxpY2F0aW9uTG9nczogMTAwLFxuICBkZWJ1Z0RhdGE6IDIwLFxuICBmYWlsZWRSZXF1ZXN0czogMjAsXG4gIHNhc0Vycm9yczogMTAwXG59O1xuXG5tb2R1bGUuZXhwb3J0cy5nZXQgPSB7XG4gIGdldFNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3Muc2FzRXJyb3JzO1xuICB9LFxuICBnZXRBcHBsaWNhdGlvbkxvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmFwcGxpY2F0aW9uTG9ncztcbiAgfSxcbiAgZ2V0RGVidWdEYXRhOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5kZWJ1Z0RhdGE7XG4gIH0sXG4gIGdldEZhaWxlZFJlcXVlc3RzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5mYWlsZWRSZXF1ZXN0cztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMuY2xlYXIgPSB7XG4gIGNsZWFyQXBwbGljYXRpb25Mb2dzOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5zcGxpY2UoMCwgbG9ncy5hcHBsaWNhdGlvbkxvZ3MubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJEZWJ1Z0RhdGE6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNwbGljZSgwLCBsb2dzLmRlYnVnRGF0YS5sZW5ndGgpO1xuICB9LFxuICBjbGVhclNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5zYXNFcnJvcnMuc3BsaWNlKDAsIGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyRmFpbGVkUmVxdWVzdHM6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZmFpbGVkUmVxdWVzdHMuc3BsaWNlKDAsIGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJBbGxMb2dzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNsZWFyQXBwbGljYXRpb25Mb2dzKCk7XG4gICAgdGhpcy5jbGVhckRlYnVnRGF0YSgpO1xuICAgIHRoaXMuY2xlYXJTYXNFcnJvcnMoKTtcbiAgICB0aGlzLmNsZWFyRmFpbGVkUmVxdWVzdHMoKTtcbiAgfVxufTtcblxuLypcbiogQWRkcyBhcHBsaWNhdGlvbiBsb2dzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEFwcGxpY2F0aW9uTG9nID0gZnVuY3Rpb24obWVzc2FnZSwgc2FzUHJvZ3JhbSkge1xuICBpZihtZXNzYWdlID09PSAnYmxhbmsnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBsb2cgPSB7XG4gICAgbWVzc2FnZTogICAgbWVzc2FnZSxcbiAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpLFxuICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW1cbiAgfTtcbiAgbG9ncy5hcHBsaWNhdGlvbkxvZ3MucHVzaChsb2cpO1xuXG4gIGlmKGxvZ3MuYXBwbGljYXRpb25Mb2dzLmxlbmd0aCA+IGxpbWl0cy5hcHBsaWNhdGlvbkxvZ3MpIHtcbiAgICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5zaGlmdCgpO1xuICB9XG59O1xuXG4vKlxuKiBBZGRzIGRlYnVnIGRhdGEgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkRGVidWdEYXRhID0gZnVuY3Rpb24oaHRtbERhdGEsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKSB7XG4gIGxvZ3MuZGVidWdEYXRhLnB1c2goe1xuICAgIGRlYnVnSHRtbDogIGh0bWxEYXRhLFxuICAgIGRlYnVnVGV4dDogIGRlYnVnVGV4dCxcbiAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgIHBhcmFtczogICAgIHBhcmFtcyxcbiAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpXG4gIH0pO1xuXG4gIGlmKGxvZ3MuZGVidWdEYXRhLmxlbmd0aCA+IGxpbWl0cy5kZWJ1Z0RhdGEpIHtcbiAgICBsb2dzLmRlYnVnRGF0YS5zaGlmdCgpO1xuICB9XG59O1xuXG4vKlxuKiBBZGRzIGZhaWxlZCByZXF1ZXN0cyB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGRGYWlsZWRSZXF1ZXN0ID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0pIHtcbiAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5wdXNoKHtcbiAgICByZXNwb25zZUh0bWw6IHJlc3BvbnNlVGV4dCxcbiAgICByZXNwb25zZVRleHQ6IGRlYnVnVGV4dCxcbiAgICBzYXNQcm9ncmFtOiAgIHNhc1Byb2dyYW0sXG4gICAgdGltZTogICAgICAgICBuZXcgRGF0ZSgpXG4gIH0pO1xuXG4gIC8vbWF4IDIwIGZhaWxlZCByZXF1ZXN0c1xuICBpZihsb2dzLmZhaWxlZFJlcXVlc3RzLmxlbmd0aCA+IGxpbWl0cy5mYWlsZWRSZXF1ZXN0cykge1xuICAgIGxvZ3MuZmFpbGVkUmVxdWVzdHMuc2hpZnQoKTtcbiAgfVxufTtcblxuLypcbiogQWRkcyBTQVMgZXJyb3JzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZFNhc0Vycm9ycyA9IGZ1bmN0aW9uKGVycm9ycykge1xuICBsb2dzLnNhc0Vycm9ycyA9IGxvZ3Muc2FzRXJyb3JzLmNvbmNhdChlcnJvcnMpO1xuXG4gIHdoaWxlKGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCA+IGxpbWl0cy5zYXNFcnJvcnMpIHtcbiAgICBsb2dzLnNhc0Vycm9ycy5zaGlmdCgpO1xuICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHRpbWVvdXQgPSAzMDAwMDtcbiAgdmFyIHRpbWVvdXRIYW5kbGU7XG5cbiAgdmFyIHhociA9IGZ1bmN0aW9uKHR5cGUsIHVybCwgZGF0YSkge1xuICAgIHZhciBtZXRob2RzID0ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24oKSB7fSxcbiAgICAgIGVycm9yOiAgIGZ1bmN0aW9uKCkge31cbiAgICB9O1xuICAgIHZhciBYSFIgICAgID0gWE1MSHR0cFJlcXVlc3QgfHwgQWN0aXZlWE9iamVjdDtcbiAgICB2YXIgcmVxdWVzdCA9IG5ldyBYSFIoJ01TWE1MMi5YTUxIVFRQLjMuMCcpO1xuXG4gICAgcmVxdWVzdC5vcGVuKHR5cGUsIHVybCwgdHJ1ZSk7XG4gICAgcmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKCdDb250ZW50LXR5cGUnLCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyk7XG4gICAgcmVxdWVzdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAocmVxdWVzdC5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlKTtcbiAgICAgICAgaWYgKHJlcXVlc3Quc3RhdHVzID49IDIwMCAmJiByZXF1ZXN0LnN0YXR1cyA8IDMwMCkge1xuICAgICAgICAgIG1ldGhvZHMuc3VjY2Vzcy5jYWxsKG1ldGhvZHMsIHJlcXVlc3QpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIG1ldGhvZHMuZXJyb3IuY2FsbChtZXRob2RzLCByZXF1ZXN0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICBpZih0aW1lb3V0ID4gMCkge1xuICAgICAgdGltZW91dEhhbmRsZSA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlcXVlc3QuYWJvcnQoKTtcbiAgICAgIH0sIHRpbWVvdXQpO1xuICAgIH1cblxuICAgIHJlcXVlc3Quc2VuZChkYXRhKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgbWV0aG9kcy5zdWNjZXNzID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfSxcbiAgICAgIGVycm9yOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgbWV0aG9kcy5lcnJvciA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cbiAgICB9O1xuICB9O1xuXG4gIHZhciBzZXJpYWxpemUgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgc3RyID0gW107XG4gICAgZm9yKHZhciBwIGluIG9iailcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcbiAgICAgICAgaWYob2JqW3BdIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICBmb3IodmFyIGkgPSAwLCBuID0gb2JqW3BdLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgc3RyLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KHApICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQob2JqW3BdW2ldKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXSkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgcmV0dXJuIHN0ci5qb2luKFwiJlwiKTtcbiAgfTtcblxuICByZXR1cm4ge1xuICAgIGdldDogZnVuY3Rpb24odXJsLCBkYXRhKSB7XG4gICAgICB2YXIgZGF0YVN0cjtcbiAgICAgIGlmKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICBkYXRhU3RyID0gc2VyaWFsaXplKGRhdGEpO1xuICAgICAgfVxuICAgICAgdmFyIHVybFdpdGhQYXJhbXMgPSBkYXRhU3RyID8gKHVybCArICc/JyArIGRhdGFTdHIpIDogdXJsO1xuICAgICAgcmV0dXJuIHhocignR0VUJywgdXJsV2l0aFBhcmFtcyk7XG4gICAgfSxcbiAgICBwb3N0OiBmdW5jdGlvbih1cmwsIGRhdGEpIHtcbiAgICAgIHZhciBkYXRhU3RyO1xuICAgICAgaWYodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGRhdGFTdHIgPSBzZXJpYWxpemUoZGF0YSk7XG4gICAgICB9XG4gICAgICByZXR1cm4geGhyKCdQT1NUJywgdXJsLCBkYXRhU3RyKTtcbiAgICB9LFxuICAgIHNldFRpbWVvdXQ6IGZ1bmN0aW9uKHQpIHtcbiAgICAgIHRpbWVvdXQgPSB0O1xuICAgIH1cbiAgfTtcbn07XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcbnZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xuXG4vKlxuKiBDYWxsIFNhcyBwcm9ncmFtXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gUGF0aCBvZiB0aGUgc2FzIHByb2dyYW1cbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5jYWxsID0gZnVuY3Rpb24oc2FzUHJvZ3JhbSwgdGFibGVzT2JqLCBjYWxsYmFjaywgcGFyYW1zKSB7XG4gIHZhciBzZWxmICAgICAgICA9IHRoaXM7XG4gIHZhciByZXRyeUNvdW50ICA9IDA7XG4gIHZhciBkYmcgICAgICAgICA9IHRoaXMuZGVidWc7XG5cbiAgaWYgKCFjYWxsYmFjayB8fCB0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpe1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBjYWxsYmFjaycpO1xuICB9XG4gIGlmKCFzYXNQcm9ncmFtKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdZb3UgbXVzdCBwcm92aWRlIFNhcyBwcm9ncmFtIGZpbGUgcGF0aCcpO1xuICB9XG4gIGlmKHR5cGVvZiBzYXNQcm9ncmFtICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgcGFyYW1ldGVyIHNob3VsZCBiZSBzdHJpbmcnKTtcbiAgfVxuXG4gIGlmKCFwYXJhbXMpIHtcbiAgICBwYXJhbXMgPSB7XG4gICAgICBfcHJvZ3JhbTogdGhpcy5tZXRhZGF0YVJvb3QgPyB0aGlzLm1ldGFkYXRhUm9vdC5yZXBsYWNlKC9cXC8/JC8sICcvJykgKyBzYXNQcm9ncmFtLnJlcGxhY2UoL15cXC8vLCAnJykgOiBzYXNQcm9ncmFtLFxuICAgICAgX2RlYnVnOiAgIHRoaXMuZGVidWcgPyAxMzEgOiAwLFxuICAgICAgX3NlcnZpY2U6ICdkZWZhdWx0JyxcbiAgICB9O1xuICB9XG5cbiAgaWYodGFibGVzT2JqKSB7XG4gICAgaWYodGFibGVzT2JqIGluc3RhbmNlb2YgaDU0cy5UYWJsZXMpIHtcbiAgICAgIGZvcih2YXIga2V5IGluIHRhYmxlc09iai5fdGFibGVzKSB7XG4gICAgICAgIGlmKHRhYmxlc09iai5fdGFibGVzLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICBwYXJhbXNba2V5XSA9IHRhYmxlc09iai5fdGFibGVzW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdXcm9uZyB0eXBlIG9mIHRhYmxlcyBvYmplY3QnKTtcbiAgICB9XG4gIH1cblxuICBpZih0aGlzLl9kaXNhYmxlQ2FsbHMpIHtcbiAgICB0aGlzLl9wZW5kaW5nQ2FsbHMucHVzaCh7XG4gICAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgICAgY2FsbGJhY2s6ICAgY2FsbGJhY2ssXG4gICAgICBwYXJhbXM6ICAgICBwYXJhbXNcbiAgICB9KTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzLl9hamF4LnBvc3QodGhpcy51cmwsIHBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICBpZihzZWxmLl91dGlscy5uZWVkVG9Mb2dpbi5jYWxsKHNlbGYsIHJlcykpIHtcbiAgICAgIC8vcmVtZW1iZXIgdGhlIGNhbGwgZm9yIGxhdHRlciB1c2VcbiAgICAgIHNlbGYuX3BlbmRpbmdDYWxscy5wdXNoKHtcbiAgICAgICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbSxcbiAgICAgICAgY2FsbGJhY2s6ICAgY2FsbGJhY2ssXG4gICAgICAgIHBhcmFtczogICAgIHBhcmFtc1xuICAgICAgfSk7XG5cbiAgICAgIC8vdGhlcmUncyBubyBuZWVkIHRvIGNvbnRpbnVlIGlmIHByZXZpb3VzIGNhbGwgcmV0dXJuZWQgbG9naW4gZXJyb3JcbiAgICAgIGlmKHNlbGYuX2Rpc2FibGVDYWxscykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICB2YXIgc2FzQXBwTWF0Y2hlcyA9IHJlcy5yZXNwb25zZVVSTC5tYXRjaCgvX3Nhc2FwcD0oW14mXSopLyk7XG4gICAgICAgIHNlbGYuc2FzQXBwID0gc2FzQXBwTWF0Y2hlc1sxXS5yZXBsYWNlKC9cXCsvZywgJyAnKTtcbiAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdDYW5ub3QgZXh0cmFjdCBfc2FzYXBwIHBhcmFtZXRlciBmcm9tIGxvZ2luIFVSTCcpO1xuICAgICAgfVxuXG4gICAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdub3RMb2dnZWRpbkVycm9yJywgJ1lvdSBhcmUgbm90IGxvZ2dlZCBpbicpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlc09iaiwgdW5lc2NhcGVkUmVzT2JqO1xuICAgICAgaWYoIWRiZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlc09iaiA9IHNlbGYuX3V0aWxzLnBhcnNlUmVzKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcyk7XG4gICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhyZXNPYmoubG9nbWVzc2FnZSwgc2FzUHJvZ3JhbSk7XG5cbiAgICAgICAgICByZXNPYmogICAgICAgICAgPSBzZWxmLl91dGlscy5jb252ZXJ0RGF0ZXMocmVzT2JqKTtcbiAgICAgICAgICB1bmVzY2FwZWRSZXNPYmogPSBzZWxmLl91dGlscy51bmVzY2FwZVZhbHVlcyhyZXNPYmopO1xuXG4gICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCB1bmVzY2FwZWRSZXNPYmopO1xuICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICBpZihlIGluc3RhbmNlb2YgU3ludGF4RXJyb3IpIHtcbiAgICAgICAgICAgIGlmKHJldHJ5Q291bnQgPCBzZWxmLm1heFhoclJldHJpZXMpIHtcbiAgICAgICAgICAgICAgc2VsZi5fYWpheC5wb3N0KHNlbGYudXJsLCBwYXJhbXMpLnN1Y2Nlc3ModGhpcy5zdWNjZXNzKS5lcnJvcih0aGlzLmVycm9yKTtcbiAgICAgICAgICAgICAgcmV0cnlDb3VudCsrO1xuICAgICAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKFwiUmV0cnlpbmcgI1wiICsgcmV0cnlDb3VudCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICAgIHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJykpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZihlIGluc3RhbmNlb2YgaDU0c0Vycm9yKSB7XG4gICAgICAgICAgICBzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICBzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIGNhbGxiYWNrKGUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICBzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgIHZhciBlcnIgPSBuZXcgaDU0c0Vycm9yKCd1bmtub3duRXJyb3InLCBlLm1lc3NhZ2UpO1xuICAgICAgICAgICAgZXJyLnN0YWNrID0gZS5zdGFjaztcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHJlc09iaiAgICAgICAgICA9IHNlbGYuX3V0aWxzLnBhcnNlRGVidWdSZXMocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKTtcbiAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKHJlc09iai5sb2dtZXNzYWdlLCBzYXNQcm9ncmFtKTtcblxuICAgICAgICAgIHJlc09iaiAgICAgICAgICA9IHNlbGYuX3V0aWxzLmNvbnZlcnREYXRlcyhyZXNPYmopO1xuICAgICAgICAgIHVuZXNjYXBlZFJlc09iaiA9IHNlbGYuX3V0aWxzLnVuZXNjYXBlVmFsdWVzKHJlc09iaik7XG5cbiAgICAgICAgICBjYWxsYmFjayh1bmRlZmluZWQsIHVuZXNjYXBlZFJlc09iaik7XG4gICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgIGlmKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xuICAgICAgICAgICAgY2FsbGJhY2sobmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsIGUubWVzc2FnZSkpO1xuICAgICAgICAgIH0gZWxzZSBpZihlIGluc3RhbmNlb2YgaDU0c0Vycm9yKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGVycm9yID0gbmV3IGg1NHNFcnJvcigndW5rbm93bkVycm9yJywgZS5tZXNzYWdlKTtcbiAgICAgICAgICAgIGVycm9yLnN0YWNrID0gZS5zdGFjaztcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0pLmVycm9yKGZ1bmN0aW9uKHJlcykge1xuICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ1JlcXVlc3QgZmFpbGVkIHdpdGggc3RhdHVzOiAnICsgcmVzLnN0YXR1cywgc2FzUHJvZ3JhbSk7XG4gICAgY2FsbGJhY2sobmV3IGg1NHNFcnJvcignaHR0cEVycm9yJywgcmVzLnN0YXR1c1RleHQpKTtcbiAgfSk7XG59O1xuXG4vKlxuKiBMb2dpbiBtZXRob2RcbipcbiogQHBhcmFtIHtzdHJpbmd9IHVzZXIgLSBMb2dpbiB1c2VybmFtZVxuKiBAcGFyYW0ge3N0cmluZ30gcGFzcyAtIExvZ2luIHBhc3N3b3JkXG4qIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gQ2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIHdoZW4gYWpheCBjYWxsIGlzIGZpbmlzaGVkXG4qXG4qIE9SXG4qXG4qIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gQ2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIHdoZW4gYWpheCBjYWxsIGlzIGZpbmlzaGVkXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMubG9naW4gPSBmdW5jdGlvbih1c2VyLCBwYXNzLCBjYWxsYmFjaykge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYoIXVzZXIgfHwgIXBhc3MpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0NyZWRlbnRpYWxzIG5vdCBzZXQnKTtcbiAgfVxuICBpZih0eXBlb2YgdXNlciAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIHBhc3MgIT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdVc2VyIGFuZCBwYXNzIHBhcmFtZXRlcnMgbXVzdCBiZSBzdHJpbmdzJyk7XG4gIH1cbiAgLy9OT1RFOiBjYWxsYmFjayBvcHRpb25hbD9cbiAgaWYoIWNhbGxiYWNrIHx8IHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBjYWxsYmFjaycpO1xuICB9XG5cbiAgdmFyIGxvZ2luUGFyYW1zID0ge1xuICAgIF9zYXNhcHA6IHNlbGYuc2FzQXBwLFxuICAgIF9zZXJ2aWNlOiAnZGVmYXVsdCcsXG4gICAgdXg6IHVzZXIsXG4gICAgcHg6IHBhc3MsXG4gICAgLy9mb3IgU0FTIDkuNCxcbiAgICB1c2VybmFtZTogdXNlcixcbiAgICBwYXNzd29yZDogcGFzc1xuICB9O1xuXG4gIGZvciAodmFyIGtleSBpbiB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtcykge1xuICAgIGxvZ2luUGFyYW1zW2tleV0gPSB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtc1trZXldO1xuICB9XG5cbiAgdGhpcy5fYWpheC5wb3N0KHRoaXMubG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xuICAgIGlmKHNlbGYuX3V0aWxzLm5lZWRUb0xvZ2luLmNhbGwoc2VsZiwgcmVzKSkge1xuICAgICAgLy93ZSBhcmUgZ2V0dGluZyBmb3JtIGFnYWluIGFmdGVyIHJlZGlyZWN0XG4gICAgICAvL2FuZCBuZWVkIHRvIGxvZ2luIGFnYWluIHVzaW5nIHRoZSBuZXcgdXJsXG4gICAgICAvL19sb2dpbkNoYW5nZWQgaXMgc2V0IGluIG5lZWRUb0xvZ2luIGZ1bmN0aW9uXG4gICAgICAvL2J1dCBpZiBsb2dpbiB1cmwgaXMgbm90IGRpZmZlcmVudCwgd2UgYXJlIGNoZWNraW5nIGlmIHRoZXJlIGFyZSBhZGl0aW9uYWwgcGFyYW1ldGVyc1xuICAgICAgaWYoc2VsZi5fbG9naW5DaGFuZ2VkIHx8IChzZWxmLl9pc05ld0xvZ2luUGFnZSAmJiAhc2VsZi5fYWRpdGlvbmFsTG9naW5QYXJhbXMpKSB7XG4gICAgICAgIGRlbGV0ZSBzZWxmLl9sb2dpbkNoYW5nZWQ7XG5cbiAgICAgICAgdmFyIGlucHV0cyA9IHJlcy5yZXNwb25zZVRleHQubWF0Y2goLzxpbnB1dC4qXCJoaWRkZW5cIltePl0qPi9nKTtcbiAgICAgICAgaWYoaW5wdXRzKSB7XG4gICAgICAgICAgaW5wdXRzLmZvckVhY2goZnVuY3Rpb24oaW5wdXRTdHIpIHtcbiAgICAgICAgICAgIHZhciB2YWx1ZU1hdGNoID0gaW5wdXRTdHIubWF0Y2goL25hbWU9XCIoW15cIl0qKVwiXFxzdmFsdWU9XCIoW15cIl0qKS8pO1xuICAgICAgICAgICAgbG9naW5QYXJhbXNbdmFsdWVNYXRjaFsxXV0gPSB2YWx1ZU1hdGNoWzJdO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgc2VsZi5fYWpheC5wb3N0KHNlbGYubG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvL2dldHRpbmcgZm9ybSBhZ2FpbiwgYnV0IGl0IHdhc24ndCBhIHJlZGlyZWN0XG4gICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ1dyb25nIHVzZXJuYW1lIG9yIHBhc3N3b3JkJyk7XG4gICAgICAgIGNhbGxiYWNrKC0xKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG5cbiAgICAgIHNlbGYuX2Rpc2FibGVDYWxscyA9IGZhbHNlO1xuXG4gICAgICB3aGlsZShzZWxmLl9wZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xuICAgICAgICB2YXIgcGVuZGluZ0NhbGwgICAgID0gc2VsZi5fcGVuZGluZ0NhbGxzLnNoaWZ0KCk7XG4gICAgICAgIHZhciBzYXNQcm9ncmFtICAgICAgPSBwZW5kaW5nQ2FsbC5zYXNQcm9ncmFtO1xuICAgICAgICB2YXIgY2FsbGJhY2tQZW5kaW5nID0gcGVuZGluZ0NhbGwuY2FsbGJhY2s7XG4gICAgICAgIHZhciBwYXJhbXMgICAgICAgICAgPSBwZW5kaW5nQ2FsbC5wYXJhbXM7XG5cbiAgICAgICAgLy91cGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxuICAgICAgICBwYXJhbXMuX2RlYnVnID0gc2VsZi5kZWJ1ZyA/IDEzMSA6IDA7XG5cbiAgICAgICAgaWYoc2VsZi5yZXRyeUFmdGVyTG9naW4pIHtcbiAgICAgICAgICBzZWxmLmNhbGwoc2FzUHJvZ3JhbSwgbnVsbCwgY2FsbGJhY2tQZW5kaW5nLCBwYXJhbXMpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9KS5lcnJvcihmdW5jdGlvbihyZXMpIHtcbiAgICAvL05PVEU6IGVycm9yIDUwMiBpZiBzYXNBcHAgcGFyYW1ldGVyIGlzIHdyb25nXG4gICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcbiAgICBjYWxsYmFjayhyZXMuc3RhdHVzKTtcbiAgfSk7XG59O1xuXG4vKlxuKiBMb2dvdXQgbWV0aG9kXG4qXG4qIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gQ2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIHdoZW4gYWpheCBjYWxsIGlzIGZpbmlzaGVkXG4qXG4qL1xuXG5tb2R1bGUuZXhwb3J0cy5sb2dvdXQgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICB0aGlzLl9hamF4LmdldCh0aGlzLnVybCwge19hY3Rpb246ICdsb2dvZmYnfSkuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICBjYWxsYmFjaygpO1xuICB9KS5lcnJvcihmdW5jdGlvbihyZXMpIHtcbiAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dvdXQgZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcbiAgICBjYWxsYmFjayhyZXMuc3RhdHVzKTtcbiAgfSk7XG59O1xuXG4vKlxuKiBFbnRlciBkZWJ1ZyBtb2RlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuc2V0RGVidWdNb2RlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZGVidWcgPSB0cnVlO1xufTtcblxuLypcbiogRXhpdCBkZWJ1ZyBtb2RlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMudW5zZXREZWJ1Z01vZGUgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5kZWJ1ZyA9IGZhbHNlO1xufTtcblxuZm9yKHZhciBrZXkgaW4gbG9ncy5nZXQpIHtcbiAgaWYobG9ncy5nZXQuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgIG1vZHVsZS5leHBvcnRzW2tleV0gPSBsb2dzLmdldFtrZXldO1xuICB9XG59XG5cbmZvcih2YXIga2V5IGluIGxvZ3MuY2xlYXIpIHtcbiAgaWYobG9ncy5jbGVhci5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgbW9kdWxlLmV4cG9ydHNba2V5XSA9IGxvZ3MuY2xlYXJba2V5XTtcbiAgfVxufVxuXG4vKlxuKiBBZGQgY2FsbGJhY2sgZnVuY3Rpb25zIGV4ZWN1dGVkIHdoZW4gcHJvcGVydGllcyBhcmUgdXBkYXRlZCB3aXRoIHJlbW90ZSBjb25maWdcbipcbipAY2FsbGJhY2sgLSBjYWxsYmFjayBwdXNoZWQgdG8gYXJyYXlcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5vblJlbW90ZUNvbmZpZ1VwZGF0ZSA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gIHRoaXMucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzLnB1c2goY2FsbGJhY2spO1xufTtcblxubW9kdWxlLmV4cG9ydHMuX3V0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuIiwidmFyIGxvZ3MgPSByZXF1aXJlKCcuLi9sb2dzLmpzJyk7XG52YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcblxudmFyIHByb2dyYW1Ob3RGb3VuZFBhdHQgPSAvPHRpdGxlPihTdG9yZWQgUHJvY2VzcyBFcnJvcnxTQVNTdG9yZWRQcm9jZXNzKTxcXC90aXRsZT5bXFxzXFxTXSo8aDI+U3RvcmVkIHByb2Nlc3Mgbm90IGZvdW5kOi4qPFxcL2gyPi87XG5cbi8qXG4qIFBhcnNlIHJlc3BvbnNlIGZyb20gc2VydmVyXG4qXG4qIEBwYXJhbSB7b2JqZWN0fSByZXNwb25zZVRleHQgLSByZXNwb25zZSBodG1sIGZyb20gdGhlIHNlcnZlclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcbiogQHBhcmFtIHtvYmplY3R9IHBhcmFtcyAtIHBhcmFtcyBzZW50IHRvIHNhcyBwcm9ncmFtIHdpdGggYWRkVGFibGVcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZVJlcyA9IGZ1bmN0aW9uKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKSB7XG4gIHZhciBtYXRjaGVzID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHByb2dyYW1Ob3RGb3VuZFBhdHQpO1xuICBpZihtYXRjaGVzKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcigncHJvZ3JhbU5vdEZvdW5kJywgJ1NhcyBwcm9ncmFtIGNvbXBsZXRlZCB3aXRoIGVycm9ycycpO1xuICB9XG4gIC8vcmVtb3ZlIG5ldyBsaW5lcyBpbiBqc29uIHJlc3BvbnNlXG4gIHJldHVybiBKU09OLnBhcnNlKHJlc3BvbnNlVGV4dC5yZXBsYWNlKC8oXFxyXFxufFxccnxcXG4pL2csICcnKSk7XG59O1xuXG4vKlxuKiBQYXJzZSByZXNwb25zZSBmcm9tIHNlcnZlciBpbiBkZWJ1ZyBtb2RlXG4qXG4qIEBwYXJhbSB7b2JqZWN0fSByZXNwb25zZVRleHQgLSByZXNwb25zZSBodG1sIGZyb20gdGhlIHNlcnZlclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcbiogQHBhcmFtIHtvYmplY3R9IHBhcmFtcyAtIHBhcmFtcyBzZW50IHRvIHNhcyBwcm9ncmFtIHdpdGggYWRkVGFibGVcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZURlYnVnUmVzID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgdmFyIG1hdGNoZXMgPSByZXNwb25zZVRleHQubWF0Y2gocHJvZ3JhbU5vdEZvdW5kUGF0dCk7XG4gIGlmKG1hdGNoZXMpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtTm90Rm91bmQnLCAnU2FzIHByb2dyYW0gY29tcGxldGVkIHdpdGggZXJyb3JzJyk7XG4gIH1cblxuICAvL2ZpbmQganNvblxuICBwYXR0ICAgICAgICAgICAgICA9IC9eKC4/LS1oNTRzLWRhdGEtc3RhcnQtLSkoW1xcU1xcc10qPykoLS1oNTRzLWRhdGEtZW5kLS0pL207XG4gIG1hdGNoZXMgICAgICAgICAgID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHBhdHQpO1xuXG4gIHZhciBwYWdlICAgICAgICAgID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UocGF0dCwgJycpO1xuICB2YXIgaHRtbEJvZHlQYXR0ICA9IC88Ym9keS4qPihbXFxzXFxTXSopPFxcL2JvZHk+LztcbiAgdmFyIGJvZHlNYXRjaGVzICAgPSBwYWdlLm1hdGNoKGh0bWxCb2R5UGF0dCk7XG5cbiAgLy9yZW1vdmUgaHRtbCB0YWdzXG4gIHZhciBkZWJ1Z1RleHQgPSBib2R5TWF0Y2hlc1sxXS5yZXBsYWNlKC88W14+XSo+L2csICcnKTtcbiAgZGVidWdUZXh0ICAgICA9IHRoaXMuZGVjb2RlSFRNTEVudGl0aWVzKGRlYnVnVGV4dCk7XG5cbiAgbG9ncy5hZGREZWJ1Z0RhdGEoYm9keU1hdGNoZXNbMV0sIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKTtcblxuICBpZih0aGlzLnBhcnNlRXJyb3JSZXNwb25zZShyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignc2FzRXJyb3InLCAnU2FzIHByb2dyYW0gY29tcGxldGVkIHdpdGggZXJyb3JzJyk7XG4gIH1cblxuICBpZighbWF0Y2hlcykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcbiAgfVxuICAvL3JlbW92ZSBuZXcgbGluZXMgaW4ganNvbiByZXNwb25zZVxuICB2YXIganNvbk9iaiA9IEpTT04ucGFyc2UobWF0Y2hlc1syXS5yZXBsYWNlKC8oXFxyXFxufFxccnxcXG4pL2csICcnKSk7XG5cbiAgcmV0dXJuIGpzb25PYmo7XG59O1xuXG4vKlxuKiBBZGQgZmFpbGVkIHJlc3BvbnNlIHRvIGxvZ3MgLSB1c2VkIG9ubHkgaWYgZGVidWc9ZmFsc2VcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEZhaWxlZFJlc3BvbnNlID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKSB7XG4gIHZhciBwYXR0ICAgICAgPSAvPHNjcmlwdChbXFxzXFxTXSopXFwvZm9ybT4vO1xuICB2YXIgcGF0dDIgICAgID0gL2Rpc3BsYXlcXHM/Olxccz9ub25lOz9cXHM/LztcbiAgLy9yZW1vdmUgc2NyaXB0IHdpdGggZm9ybSBmb3IgdG9nZ2xpbmcgdGhlIGxvZ3MgYW5kIFwiZGlzcGxheTpub25lXCIgZnJvbSBzdHlsZVxuICByZXNwb25zZVRleHQgID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UocGF0dCwgJycpLnJlcGxhY2UocGF0dDIsICcnKTtcbiAgdmFyIGRlYnVnVGV4dCA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKC88W14+XSo+L2csICcnKTtcbiAgZGVidWdUZXh0ID0gdGhpcy5kZWNvZGVIVE1MRW50aXRpZXMoZGVidWdUZXh0KTtcblxuICBsb2dzLmFkZEZhaWxlZFJlcXVlc3QocmVzcG9uc2VUZXh0LCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0pO1xufTtcblxuLypcbiogVW5lc2NhcGUgYWxsIHN0cmluZyB2YWx1ZXMgaW4gcmV0dXJuZWQgb2JqZWN0XG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBvYmpcbipcbiovXG5tb2R1bGUuZXhwb3J0cy51bmVzY2FwZVZhbHVlcyA9IGZ1bmN0aW9uKG9iaikge1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKHR5cGVvZiBvYmpba2V5XSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIG9ialtrZXldID0gZGVjb2RlVVJJQ29tcG9uZW50KG9ialtrZXldKTtcbiAgICB9IGVsc2UgaWYodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHRoaXMudW5lc2NhcGVWYWx1ZXMob2JqW2tleV0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gb2JqO1xufTtcblxuLypcbiogUGFyc2UgZXJyb3IgcmVzcG9uc2UgZnJvbSBzZXJ2ZXIgYW5kIHNhdmUgZXJyb3JzIGluIG1lbW9yeVxuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qICNwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gd2hpY2ggcmV0dXJuZWQgdGhlIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMucGFyc2VFcnJvclJlc3BvbnNlID0gZnVuY3Rpb24ocmVzLCBzYXNQcm9ncmFtKSB7XG4gIC8vY2FwdHVyZSAnRVJST1I6IFt0ZXh0XS4nIG9yICdFUlJPUiB4eCBbdGV4dF0uJ1xuICB2YXIgcGF0dCAgICA9IC9FUlJPUig6XFxzfFxcc1xcZFxcZCkoLipcXC58LipcXG4uKlxcLikvZ207XG4gIHZhciBlcnJvcnMgID0gcmVzLm1hdGNoKHBhdHQpO1xuICBpZighZXJyb3JzKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIGVyck1lc3NhZ2U7XG4gIGZvcih2YXIgaSA9IDAsIG4gPSBlcnJvcnMubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgZXJyTWVzc2FnZSAgPSBlcnJvcnNbaV0ucmVwbGFjZSgvPFtePl0qPi9nLCAnJykucmVwbGFjZSgvKFxcbnxcXHN7Mix9KS9nLCAnICcpO1xuICAgIGVyck1lc3NhZ2UgID0gdGhpcy5kZWNvZGVIVE1MRW50aXRpZXMoZXJyTWVzc2FnZSk7XG4gICAgZXJyb3JzW2ldICAgPSB7XG4gICAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgICAgbWVzc2FnZTogICAgZXJyTWVzc2FnZSxcbiAgICAgIHRpbWU6ICAgICAgIG5ldyBEYXRlKClcbiAgICB9O1xuICB9XG5cbiAgbG9ncy5hZGRTYXNFcnJvcnMoZXJyb3JzKTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8qXG4qIERlY29kZSBIVE1MIGVudGl0aWVzXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5kZWNvZGVIVE1MRW50aXRpZXMgPSBmdW5jdGlvbiAoaHRtbCkge1xuICB2YXIgdGVtcEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gIHZhciBzdHIgICAgICAgICA9IGh0bWwucmVwbGFjZSgvJigjKD86eFswLTlhLWZdK3xcXGQrKXxbYS16XSspOy9naSxcbiAgICBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICB0ZW1wRWxlbWVudC5pbm5lckhUTUwgPSBzdHI7XG4gICAgICBzdHIgICAgICAgICAgICAgICAgICAgPSB0ZW1wRWxlbWVudC50ZXh0Q29udGVudCB8fCB0ZW1wRWxlbWVudC5pbm5lclRleHQ7XG4gICAgICByZXR1cm4gc3RyO1xuICAgIH1cbiAgKTtcbiAgcmV0dXJuIHN0cjtcbn07XG5cbi8qXG4qIENvbnZlcnQgc2FzIHRpbWUgdG8gamF2YXNjcmlwdCBkYXRlXG4qXG4qIEBwYXJhbSB7bnVtYmVyfSBzYXNEYXRlIC0gc2FzIFRhdGUgb2JqZWN0XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuZnJvbVNhc0RhdGVUaW1lID0gZnVuY3Rpb24gKHNhc0RhdGUpIHtcbiAgdmFyIGJhc2VkYXRlID0gbmV3IERhdGUoXCJKYW51YXJ5IDEsIDE5NjAgMDA6MDA6MDBcIik7XG4gIHZhciBjdXJyZGF0ZSA9IHNhc0RhdGU7XG5cbiAgLy8gb2Zmc2V0cyBmb3IgVVRDIGFuZCB0aW1lem9uZXMgYW5kIEJTVFxuICB2YXIgYmFzZU9mZnNldCA9IGJhc2VkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcblxuICAvLyBjb252ZXJ0IHNhcyBkYXRldGltZSB0byBhIGN1cnJlbnQgdmFsaWQgamF2YXNjcmlwdCBkYXRlXG4gIHZhciBiYXNlZGF0ZU1zICA9IGJhc2VkYXRlLmdldFRpbWUoKTsgLy8gaW4gbXNcbiAgdmFyIGN1cnJkYXRlTXMgID0gY3VycmRhdGUgKiAxMDAwOyAvLyB0byBtc1xuICB2YXIgc2FzRGF0ZXRpbWUgPSBjdXJyZGF0ZU1zICsgYmFzZWRhdGVNcztcbiAgdmFyIGpzRGF0ZSAgICAgID0gbmV3IERhdGUoKTtcbiAganNEYXRlLnNldFRpbWUoc2FzRGF0ZXRpbWUpOyAvLyBmaXJzdCB0aW1lIHRvIGdldCBvZmZzZXQgQlNUIGRheWxpZ2h0IHNhdmluZ3MgZXRjXG4gIHZhciBjdXJyT2Zmc2V0ICA9IGpzRGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBhZGp1c3QgZm9yIG9mZnNldCBpbiBtaW51dGVzXG4gIHZhciBvZmZzZXRWYXIgICA9IChiYXNlT2Zmc2V0IC0gY3Vyck9mZnNldCkgKiA2MCAqIDEwMDA7IC8vIGRpZmZlcmVuY2UgaW4gbWlsbGlzZWNvbmRzXG4gIHZhciBvZmZzZXRUaW1lICA9IHNhc0RhdGV0aW1lIC0gb2Zmc2V0VmFyOyAvLyBmaW5kaW5nIEJTVCBhbmQgZGF5bGlnaHQgc2F2aW5nc1xuICBqc0RhdGUuc2V0VGltZShvZmZzZXRUaW1lKTsgLy8gdXBkYXRlIHdpdGggb2Zmc2V0XG4gIHJldHVybiBqc0RhdGU7XG59O1xuXG4vKlxuKiBDb252ZXJ0IHNhcyB0aW1lc3RhbXBzIHRvIGphdmFzY3JpcHQgRGF0ZSBvYmplY3RcbipcbiogQHBhcmFtIHtvYmplY3R9IG9ialxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmNvbnZlcnREYXRlcyA9IGZ1bmN0aW9uKG9iaikge1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKHR5cGVvZiBvYmpba2V5XSA9PT0gJ251bWJlcicgJiYgKGtleS5pbmRleE9mKCdkdF8nKSA9PT0gMCB8fCBrZXkuaW5kZXhPZignRFRfJykgPT09IDApKSB7XG4gICAgICBvYmpba2V5XSA9IHRoaXMuZnJvbVNhc0RhdGVUaW1lKG9ialtrZXldKTtcbiAgICB9IGVsc2UgaWYodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHRoaXMuY29udmVydERhdGVzKG9ialtrZXldKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG9iajtcbn07XG5cbm1vZHVsZS5leHBvcnRzLm5lZWRUb0xvZ2luID0gZnVuY3Rpb24ocmVzcG9uc2VPYmopIHtcbiAgdmFyIHBhdHQgPSAvPGZvcm0uK2FjdGlvbj1cIiguKkxvZ29uW15cIl0qKS4qPi87XG4gIHZhciBtYXRjaGVzID0gcGF0dC5leGVjKHJlc3BvbnNlT2JqLnJlc3BvbnNlVGV4dCk7XG4gIHZhciBuZXdMb2dpblVybDtcblxuICBpZighbWF0Y2hlcykge1xuICAgIC8vdGhlcmUncyBubyBmb3JtLCB3ZSBhcmUgaW4uIGhvb3JheSFcbiAgICByZXR1cm4gZmFsc2U7XG4gIH0gZWxzZSB7XG4gICAgdmFyIGFjdGlvblVybCA9IG1hdGNoZXNbMV0ucmVwbGFjZSgvXFw/LiovLCAnJyk7XG4gICAgaWYoYWN0aW9uVXJsLmNoYXJBdCgwKSA9PT0gJy8nKSB7XG4gICAgICBuZXdMb2dpblVybCA9IHRoaXMuaG9zdFVybCA/IHRoaXMuaG9zdFVybCArIGFjdGlvblVybCA6IGFjdGlvblVybDtcbiAgICAgIGlmKG5ld0xvZ2luVXJsICE9PSB0aGlzLmxvZ2luVXJsKSB7XG4gICAgICAgIHRoaXMuX2xvZ2luQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIHRoaXMubG9naW5VcmwgPSBuZXdMb2dpblVybDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy9yZWxhdGl2ZSBwYXRoXG5cbiAgICAgIHZhciBsYXN0SW5kT2ZTbGFzaCA9IHJlc3BvbnNlT2JqLnJlc3BvbnNlVVJMLmxhc3RJbmRleE9mKCcvJykgKyAxO1xuICAgICAgLy9yZW1vdmUgZXZlcnl0aGluZyBhZnRlciB0aGUgbGFzdCBzbGFzaCwgYW5kIGV2ZXJ5dGhpbmcgdW50aWwgdGhlIGZpcnN0XG4gICAgICB2YXIgcmVsYXRpdmVMb2dpblVybCA9IHJlc3BvbnNlT2JqLnJlc3BvbnNlVVJMLnN1YnN0cigwLCBsYXN0SW5kT2ZTbGFzaCkucmVwbGFjZSgvLipcXC97Mn1bXlxcL10qLywgJycpICsgYWN0aW9uVXJsO1xuICAgICAgbmV3TG9naW5VcmwgPSB0aGlzLmhvc3RVcmwgPyB0aGlzLmhvc3RVcmwgKyByZWxhdGl2ZUxvZ2luVXJsIDogcmVsYXRpdmVMb2dpblVybDtcbiAgICAgIGlmKG5ld0xvZ2luVXJsICE9PSB0aGlzLmxvZ2luVXJsKSB7XG4gICAgICAgIHRoaXMuX2xvZ2luQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIHRoaXMubG9naW5VcmwgPSBuZXdMb2dpblVybDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL3NhdmUgcGFyYW1ldGVycyBmcm9tIGhpZGRlbiBmb3JtIGZpZWxkc1xuICAgIHZhciBpbnB1dHMgPSByZXNwb25zZU9iai5yZXNwb25zZVRleHQubWF0Y2goLzxpbnB1dC4qXCJoaWRkZW5cIltePl0qPi9nKTtcbiAgICB2YXIgaGlkZGVuRm9ybVBhcmFtcyA9IHt9O1xuICAgIGlmKGlucHV0cykge1xuICAgICAgLy9pdCdzIG5ldyBsb2dpbiBwYWdlIGlmIHdlIGhhdmUgdGhlc2UgYWRkaXRpb25hbCBwYXJhbWV0ZXJzXG4gICAgICB0aGlzLl9pc05ld0xvZ2luUGFnZSA9IHRydWU7XG4gICAgICBpbnB1dHMuZm9yRWFjaChmdW5jdGlvbihpbnB1dFN0cikge1xuICAgICAgICB2YXIgdmFsdWVNYXRjaCA9IGlucHV0U3RyLm1hdGNoKC9uYW1lPVwiKFteXCJdKilcIlxcc3ZhbHVlPVwiKFteXCJdKikvKTtcbiAgICAgICAgaGlkZGVuRm9ybVBhcmFtc1t2YWx1ZU1hdGNoWzFdXSA9IHZhbHVlTWF0Y2hbMl07XG4gICAgICB9KTtcbiAgICAgIHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zID0gaGlkZGVuRm9ybVBhcmFtcztcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufTtcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG4vKlxuKiBoNTRzIHRhYmxlcyBvYmplY3QgY29uc3RydWN0b3JcbiogQGNvbnN0cnVjdG9yXG4qXG4qQHBhcmFtIHthcnJheX0gdGFibGUgLSBUYWJsZSBhZGRlZCB3aGVuIG9iamVjdCBpcyBjcmVhdGVkXG4qQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIG1hY3JvIG5hbWVcbipAcGFyYW0ge251bWJlcn0gcGFyYW1ldGVyVGhyZXNob2xkIC0gc2l6ZSBvZiBkYXRhIG9iamVjdHMgc2VudCB0byBTQVNcbipcbiovXG5mdW5jdGlvbiBUYWJsZXModGFibGUsIG1hY3JvTmFtZSwgcGFyYW1ldGVyVGhyZXNob2xkKSB7XG4gIHRoaXMuX3RhYmxlcyA9IHt9O1xuICB0aGlzLl9wYXJhbWV0ZXJUaHJlc2hvbGQgPSBwYXJhbWV0ZXJUaHJlc2hvbGQgfHwgMzAwMDA7XG5cbiAgdGhpcy5hZGQodGFibGUsIG1hY3JvTmFtZSk7XG59XG5cbi8qXG4qIEFkZCB0YWJsZSB0byB0YWJsZXMgb2JqZWN0XG4qIEBwYXJhbSB7YXJyYXl9IHRhYmxlIC0gQXJyYXkgb2YgdGFibGUgb2JqZWN0c1xuKiBAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gU2FzIG1hY3JvIG5hbWVcbipcbiovXG5UYWJsZXMucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKHRhYmxlLCBtYWNyb05hbWUpIHtcbiAgaWYodGFibGUgJiYgbWFjcm9OYW1lKSB7XG4gICAgaWYoISh0YWJsZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBhcmd1bWVudCBtdXN0IGJlIGFycmF5Jyk7XG4gICAgfVxuICAgIGlmKHR5cGVvZiBtYWNyb05hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1NlY29uZCBhcmd1bWVudCBtdXN0IGJlIHN0cmluZycpO1xuICAgIH1cbiAgICBpZighaXNOYU4obWFjcm9OYW1lW21hY3JvTmFtZS5sZW5ndGggLSAxXSkpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWFjcm8gbmFtZSBjYW5ub3QgaGF2ZSBudW1iZXIgYXQgdGhlIGVuZCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgYXJndW1lbnRzJyk7XG4gIH1cblxuICB2YXIgcmVzdWx0ID0gdGhpcy5fdXRpbHMuY29udmVydFRhYmxlT2JqZWN0KHRhYmxlLCB0aGlzLl9wYXJhbWV0ZXJUaHJlc2hvbGQpO1xuXG4gIHZhciB0YWJsZUFycmF5ID0gW107XG4gIHRhYmxlQXJyYXkucHVzaChKU09OLnN0cmluZ2lmeShyZXN1bHQuc3BlYykpO1xuICBmb3IgKHZhciBudW1iZXJPZlRhYmxlcyA9IDA7IG51bWJlck9mVGFibGVzIDwgcmVzdWx0LmRhdGEubGVuZ3RoOyBudW1iZXJPZlRhYmxlcysrKSB7XG4gICAgdmFyIG91dFN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHJlc3VsdC5kYXRhW251bWJlck9mVGFibGVzXSk7XG4gICAgdGFibGVBcnJheS5wdXNoKG91dFN0cmluZyk7XG4gIH1cbiAgdGhpcy5fdGFibGVzW21hY3JvTmFtZV0gPSB0YWJsZUFycmF5O1xufTtcblxuVGFibGVzLnByb3RvdHlwZS5fdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gVGFibGVzO1xuIiwidmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG52YXIgbG9ncyA9IHJlcXVpcmUoJy4uL2xvZ3MuanMnKTtcblxuLypcbiogQ29udmVydCB0YWJsZSBvYmplY3QgdG8gU2FzIHJlYWRhYmxlIG9iamVjdFxuKlxuKiBAcGFyYW0ge29iamVjdH0gaW5PYmplY3QgLSBPYmplY3QgdG8gY29udmVydFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmNvbnZlcnRUYWJsZU9iamVjdCA9IGZ1bmN0aW9uKGluT2JqZWN0LCBjaHVua1RocmVzaG9sZCkge1xuICB2YXIgc2VsZiAgICAgICAgICAgID0gdGhpcztcblxuICBpZihjaHVua1RocmVzaG9sZCA+IDMwMDAwKSB7XG4gICAgY29uc29sZS53YXJuKCdZb3Ugc2hvdWxkIG5vdCBzZXQgdGhyZXNob2xkIGxhcmdlciB0aGFuIDMwa2IgYmVjYXVzZSBvZiB0aGUgU0FTIGxpbWl0YXRpb25zJyk7XG4gIH1cblxuICAvLyBmaXJzdCBjaGVjayB0aGF0IHRoZSBvYmplY3QgaXMgYW4gYXJyYXlcbiAgaWYgKHR5cGVvZiAoaW5PYmplY3QpICE9PSAnb2JqZWN0Jykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGhlIHBhcmFtZXRlciBwYXNzZWQgdG8gY2hlY2tBbmRHZXRUeXBlT2JqZWN0IGlzIG5vdCBhbiBvYmplY3QnKTtcbiAgfVxuXG4gIHZhciBhcnJheUxlbmd0aCA9IGluT2JqZWN0Lmxlbmd0aDtcbiAgaWYgKHR5cGVvZiAoYXJyYXlMZW5ndGgpICE9PSAnbnVtYmVyJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGhlIHBhcmFtZXRlciBwYXNzZWQgdG8gY2hlY2tBbmRHZXRUeXBlT2JqZWN0IGRvZXMgbm90IGhhdmUgYSB2YWxpZCBsZW5ndGggYW5kIGlzIG1vc3QgbGlrZWx5IG5vdCBhbiBhcnJheScpO1xuICB9XG5cbiAgdmFyIGV4aXN0aW5nQ29scyA9IHt9OyAvLyB0aGlzIGlzIGp1c3QgdG8gbWFrZSBsb29rdXAgZWFzaWVyIHJhdGhlciB0aGFuIHRyYXZlcnNpbmcgYXJyYXkgZWFjaCB0aW1lLiBXaWxsIHRyYW5zZm9ybSBhZnRlclxuXG4gIC8vIGZ1bmN0aW9uIGNoZWNrQW5kU2V0QXJyYXkgLSB0aGlzIHdpbGwgY2hlY2sgYW4gaW5PYmplY3QgY3VycmVudCBrZXkgYWdhaW5zdCB0aGUgZXhpc3RpbmcgdHlwZUFycmF5IGFuZCBlaXRoZXIgcmV0dXJuIC0xIGlmIHRoZXJlXG4gIC8vIGlzIGEgdHlwZSBtaXNtYXRjaCBvciBhZGQgYW4gZWxlbWVudCBhbmQgdXBkYXRlL2luY3JlbWVudCB0aGUgbGVuZ3RoIGlmIG5lZWRlZFxuXG4gIGZ1bmN0aW9uIGNoZWNrQW5kSW5jcmVtZW50KGNvbFNwZWMpIHtcbiAgICBpZiAodHlwZW9mIChleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXSkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXSAgICAgICAgICAgPSB7fTtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbE5hbWUgICA9IGNvbFNwZWMuY29sTmFtZTtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbFR5cGUgICA9IGNvbFNwZWMuY29sVHlwZTtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbExlbmd0aCA9IGNvbFNwZWMuY29sTGVuZ3RoID4gMCA/IGNvbFNwZWMuY29sTGVuZ3RoIDogMTtcbiAgICAgIHJldHVybiAwOyAvLyBhbGwgb2tcbiAgICB9XG4gICAgLy8gY2hlY2sgdHlwZSBtYXRjaFxuICAgIGlmIChleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xUeXBlICE9PSBjb2xTcGVjLmNvbFR5cGUpIHtcbiAgICAgIHJldHVybiAtMTsgLy8gdGhlcmUgaXMgYSBmdWRnZSBpbiB0aGUgdHlwaW5nXG4gICAgfVxuICAgIGlmIChleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xMZW5ndGggPCBjb2xTcGVjLmNvbExlbmd0aCkge1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoID0gY29sU3BlYy5jb2xMZW5ndGggPiAwID8gY29sU3BlYy5jb2xMZW5ndGggOiAxOyAvLyBpbmNyZW1lbnQgdGhlIG1heCBsZW5ndGggb2YgdGhpcyBjb2x1bW5cbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgfVxuICB2YXIgY2h1bmtBcnJheUNvdW50ICAgICAgICAgPSAwOyAvLyB0aGlzIGlzIGZvciBrZWVwaW5nIHRhYnMgb24gaG93IGxvbmcgdGhlIGN1cnJlbnQgYXJyYXkgc3RyaW5nIHdvdWxkIGJlXG4gIHZhciB0YXJnZXRBcnJheSAgICAgICAgICAgICA9IFtdOyAvLyB0aGlzIGlzIHRoZSBhcnJheSBvZiB0YXJnZXQgYXJyYXlzXG4gIHZhciBjdXJyZW50VGFyZ2V0ICAgICAgICAgICA9IDA7XG4gIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdICA9IFtdO1xuICB2YXIgaiAgICAgICAgICAgICAgICAgICAgICAgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGluT2JqZWN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal0gPSB7fTtcbiAgICB2YXIgY2h1bmtSb3dDb3VudCAgICAgICAgICAgICA9IDA7XG5cbiAgICBmb3IgKHZhciBrZXkgaW4gaW5PYmplY3RbaV0pIHtcbiAgICAgIHZhciB0aGlzU3BlYyAgPSB7fTtcbiAgICAgIHZhciB0aGlzVmFsdWUgPSBpbk9iamVjdFtpXVtrZXldO1xuXG4gICAgICAvL3NraXAgdW5kZWZpbmVkIHZhbHVlc1xuICAgICAgaWYodGhpc1ZhbHVlID09PSB1bmRlZmluZWQgfHwgdGhpc1ZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvL3Rocm93IGFuIGVycm9yIGlmIHRoZXJlJ3MgTmFOIHZhbHVlXG4gICAgICBpZih0eXBlb2YgdGhpc1ZhbHVlID09PSAnbnVtYmVyJyAmJiBpc05hTih0aGlzVmFsdWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdOYU4gdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICB9XG5cbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gLUluZmluaXR5IHx8IHRoaXNWYWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgdGhpc1ZhbHVlLnRvU3RyaW5nKCkgKyAnIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgfVxuXG4gICAgICBpZih0aGlzVmFsdWUgPT09IHRydWUgfHwgdGhpc1ZhbHVlID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnQm9vbGVhbiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgIH1cblxuICAgICAgLy8gZ2V0IHR5cGUuLi4gaWYgaXQgaXMgYW4gb2JqZWN0IHRoZW4gY29udmVydCBpdCB0byBqc29uIGFuZCBzdG9yZSBhcyBhIHN0cmluZ1xuICAgICAgdmFyIHRoaXNUeXBlICA9IHR5cGVvZiAodGhpc1ZhbHVlKTtcbiAgICAgIHZhciBpc0RhdGUgPSB0aGlzVmFsdWUgaW5zdGFuY2VvZiBEYXRlO1xuICAgICAgaWYgKHRoaXNUeXBlID09PSAnbnVtYmVyJykgeyAvLyBzdHJhaWdodGZvcndhcmQgbnVtYmVyXG4gICAgICAgIGlmKHRoaXNWYWx1ZSA8IE51bWJlci5NSU5fU0FGRV9JTlRFR0VSIHx8IHRoaXNWYWx1ZSA+IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB7XG4gICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnT2JqZWN0WycgKyBpICsgJ10uJyArIGtleSArICcgLSBUaGlzIHZhbHVlIGV4Y2VlZHMgZXhwZWN0ZWQgbnVtZXJpYyBwcmVjaXNpb24uJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICAgICAgICAgICAgICAgICAgPSBrZXk7XG4gICAgICAgIHRoaXNTcGVjLmNvbFR5cGUgICAgICAgICAgICAgICAgICAgID0gJ251bSc7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgICAgICAgICAgICAgICAgID0gODtcbiAgICAgICAgdGhpc1NwZWMuZW5jb2RlZExlbmd0aCAgICAgICAgICAgICAgPSB0aGlzVmFsdWUudG9TdHJpbmcoKS5sZW5ndGg7XG4gICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gID0gdGhpc1ZhbHVlO1xuICAgICAgfSBlbHNlIGlmICh0aGlzVHlwZSA9PT0gJ3N0cmluZycgJiYgIWlzRGF0ZSkgeyAvLyBzdHJhaWdodGZvcndhcmQgc3RyaW5nXG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgPSBrZXk7XG4gICAgICAgIHRoaXNTcGVjLmNvbFR5cGUgICAgPSAnc3RyaW5nJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICA9IHRoaXNWYWx1ZS5sZW5ndGg7XG5cbiAgICAgICAgaWYgKHRoaXNWYWx1ZSA9PT0gXCJcIikge1xuICAgICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gPSBcIiBcIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldID0gZW5jb2RlVVJJQ29tcG9uZW50KHRoaXNWYWx1ZSkucmVwbGFjZSgvJy9nLCAnJTI3Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpc1NwZWMuZW5jb2RlZExlbmd0aCA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0ubGVuZ3RoO1xuICAgICAgfSBlbHNlIGlmKGlzRGF0ZSkge1xuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgICAgICAgICAgICAgICAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICAgICAgICAgICAgICAgICAgPSAnZGF0ZSc7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgICAgICAgICAgICAgICAgID0gODtcbiAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSAgPSBzZWxmLnRvU2FzRGF0ZVRpbWUodGhpc1ZhbHVlKTtcbiAgICAgICAgdGhpc1NwZWMuZW5jb2RlZExlbmd0aCAgICAgICAgICAgICAgPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldLnRvU3RyaW5nKCkubGVuZ3RoO1xuICAgICAgfSBlbHNlIGlmICh0aGlzVHlwZSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgICAgICAgICAgICAgICAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICAgICAgICAgICAgICAgICAgPSAnanNvbic7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgICAgICAgICAgICAgICAgID0gSlNPTi5zdHJpbmdpZnkodGhpc1ZhbHVlKS5sZW5ndGg7XG4gICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KHRoaXNWYWx1ZSkpLnJlcGxhY2UoLycvZywgJyUyNycpO1xuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoICAgICAgICAgICAgICA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0ubGVuZ3RoO1xuICAgICAgfVxuXG4gICAgICBjaHVua1Jvd0NvdW50ID0gY2h1bmtSb3dDb3VudCArIDYgKyBrZXkubGVuZ3RoICsgdGhpc1NwZWMuZW5jb2RlZExlbmd0aDtcblxuICAgICAgaWYgKGNoZWNrQW5kSW5jcmVtZW50KHRoaXNTcGVjKSA9PSAtMSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnVGhlcmUgaXMgYSB0eXBlIG1pc21hdGNoIGluIHRoZSBhcnJheSBiZXR3ZWVuIHZhbHVlcyAoY29sdW1ucykgb2YgdGhlIHNhbWUgbmFtZS4nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL3JlbW92ZSBsYXN0IGFkZGVkIHJvdyBpZiBpdCdzIGVtcHR5XG4gICAgaWYoT2JqZWN0LmtleXModGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal0pLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0uc3BsaWNlKGosIDEpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGNodW5rUm93Q291bnQgPiBjaHVua1RocmVzaG9sZCkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdSb3cgJyArIGogKyAnIGV4Y2VlZHMgc2l6ZSBsaW1pdCBvZiAzMmtiJyk7XG4gICAgfSBlbHNlIGlmKGNodW5rQXJyYXlDb3VudCArIGNodW5rUm93Q291bnQgPiBjaHVua1RocmVzaG9sZCkge1xuICAgICAgLy9jcmVhdGUgbmV3IGFycmF5IGlmIHRoaXMgb25lIGlzIGZ1bGwgYW5kIG1vdmUgdGhlIGxhc3QgaXRlbSB0byB0aGUgbmV3IGFycmF5XG4gICAgICB2YXIgbGFzdFJvdyA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdLnBvcCgpOyAvLyBnZXQgcmlkIG9mIHRoYXQgbGFzdCByb3dcbiAgICAgIGN1cnJlbnRUYXJnZXQrKzsgLy8gbW92ZSBvbnRvIHRoZSBuZXh0IGFycmF5XG4gICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XSAgPSBbbGFzdFJvd107IC8vIG1ha2UgaXQgYW4gYXJyYXlcbiAgICAgIGogICAgICAgICAgICAgICAgICAgICAgICAgICA9IDA7IC8vIGluaXRpYWxpc2UgbmV3IHJvdyBjb3VudGVyIGZvciBuZXcgYXJyYXkgLSBpdCB3aWxsIGJlIGluY3JlbWVudGVkIGF0IHRoZSBlbmQgb2YgdGhlIGZ1bmN0aW9uXG4gICAgICBjaHVua0FycmF5Q291bnQgICAgICAgICAgICAgPSBjaHVua1Jvd0NvdW50OyAvLyB0aGlzIGlzIHRoZSBuZXcgY2h1bmsgbWF4IHNpemVcbiAgICB9IGVsc2Uge1xuICAgICAgY2h1bmtBcnJheUNvdW50ID0gY2h1bmtBcnJheUNvdW50ICsgY2h1bmtSb3dDb3VudDtcbiAgICB9XG4gICAgaisrO1xuICB9XG5cbiAgLy8gcmVmb3JtYXQgZXhpc3RpbmdDb2xzIGludG8gYW4gYXJyYXkgc28gc2FzIGNhbiBwYXJzZSBpdDtcbiAgdmFyIHNwZWNBcnJheSA9IFtdO1xuICBmb3IgKHZhciBrIGluIGV4aXN0aW5nQ29scykge1xuICAgIHNwZWNBcnJheS5wdXNoKGV4aXN0aW5nQ29sc1trXSk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBzcGVjOiAgICAgICBzcGVjQXJyYXksXG4gICAgZGF0YTogICAgICAgdGFyZ2V0QXJyYXksXG4gICAganNvbkxlbmd0aDogY2h1bmtBcnJheUNvdW50XG4gIH07IC8vIHRoZSBzcGVjIHdpbGwgYmUgdGhlIG1hY3JvWzBdLCB3aXRoIHRoZSBkYXRhIHNwbGl0IGludG8gYXJyYXlzIG9mIG1hY3JvWzEtbl1cbiAgLy8gbWVhbnMgaW4gdGVybXMgb2YgZG9qbyB4aHIgb2JqZWN0IGF0IGxlYXN0IHRoZXkgbmVlZCB0byBnbyBpbnRvIHRoZSBzYW1lIGFycmF5XG59O1xuXG4vKlxuKiBDb252ZXJ0IGphdmFzY3JpcHQgZGF0ZSB0byBzYXMgdGltZVxuKlxuKiBAcGFyYW0ge29iamVjdH0ganNEYXRlIC0gamF2YXNjcmlwdCBEYXRlIG9iamVjdFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnRvU2FzRGF0ZVRpbWUgPSBmdW5jdGlvbiAoanNEYXRlKSB7XG4gIHZhciBiYXNlZGF0ZSA9IG5ldyBEYXRlKFwiSmFudWFyeSAxLCAxOTYwIDAwOjAwOjAwXCIpO1xuICB2YXIgY3VycmRhdGUgPSBqc0RhdGU7XG5cbiAgLy8gb2Zmc2V0cyBmb3IgVVRDIGFuZCB0aW1lem9uZXMgYW5kIEJTVFxuICB2YXIgYmFzZU9mZnNldCA9IGJhc2VkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcbiAgdmFyIGN1cnJPZmZzZXQgPSBjdXJyZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXG5cbiAgLy8gY29udmVydCBjdXJyZGF0ZSB0byBhIHNhcyBkYXRldGltZVxuICB2YXIgb2Zmc2V0U2VjcyAgICA9IChjdXJyT2Zmc2V0IC0gYmFzZU9mZnNldCkgKiA2MDsgLy8gb2Zmc2V0RGlmZiBpcyBpbiBtaW51dGVzIHRvIHN0YXJ0IHdpdGhcbiAgdmFyIGJhc2VEYXRlU2VjcyAgPSBiYXNlZGF0ZS5nZXRUaW1lKCkgLyAxMDAwOyAvLyBnZXQgcmlkIG9mIG1zXG4gIHZhciBjdXJyZGF0ZVNlY3MgID0gY3VycmRhdGUuZ2V0VGltZSgpIC8gMTAwMDsgLy8gZ2V0IHJpZCBvZiBtc1xuICB2YXIgc2FzRGF0ZXRpbWUgICA9IE1hdGgucm91bmQoY3VycmRhdGVTZWNzIC0gYmFzZURhdGVTZWNzIC0gb2Zmc2V0U2Vjcyk7IC8vIGFkanVzdFxuXG4gIHJldHVybiBzYXNEYXRldGltZTtcbn07XG4iXX0=
