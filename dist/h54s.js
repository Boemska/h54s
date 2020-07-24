(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.h54s = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/*
* h54s error constructor
* @constructor
*
*@param {string} type - Error type
*@param {string} message - Error message
*@param {string} status - Error status returned from SAS
*
*/
function h54sError(type, message, status) {
  if(Error.captureStackTrace) {
    Error.captureStackTrace(this);
  }
  this.message = message;
  this.type    = type;
  this.status  = status;
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
const h54sError = require('../error.js');

/**
* h54s SAS Files object constructor
* @constructor
*
*@param {file} file - File added when object is created
*@param {string} macroName - macro name
*
*/
function Files(file, macroName) {
  this._files = {};

  Files.prototype.add.call(this, file, macroName);
}

/**
* Add file to files object
* @param {file} file - Instance of JavaScript File object
* @param {string} macroName - Sas macro name
*
*/
Files.prototype.add = function(file, macroName) {
  if(file && macroName) {
    if(!(file instanceof File || file instanceof Blob)) {
      throw new h54sError('argumentError', 'First argument must be instance of File object');
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

  this._files[macroName] = [
    'FILE',
    file
  ];
};

module.exports = Files;

},{"../error.js":1}],3:[function(require,module,exports){
const h54sError = require('./error.js');

const sasVersionMap = {
	v9: {
    url: '/SASStoredProcess/do',
    loginUrl: '/SASLogon/login',
		logoutUrl: '/SASStoredProcess/do?_action=logoff',
    RESTAuthLoginUrl: '/SASLogon/v1/tickets'
	},
	viya: {
		url: '/SASJobExecution/',
    loginUrl: '/SASLogon/login.do',
		logoutUrl: '/SASLogon/logout.do?',
    RESTAuthLoginUrl: ''
	}
}

/**
*
* @constructor
* @param {Object} config - Configuration object for the H54S SAS Adapter
* @param {String} config.sasVersion - Version of SAS, either 'v9' or 'viya'
* @param {Boolean} config.debug - Whether debug mode is enabled, sets _debug=131
* @param {String} config.metadataRoot - Base path of all project services to be prepended to _program path
* @param {String} config.url - URI of the job executor - SPWA or JES
* @param {String} config.loginUrl - URI of the SASLogon web login path - overridden by form action
* @param {String} config.logoutUrl - URI of the logout action
* @param {String} config.RESTauth - Boolean to toggle use of REST authentication in SAS v9
* @param {String} config.RESTauthLoginUrl - Address of SASLogon tickets endpoint for REST auth
* @param {Boolean} config.retryAfterLogin - Whether to resume requests which were parked with login redirect after a successful re-login
* @param {Number} config.maxXhrRetries - If a program call fails, attempt to call it again N times until it succeeds
* @param {Number} config.ajaxTimeout - Number of milliseconds to wait for a response before closing the request
* @param {Boolean} config.useMultipartFormData - Whether to use multipart for POST - for legacy backend support
* @param {String} config.csrf - CSRF token for JES
* @
*
*/
const h54s = module.exports = function(config) {
  // Default config values, overridden by anything in the config object
	this.sasVersion           = (config && config.sasVersion) || 'v9' //use v9 as default=
  this.debug                = (config && config.debug) || false;
  this.metadataRoot					= (config && config.metadataRoot) || '';
  this.url                  = sasVersionMap[this.sasVersion].url;
  this.loginUrl             = sasVersionMap[this.sasVersion].loginUrl;
  this.logoutUrl            = sasVersionMap[this.sasVersion].logoutUrl;
  this.RESTauth             = false;
  this.RESTauthLoginUrl     = sasVersionMap[this.sasVersion].RESTAuthLoginUrl;
  this.retryAfterLogin      = true;
  this.maxXhrRetries        = 5;
  this.ajaxTimeout          = (config && config.ajaxTimeout) || 300000;
  this.useMultipartFormData = (config && config.useMultipartFormData) || true;
  this.csrf                 = ''
  this.isViya								= this.sasVersion === 'viya';

  // Initialising callback stacks for when authentication is paused
  this.remoteConfigUpdateCallbacks = [];
  this._pendingCalls = [];
  this._customPendingCalls = [];
  this._disableCalls = false
  this._ajax = require('./methods/ajax.js')();

  _setConfig.call(this, config);

  // If this instance was deployed with a standalone config external to the build use that
  if(config && config.isRemoteConfig) {
    const self = this;

    this._disableCalls = true;

    // 'h54sConfig.json' is for the testing with karma
    //replaced by gulp in dev build (defined in gulpfile under proxies)
    this._ajax.get('h54sConfig.json').success(function(res) {
      const remoteConfig = JSON.parse(res.responseText)

			// Save local config before updating it with remote config
			const localConfig = Object.assign({}, config)
			const oldMetadataRoot = localConfig.metadataRoot;

      for(let key in remoteConfig) {
        if(remoteConfig.hasOwnProperty(key) && key !== 'isRemoteConfig') {
          config[key] = remoteConfig[key];
        }
      }

      _setConfig.call(self, config);

      // Execute callbacks when overrides from remote config are applied
      for(let i = 0, n = self.remoteConfigUpdateCallbacks.length; i < n; i++) {
        const fn = self.remoteConfigUpdateCallbacks[i];
        fn();
      }

      // Execute sas calls disabled while waiting for the config
      self._disableCalls = false;
      while(self._pendingCalls.length > 0) {
        const pendingCall = self._pendingCalls.shift();
				const sasProgram = pendingCall.options.sasProgram;
				const callbackPending = pendingCall.options.callback;
				const params = pendingCall.params;
				//update debug because it may change in the meantime
				params._debug = self.debug ? 131 : 0;

        // Update program path with metadataRoot if it's not set
        if(self.metadataRoot && params._program.indexOf(self.metadataRoot) === -1) {
          params._program = self.metadataRoot.replace(/\/?$/, '/') + params._program.replace(oldMetadataRoot, '').replace(/^\//, '');
        }

        // Update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        self.call(sasProgram, null, callbackPending, params);
      }

      // Execute custom calls that we made while waitinf for the config
       while(self._customPendingCalls.length > 0) {
      	const pendingCall = self._customPendingCalls.shift()
				const callMethod = pendingCall.callMethod
				const _url = pendingCall._url
				const options = pendingCall.options;
        ///update program with metadataRoot if it's not set
        if(self.metadataRoot && options.params && options.params._program.indexOf(self.metadataRoot) === -1) {
          options.params._program = self.metadataRoot.replace(/\/?$/, '/') + options.params._program.replace(oldMetadataRoot, '').replace(/^\//, '');
        }
        //update debug because it also may have changed from remoteConfig
				if (options.params) {
					options.params._debug = self.debug ? 131 : 0;
				}
				self.managedRequest(callMethod, _url, options);
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
    for(let key in config) {
      if(config.hasOwnProperty(key)) {
        if((key === 'url' || key === 'loginUrl') && config[key].charAt(0) !== '/') {
          config[key] = '/' + config[key];
        }
        this[key] = config[key];
      }
    }

    //if server is remote use the full server url
    //NOTE: This requires CORS and is here for legacy support
    if(config.hostUrl) {
      if(config.hostUrl.charAt(config.hostUrl.length - 1) === '/') {
        config.hostUrl = config.hostUrl.slice(0, -1);
      }
      this.hostUrl = config.hostUrl;
      if (!this.url.includes(this.hostUrl)) {
				this.url = config.hostUrl + this.url;
			}
			if (!this.loginUrl.includes(this.hostUrl)) {
				this.loginUrl = config.hostUrl + this.loginUrl;
			}
			if (!this.RESTauthLoginUrl.includes(this.hostUrl)) {
				this.RESTauthLoginUrl = config.hostUrl + this.RESTauthLoginUrl;
			}
    }

    this._ajax.setTimeout(this.ajaxTimeout);
  }
};

// replaced by gulp with real version at build time
h54s.version = '2.1.0';


h54s.prototype = require('./methods');

h54s.Tables = require('./tables');
h54s.Files = require('./files');
h54s.SasData = require('./sasData.js');

h54s.fromSasDateTime = require('./methods/utils.js').fromSasDateTime;
h54s.toSasDateTime = require('./tables/utils.js').toSasDateTime;

//self invoked function module
require('./ie_polyfills.js');

},{"./error.js":1,"./files":2,"./ie_polyfills.js":4,"./methods":7,"./methods/ajax.js":6,"./methods/utils.js":8,"./sasData.js":9,"./tables":10,"./tables/utils.js":11}],4:[function(require,module,exports){
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

},{}],5:[function(require,module,exports){
const logs = {
  applicationLogs: [],
  debugData: [],
  sasErrors: [],
  failedRequests: []
};

const limits = {
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
  },
  getAllLogs: function () {
    return {
      sasErrors: logs.sasErrors,
      applicationLogs: logs.applicationLogs,
      debugData: logs.debugData,
      failedRequests: logs.failedRequests
    }
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

/**
*  Adds application logs to an array of logs
*
* @param {String} message - Message to add to applicationLogs
* @param {String} sasProgram - Header - which request did message come from
*
*/
module.exports.addApplicationLog = function(message, sasProgram) {
  if(message === 'blank') {
    return;
  }
  const log = {
    message:    message,
    time:       new Date(),
    sasProgram: sasProgram
  };
  logs.applicationLogs.push(log);

  if(logs.applicationLogs.length > limits.applicationLogs) {
    logs.applicationLogs.shift();
  }
};

/**
* Adds debug data to an array of logs
*
* @param {String} htmlData - Full html log from executor
* @param {String} debugText - Debug text that came after data output
* @param {String} sasProgram - Which program request did message come from
* @param {String} params - Web app params that were received
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

/**
* Adds failed requests to an array of failed request logs
*
* @param {String} responseText - Full html output from executor
* @param {String} debugText - Debug text that came after data output
* @param {String} sasProgram - Which program request did message come from
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

/**
* Adds SAS errors to an array of logs
*
* @param {Array} errors - Array of errors to concat to main log
*
*/
module.exports.addSasErrors = function(errors) {
  logs.sasErrors = logs.sasErrors.concat(errors);

  while(logs.sasErrors.length > limits.sasErrors) {
    logs.sasErrors.shift();
  }
};

},{}],6:[function(require,module,exports){
module.exports = function () {
  let timeout = 30000;
  let timeoutHandle;

  const xhr = function (type, url, data, multipartFormData, headers = {}) {
    const methods = {
      success: function () {
      },
      error: function () {
      }
    };

    const XHR = XMLHttpRequest;
    const request = new XHR('MSXML2.XMLHTTP.3.0');

    request.open(type, url, true);

    //multipart/form-data is set automatically so no need for else block
    // Content-Type header has to be explicitly set up
    if (!multipartFormData) {
      if (headers['Content-Type']) {
        request.setRequestHeader('Content-Type', headers['Content-Type'])
      } else {
        request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      }
    }
    Object.keys(headers).forEach(key => {
      if (key !== 'Content-Type') {
        request.setRequestHeader(key, headers[key])
      }
    })
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

    if (timeout > 0) {
      timeoutHandle = setTimeout(function () {
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

  const serialize = function (obj) {
    const str = [];
    for (let p in obj) {
      if (obj.hasOwnProperty(p)) {
        if (obj[p] instanceof Array) {
          for (let i = 0, n = obj[p].length; i < n; i++) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p][i]));
          }
        } else {
          str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
      }
    }
    return str.join("&");
  };

  const createMultipartFormDataPayload = function (obj) {
    let data = new FormData();
    for (let p in obj) {
      if (obj.hasOwnProperty(p)) {
        if (obj[p] instanceof Array && p !== 'file') {
          for (let i = 0, n = obj[p].length; i < n; i++) {
            data.append(p, obj[p][i]);
          }
        } else if (p === 'file') {
          data.append(p, obj[p][0], obj[p][1]);
        } else {
          data.append(p, obj[p]);
        }
      }
    }
    return data;
  };

  return {
    get: function (url, data, multipartFormData, headers) {
      let dataStr;
      if (typeof data === 'object') {
        dataStr = serialize(data);
      }
      const urlWithParams = dataStr ? (url + '?' + dataStr) : url;
      return xhr('GET', urlWithParams, null, multipartFormData, headers);
    },
		post: function(url, data, multipartFormData, headers) {
      let payload = data;
      if(typeof data === 'object') {
        if(multipartFormData) {
          payload = createMultipartFormDataPayload(data);
        } else {
          payload = serialize(data);
        }
      }
      return xhr('POST', url, payload, multipartFormData, headers);
    },
    put: function(url, data, multipartFormData, headers) {
      let payload = data;
      if(typeof data === 'object') {
        if(multipartFormData) {
          payload = createMultipartFormDataPayload(data);
        }
      }
      return xhr('PUT', url, payload, multipartFormData, headers);
    },
		delete: function(url, payload, multipartFormData, headers) {
    	return xhr('DELETE', url, payload, null, headers);
		},
    setTimeout: function (t) {
      timeout = t;
    },
    serialize
  };
};

},{}],7:[function(require,module,exports){
const h54sError = require('../error.js');
const logs = require('../logs.js');
const Tables = require('../tables');
const SasData = require('../sasData.js');
const Files = require('../files');

/**
* Call Sas program
*
* @param {string} sasProgram - Path of the sas program
* @param {Object} dataObj - Instance of Tables object with data added
* @param {function} callback - Callback function called when ajax call is finished
* @param {Object} params - object containing additional program parameters
*
*/
module.exports.call = function (sasProgram, dataObj, callback, params) {
	const self = this;
	let retryCount = 0;
	const dbg = this.debug
	const csrf = this.csrf;

	if (!callback || typeof callback !== 'function') {
		throw new h54sError('argumentError', 'You must provide a callback');
	}
	if (!sasProgram) {
		throw new h54sError('argumentError', 'You must provide Sas program file path');
	}
	if (typeof sasProgram !== 'string') {
		throw new h54sError('argumentError', 'First parameter should be string');
	}
	if (this.useMultipartFormData === false && !(dataObj instanceof Tables)) {
		throw new h54sError('argumentError', 'Cannot send files using application/x-www-form-urlencoded. Please use Tables or default value for useMultipartFormData');
	}

	if (!params) {
		params = {
			_program: this._utils.getFullProgramPath(this.metadataRoot, sasProgram),
			_debug: this.debug ? 131 : 0,
			_service: 'default',
			_csrf: csrf
		};
	} else {
		params = Object.assign({}, params, {_csrf: csrf})
	}

	if (dataObj) {
		let key, dataProvider;
		if (dataObj instanceof Tables) {
			dataProvider = dataObj._tables;
		} else if (dataObj instanceof Files || dataObj instanceof SasData) {
			dataProvider = dataObj._files;
		} else {
			console.log(new h54sError('argumentError', 'Wrong type of tables object'))
		}
		for (key in dataProvider) {
			if (dataProvider.hasOwnProperty(key)) {
				params[key] = dataProvider[key];
			}
		}
	}

	if (this._disableCalls) {
		this._pendingCalls.push({
			params,
			options: {
				sasProgram,
				dataObj,
				callback
			}
		});
		return;
	}

	this._ajax.post(this.url, params, this.useMultipartFormData).success(async function (res) {
		if (self._utils.needToLogin.call(self, res)) {
			//remember the call for latter use
			self._pendingCalls.push({
				params,
				options: {
					sasProgram,
					dataObj,
					callback
				}
			});

			//there's no need to continue if previous call returned login error
			if (self._disableCalls) {
				return;
			} else {
				self._disableCalls = true;
			}

			callback(new h54sError('notLoggedinError', 'You are not logged in'));
		} else {
			let resObj, unescapedResObj, err;
			let done = false;

			if (!dbg) {
				try {
					resObj = self._utils.parseRes(res.responseText, sasProgram, params);
					logs.addApplicationLog(resObj.logmessage, sasProgram);

					if (dataObj instanceof Tables) {
						unescapedResObj = self._utils.unescapeValues(resObj);
					} else {
						unescapedResObj = resObj;
					}

					if (resObj.status !== 'success') {
						err = new h54sError('programError', resObj.errormessage, resObj.status);
					}

					done = true;
				} catch (e) {
					if (e instanceof SyntaxError) {
						if (retryCount < self.maxXhrRetries) {
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
					} else if (e instanceof h54sError) {
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
					if (done) {
						callback(err, unescapedResObj);
					}
				}
			} else {
				try {
					resObj = await self._utils.parseDebugRes(res.responseText, sasProgram, params, self.hostUrl, self.isViya);
					logs.addApplicationLog(resObj.logmessage, sasProgram);

					if (dataObj instanceof Tables) {
						unescapedResObj = self._utils.unescapeValues(resObj);
					} else {
						unescapedResObj = resObj;
					}

					if (resObj.status !== 'success') {
						err = new h54sError('programError', resObj.errormessage, resObj.status);
					}

					done = true;
				} catch (e) {
					if (e instanceof SyntaxError) {
						err = new h54sError('parseError', e.message);
						done = true;
					} else if (e instanceof h54sError) {
						if (e.type === 'parseError' && retryCount < 1) {
							done = false;
							self._ajax.post(self.url, params, self.useMultipartFormData).success(this.success).error(this.error);
							retryCount++;
							logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
						} else {
							if (e instanceof h54sError) {
								err = e;
							} else {
								err = new h54sError('parseError', 'Unable to parse response json');
							}
							done = true;
						}
					} else {
						err = new h54sError('unknownError', e.message);
						err.stack = e.stack;
						done = true;
					}
				} finally {
					if (done) {
						callback(err, unescapedResObj);
					}
				}
			}
		}
	}).error(function (res) {
		let _csrf
		if (res.status == 449 || (res.status == 403 && (res.responseText.includes('_csrf') || res.getResponseHeader('X-Forbidden-Reason') === 'CSRF') && (_csrf = res.getResponseHeader(res.getResponseHeader('X-CSRF-HEADER'))))) {
			params['_csrf'] = _csrf;
			self.csrf = _csrf
			if (retryCount < self.maxXhrRetries) {
				self._ajax.post(self.url, params, true).success(this.success).error(this.error);
				retryCount++;
				logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
			} else {
				self._utils.parseErrorResponse(res.responseText, sasProgram);
				self._utils.addFailedResponse(res.responseText, sasProgram);
				callback(new h54sError('parseError', 'Unable to parse response json'));
			}
		} else {
			logs.addApplicationLog('Request failed with status: ' + res.status, sasProgram);
			// if request has error text else callback
			callback(new h54sError('httpError', res.statusText));
		}
	});
};

/**
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
module.exports.login = function (user, pass, callback) {
	if (!user || !pass) {
		throw new h54sError('argumentError', 'Credentials not set');
	}
	if (typeof user !== 'string' || typeof pass !== 'string') {
		throw new h54sError('argumentError', 'User and pass parameters must be strings');
	}
	//NOTE: callback optional?
	if (!callback || typeof callback !== 'function') {
		throw new h54sError('argumentError', 'You must provide callback');
	}

	if (!this.RESTauth) {
		handleSasLogon.call(this, user, pass, callback);
	} else {
		handleRestLogon.call(this, user, pass, callback);
	}
};

/**
* ManagedRequest method
*
* @param {string} callMethod - get, post,
* @param {string} _url - URL to make request to
* @param {object} options - callback function as callback paramter in options object is required
*
*/
module.exports.managedRequest = function (callMethod = 'get', _url, options = {
	callback: () => console.log('Missing callback function')
}) {
	const self = this;
	const csrf = this.csrf;
	let retryCount = 0;
	const {useMultipartFormData, sasProgram, dataObj, params, callback, headers} = options

	if (sasProgram) {
		return self.call(sasProgram, dataObj, callback, params)
	}

	let url = _url
	if (!_url.startsWith('http')) {
		url = self.hostUrl + _url
	}

	const _headers = Object.assign({}, headers, {
		'X-CSRF-TOKEN': csrf
	})
	const _options = Object.assign({}, options, {
		headers: _headers
	})

	if (this._disableCalls) {
		this._customPendingCalls.push({
			callMethod,
			_url,
			options: _options
		});
		return;
	}

	self._ajax[callMethod](url, params, useMultipartFormData, _headers).success(function (res) {
		if (self._utils.needToLogin.call(self, res)) {
			//remember the call for latter use
			self._customPendingCalls.push({
				callMethod,
				_url,
				options: _options
			});

			//there's no need to continue if previous call returned login error
			if (self._disableCalls) {
				return;
			} else {
				self._disableCalls = true;
			}

			callback(new h54sError('notLoggedinError', 'You are not logged in'));
		} else {
			let resObj, err;
			let done = false;

			try {
				const arr = res.getAllResponseHeaders().split('\r\n');
				const resHeaders = arr.reduce(function (acc, current, i) {
					let parts = current.split(': ');
					acc[parts[0]] = parts[1];
					return acc;
				}, {});
				let body = res.responseText
				try {
					body = JSON.parse(body)
				} catch (e) {
					console.log('response is not JSON string')
				} finally {
					resObj = Object.assign({}, {
						headers: resHeaders,
						status: res.status,
						statusText: res.statusText,
						body
					})
					done = true;
				}
			} catch (e) {
				err = new h54sError('unknownError', e.message);
				err.stack = e.stack;
				done = true;

			} finally {
				if (done) {
					callback(err, resObj)
				}
			}
		}
	}).error(function (res) {
		let _csrf
		if (res.status == 449 || (res.status == 403 && (res.responseText.includes('_csrf') || res.getResponseHeader('X-Forbidden-Reason') === 'CSRF') && (_csrf = res.getResponseHeader(res.getResponseHeader('X-CSRF-HEADER'))))) {
			self.csrf = _csrf
			const _headers = Object.assign({}, headers, {[res.getResponseHeader('X-CSRF-HEADER')]: _csrf})
			if (retryCount < self.maxXhrRetries) {
				self._ajax[callMethod](url, params, useMultipartFormData, _headers).success(this.success).error(this.error);
				retryCount++;
			} else {
				callback(new h54sError('parseError', 'Unable to parse response json'));
			}
		} else {
			logs.addApplicationLog('Managed request failed with status: ' + res.status, _url);
			// if request has error text else callback
			callback(new h54sError('httpError', res.responseText, res.status));
		}
	});
}

/**
 * Log on to SAS if we are asked to
 * @param {String} user - Username of user
 * @param {String} pass - Password of user
 * @param {function} callback - what to do after
 */
function handleSasLogon(user, pass, callback) {
	const self = this;

	const loginParams = {
		_service: 'default',
		//for SAS 9.4,
		username: user,
		password: pass
	};

	for (let key in this._aditionalLoginParams) {
		loginParams[key] = this._aditionalLoginParams[key];
	}

	this._loginAttempts = 0;

	this._ajax.post(this.loginUrl, loginParams)
		.success(handleSasLogonSuccess)
		.error(handleSasLogonError);

	function handleSasLogonError(res) {
		if (res.status == 449) {
			handleSasLogonSuccess(res);
			return;
		}

		logs.addApplicationLog('Login failed with status code: ' + res.status);
		callback(res.status);
	}

	function handleSasLogonSuccess(res) {
		if (++self._loginAttempts === 3) {
			return callback(-2);
		}
		if (self._utils.needToLogin.call(self, res)) {
			//we are getting form again after redirect
			//and need to login again using the new url
			//_loginChanged is set in needToLogin function
			//but if login url is not different, we are checking if there are aditional parameters
			if (self._loginChanged || (self._isNewLoginPage && !self._aditionalLoginParams)) {
				delete self._loginChanged;
				const inputs = res.responseText.match(/<input.*"hidden"[^>]*>/g);
				if (inputs) {
					inputs.forEach(function (inputStr) {
						const valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
						loginParams[valueMatch[1]] = valueMatch[2];
					});
				}
				self._ajax.post(self.loginUrl, loginParams).success(function () {
					//we need this get request because of the sas 9.4 security checks
					self._ajax.get(self.url).success(handleSasLogonSuccess).error(handleSasLogonError);
				}).error(handleSasLogonError);
			}
			else {
				//getting form again, but it wasn't a redirect
				logs.addApplicationLog('Wrong username or password');
				callback(-1);
			}
		}
		else {
			self._disableCalls = false;
			callback(res.status);
			while (self._pendingCalls.length > 0) {
				const pendingCall = self._pendingCalls.shift();
				const method = pendingCall.method || self.call.bind(self);
				const sasProgram = pendingCall.options.sasProgram;
				const callbackPending = pendingCall.options.callback;
				const params = pendingCall.params;
				//update debug because it may change in the meantime
				params._debug = self.debug ? 131 : 0;
				if (self.retryAfterLogin) {
					method(sasProgram, null, callbackPending, params);
				}
			}
		}
	}
}
/**
 * REST logon for 9.4 v1 ticket based auth
 * @param {String} user -
 * @param {String} pass
 * @param {function} callback
 */
function handleRestLogon(user, pass, callback) {
	const self = this;

	const loginParams = {
		username: user,
		password: pass
	};

	this._ajax.post(this.RESTauthLoginUrl, loginParams).success(function (res) {
		const location = res.getResponseHeader('Location');

		self._ajax.post(location, {
			service: self.url
		}).success(function (res) {
			if (self.url.indexOf('?') === -1) {
				self.url += '?ticket=' + res.responseText;
			} else {
				if (self.url.indexOf('ticket') !== -1) {
					self.url = self.url.replace(/ticket=[^&]+/, 'ticket=' + res.responseText);
				} else {
					self.url += '&ticket=' + res.responseText;
				}
			}

			callback(res.status);
		}).error(function (res) {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		});
	}).error(function (res) {
		if (res.responseText === 'error.authentication.credentials.bad') {
			callback(-1);
		} else {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		}
	});
}

/**
* Logout method
*
* @param {function} callback - Callback function called when logout is done
*
*/

module.exports.logout = function (callback) {
	const baseUrl = this.hostUrl || '';
	const url = baseUrl + this.logoutUrl;

	this._ajax.get(url).success(function (res) {
		this._disableCalls = true
		callback();
	}).error(function (res) {
		logs.addApplicationLog('Logout failed with status code: ' + res.status);
		callback(res.status);
	});
};

/*
* Enter debug mode
*
*/
module.exports.setDebugMode = function () {
	this.debug = true;
};

/*
* Exit debug mode and clear logs
*
*/
module.exports.unsetDebugMode = function () {
	this.debug = false;
};

for (let key in logs.get) {
	if (logs.get.hasOwnProperty(key)) {
		module.exports[key] = logs.get[key];
	}
}

for (let key in logs.clear) {
	if (logs.clear.hasOwnProperty(key)) {
		module.exports[key] = logs.clear[key];
	}
}

/*
* Add callback functions executed when properties are updated with remote config
*
*@callback - callback pushed to array
*
*/
module.exports.onRemoteConfigUpdate = function (callback) {
	this.remoteConfigUpdateCallbacks.push(callback);
};

module.exports._utils = require('./utils.js');

/**
 * Login call which returns a promise
 * @param {String} user - Username
 * @param {String} pass - Password
 */
module.exports.promiseLogin = function (user, pass) {
	return new Promise((resolve, reject) => {
		if (!user || !pass) {
			reject(new h54sError('argumentError', 'Credentials not set'))
		}
		if (typeof user !== 'string' || typeof pass !== 'string') {
			reject(new h54sError('argumentError', 'User and pass parameters must be strings'))
		}
		if (!this.RESTauth) {
			customHandleSasLogon.call(this, user, pass, resolve);
		} else {
			customHandleRestLogon.call(this, user, pass, resolve);
		}
	})
}

/**
 *
 * @param {String} user - Username
 * @param {String} pass - Password
 * @param {function} callback - function to call when successful
 */
function customHandleSasLogon(user, pass, callback) {
	const self = this;
	let loginParams = {
		_service: 'default',
		//for SAS 9.4,
		username: user,
		password: pass
	};

	for (let key in this._aditionalLoginParams) {
		loginParams[key] = this._aditionalLoginParams[key];
	}

	this._loginAttempts = 0;
	loginParams = this._ajax.serialize(loginParams)

	this._ajax.post(this.loginUrl, loginParams)
		.success(handleSasLogonSuccess)
		.error(handleSasLogonError);

	function handleSasLogonError(res) {
		if (res.status == 449) {
			handleSasLogonSuccess(res);
			// resolve(res.status);
		} else {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		}
	}

	function handleSasLogonSuccess(res) {
		if (++self._loginAttempts === 3) {
			callback(-2);
		}

		if (self._utils.needToLogin.call(self, res)) {
			//we are getting form again after redirect
			//and need to login again using the new url
			//_loginChanged is set in needToLogin function
			//but if login url is not different, we are checking if there are aditional parameters
			if (self._loginChanged || (self._isNewLoginPage && !self._aditionalLoginParams)) {
				delete self._loginChanged;
				const inputs = res.responseText.match(/<input.*"hidden"[^>]*>/g);
				if (inputs) {
					inputs.forEach(function (inputStr) {
						const valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
						loginParams[valueMatch[1]] = valueMatch[2];
					});
				}
				self._ajax.post(self.loginUrl, loginParams).success(function () {
					handleSasLogonSuccess()
				}).error(handleSasLogonError);
			}
			else {
				//getting form again, but it wasn't a redirect
				logs.addApplicationLog('Wrong username or password');
				callback(-1);
			}
		}
		else {
			self._disableCalls = false;
			callback(res.status);
			while (self._customPendingCalls.length > 0) {
				const pendingCall = self._customPendingCalls.shift()
				const method = pendingCall.method || self.managedRequest.bind(self);
				const callMethod = pendingCall.callMethod
				const _url = pendingCall._url
				const options = pendingCall.options;
				//update debug because it may change in the meantime
				if (options.params) {
					options.params._debug = self.debug ? 131 : 0;
				}
				if (self.retryAfterLogin) {
					method(callMethod, _url, options);
				}
			}

			while (self._pendingCalls.length > 0) {
				const pendingCall = self._pendingCalls.shift();
				const method = pendingCall.method || self.call.bind(self);
				const sasProgram = pendingCall.options.sasProgram;
				const callbackPending = pendingCall.options.callback;
				const params = pendingCall.params;
				//update debug because it may change in the meantime
				params._debug = self.debug ? 131 : 0;
				if (self.retryAfterLogin) {
					method(sasProgram, null, callbackPending, params);
				}
			}
		}
	};
}

/**
 * To be used with future managed metadata calls
 * @param {String} user - Username
 * @param {String} pass - Password
 * @param {function} callback - what to call after
 * @param {String} callbackUrl - where to navigate after getting ticket
 */
function customHandleRestLogon(user, pass, callback, callbackUrl) {
	const self = this;

	const loginParams = {
		username: user,
		password: pass
	};

	this._ajax.post(this.RESTauthLoginUrl, loginParams).success(function (res) {
		const location = res.getResponseHeader('Location');

		self._ajax.post(location, {
			service: callbackUrl
		}).success(function (res) {
			if (callbackUrl.indexOf('?') === -1) {
				callbackUrl += '?ticket=' + res.responseText;
			} else {
				if (callbackUrl.indexOf('ticket') !== -1) {
					callbackUrl = callbackUrl.replace(/ticket=[^&]+/, 'ticket=' + res.responseText);
				} else {
					callbackUrl += '&ticket=' + res.responseText;
				}
			}

			callback(res.status);
		}).error(function (res) {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		});
	}).error(function (res) {
		if (res.responseText === 'error.authentication.credentials.bad') {
			callback(-1);
		} else {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		}
	});
}


// Utilility functions for handling files and folders on VIYA
/**
 * Returns the details of a folder from folder service
 * @param {String} folderName - Full path of folder to be found
 * @param {Object} options - Options object for managedRequest
 */
module.exports.getFolderDetails = function (folderName, options) {
	// First call to get folder's id
	let url = "/folders/folders/@item?path=" + folderName
	return this.managedRequest('get', url, options);
}

/**
 * Returns the details of a file from files service
 * @param {String} fileUri - Full path of file to be found
 * @param {Object} options - Options object for managedRequest: cacheBust forces browser to fetch new file
 */
module.exports.getFileDetails = function (fileUri, options) {
	const cacheBust = options.cacheBust
	if (cacheBust) {
		fileUri += '?cacheBust=' + new Date().getTime()
	}
	return this.managedRequest('get', fileUri, options);
}

/**
 * Returns the contents of a file from files service
 * @param {String} fileUri - Full path of file to be downloaded
 * @param {Object} options - Options object for managedRequest: cacheBust forces browser to fetch new file
 */
module.exports.getFileContent = function (fileUri, options) {
	const cacheBust = options.cacheBust
	let uri = fileUri + '/content'
	if (cacheBust) {
		uri += '?cacheBust=' + new Date().getTime()
	}
	return this.managedRequest('get', uri, options);
}


// Util functions for working with files and folders
/**
 * Returns details about folder it self and it's members with details
 * @param {String} folderName - Full path of folder to be found
 * @param {Object} options - Options object for managedRequest
 */
module.exports.getFolderContents = async function (folderName, options) {
	const self = this
	const {callback} = options

	// Second call to get folder's memebers
	const _callback = (err, data) => {
		// handle error of the first call
		if(err) {
			callback(err, data)
			return
		}
		let id = data.body.id
		let membersUrl = '/folders/folders/' + id + '/members' + '/?limit=10000000';
		return self.managedRequest('get', membersUrl, {callback})
	}

	// First call to get folder's id
	let url = "/folders/folders/@item?path=" + folderName
	const optionsObj = Object.assign({}, options, {
		callback: _callback
	})
	this.managedRequest('get', url, optionsObj)
}

/**
 * Creates a folder
 * @param {String} parentUri - The uri of the folder where the new child is being created
 * @param {String} folderName - Full path of folder to be found
 * @param {Object} options - Options object for managedRequest
 */
module.exports.createNewFolder = function (parentUri, folderName, options) {
	const headers = {
		'Accept': 'application/json, text/javascript, */*; q=0.01',
		'Content-Type': 'application/json',
	}

	const url = '/folders/folders?parentFolderUri=' + parentUri;
	const data = {
		'name': folderName,
		'type': "folder"
	}

	const optionsObj = Object.assign({}, options, {
		params: JSON.stringify(data),
		headers,
		useMultipartFormData: false
	})

	return this.managedRequest('post', url, optionsObj);
}

/**
 * Deletes a folder
 * @param {String} folderId - Full URI of folder to be deleted
 * @param {Object} options - Options object for managedRequest
 */
module.exports.deleteFolderById = function (folderId, options) {
	const url = '/folders/folders/' + folderId;
	return this.managedRequest('delete', url, options)
}

/**
 * Creates a new file
 * @param {String} fileName - Name of the file being created
 * @param {String} fileBlob - Content of the file
 * @param {String} parentFOlderUri - URI of the parent folder where the file is to be created
 * @param {Object} options - Options object for managedRequest
 */
module.exports.createNewFile = function (fileName, fileBlob, parentFolderUri, options) {
	let url = "/files/files#multipartUpload";
	let dataObj = {
		file: [fileBlob, fileName],
		parentFolderUri
	}

	const optionsObj = Object.assign({}, options, {
		params: dataObj,
		useMultipartFormData: true,
	})
	return this.managedRequest('post', url, optionsObj);
}

/**
 * Generic delete function that deletes by URI
 * @param {String} itemUri - Name of the item being deleted
 * @param {Object} options - Options object for managedRequest
 */
module.exports.deleteItem = function (itemUri, options) {
	return this.managedRequest('delete', itemUri, options)
}


/**
 * Updates contents of a file
 * @param {String} fileName - Name of the file being updated
 * @param {Object | Blob} dataObj - New content of the file (Object must contain file key)
 * Object example {
 *   file: [<blob>, <fileName>]
 * }
 * @param {String} lastModified - the last-modified header string that matches that of file being overwritten
 * @param {Object} options - Options object for managedRequest
 */
module.exports.updateFile = function (itemUri, dataObj, lastModified, options) {
	const url = itemUri + '/content'
	console.log('URL', url)
	let headers = {
		'Content-Type': 'application/vnd.sas.file',
		'If-Unmodified-Since': lastModified
	}
	const isBlob = dataObj instanceof Blob
	const useMultipartFormData = !isBlob // set useMultipartFormData to true if dataObj is not Blob

	const optionsObj = Object.assign({}, options, {
		params: dataObj,
		headers,
		useMultipartFormData
	})
	return this.managedRequest('put', url, optionsObj);
}

},{"../error.js":1,"../files":2,"../logs.js":5,"../sasData.js":9,"../tables":10,"./utils.js":8}],8:[function(require,module,exports){
const logs = require('../logs.js');
const h54sError = require('../error.js');

const programNotFoundPatt = /<title>(Stored Process Error|SASStoredProcess)<\/title>[\s\S]*<h2>(Stored process not found:.*|.*not a valid stored process path.)<\/h2>/;
const badJobDefinition = "<h2>Parameter Error <br/>Unable to get job definition.</h2>";

const responseReplace = function(res) {
  return res
};

/**
* Parse response from server
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
* @param {object} params - params sent to sas program with addTable
*
*/
module.exports.parseRes = function(responseText, sasProgram, params) {
  const matches = responseText.match(programNotFoundPatt);
  if(matches) {
    throw new h54sError('programNotFound', 'You have not been granted permission to perform this action, or the STP is missing.');
  }
  //remove new lines in json response
  //replace \\(d) with \(d) - SAS json parser is escaping it
  return JSON.parse(responseReplace(responseText));
};

/**
* Parse response from server in debug mode
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
* @param {object} params - params sent to sas program with addTable
* @param {string} hostUrl - same as in h54s constructor
* @param {bool} isViya - same as in h54s constructor
*
*/
module.exports.parseDebugRes = function (responseText, sasProgram, params, hostUrl, isViya) {
	const self = this
	let matches = responseText.match(programNotFoundPatt);
	if (matches) {
		throw new h54sError('programNotFound', 'Sas program completed with errors');
	}

	if (isViya) {
		const matchesWrongJob = responseText.match(badJobDefinition);
		if (matchesWrongJob) {
			throw new h54sError('programNotFound', 'Sas program completed with errors. Unable to get job definition.');
		}
	}

	//find json
	let patt = isViya ? /^(.?<iframe.*src=")([^"]+)(.*iframe>)/m : /^(.?--h54s-data-start--)([\S\s]*?)(--h54s-data-end--)/m;
	matches = responseText.match(patt);

	const page = responseText.replace(patt, '');
	const htmlBodyPatt = /<body.*>([\s\S]*)<\/body>/;
	const bodyMatches = page.match(htmlBodyPatt);
	//remove html tags
	let debugText = bodyMatches[1].replace(/<[^>]*>/g, '');
	debugText = this.decodeHTMLEntities(debugText);

	logs.addDebugData(bodyMatches[1], debugText, sasProgram, params);

  if (isViya && this.parseErrorResponse(responseText, sasProgram)) {
		throw new h54sError('sasError', 'Sas program completed with errors');
	}
	if (!matches) {
		throw new h54sError('parseError', 'Unable to parse response json');
	}


	const promise = new Promise(function (resolve, reject) {
		let jsonObj
		if (isViya) {
			const xhr = new XMLHttpRequest();
			const baseUrl = hostUrl || "";
			xhr.open("GET", baseUrl + matches[2]);
			xhr.onload = function () {
				if (this.status >= 200 && this.status < 300) {
					resolve(JSON.parse(xhr.responseText.replace(/(\r\n|\r|\n)/g, '')));
				} else {
					reject(new h54sError('fetchError', xhr.statusText, this.status))
				}
			};
			xhr.onerror = function () {
				reject(new h54sError('fetchError', xhr.statusText))
			};
			xhr.send();
		} else {
			try {
				jsonObj = JSON.parse(responseReplace(matches[2]));
			} catch (e) {
				reject(new h54sError('parseError', 'Unable to parse response json'))
			}

			if (jsonObj && jsonObj.h54sAbort) {
				resolve(jsonObj);
			} else if (self.parseErrorResponse(responseText, sasProgram)) {
				reject(new h54sError('sasError', 'Sas program completed with errors'))
			} else {
				resolve(jsonObj);
			}
		}
	});

	return promise;
};

/**
* Add failed response to logs - used only if debug=false
*
* @param {string} responseText - response html from the server
* @param {string} sasProgram - sas program path
*
*/
module.exports.addFailedResponse = function(responseText, sasProgram) {
  const patt      = /<script([\s\S]*)\/form>/;
  const patt2     = /display\s?:\s?none;?\s?/;
  //remove script with form for toggling the logs and "display:none" from style
  responseText  = responseText.replace(patt, '').replace(patt2, '');
  let debugText = responseText.replace(/<[^>]*>/g, '');
  debugText = this.decodeHTMLEntities(debugText);

  logs.addFailedRequest(responseText, debugText, sasProgram);
};

/**
* Unescape all string values in returned object
*
* @param {object} obj
*
*/
module.exports.unescapeValues = function(obj) {
  for (let key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = decodeURIComponent(obj[key]);
    } else if(typeof obj === 'object') {
      this.unescapeValues(obj[key]);
    }
  }
  return obj;
};

/**
* Parse error response from server and save errors in memory
*
* @param {string} res - server response
* @param {string} sasProgram - sas program which returned the response
*
*/
module.exports.parseErrorResponse = function(res, sasProgram) {
  //capture 'ERROR: [text].' or 'ERROR xx [text].'
  const patt    = /^ERROR(:\s|\s\d\d)(.*\.|.*\n.*\.)/gm;
  let errors  = res.replace(/(<([^>]+)>)/ig, '').match(patt);
  if(!errors) {
    return;
  }

  let errMessage;
  for(let i = 0, n = errors.length; i < n; i++) {
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

/**
* Decode HTML entities - old utility function
*
* @param {string} res - server response
*
*/
module.exports.decodeHTMLEntities = function (html) {
  const tempElement = document.createElement('span');
  let str	= html.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    function (str) {
      tempElement.innerHTML = str;
      str = tempElement.textContent || tempElement.innerText;
      return str;
    }
  );
  return str;
};

/**
* Convert sas time to javascript date
*
* @param {number} sasDate - sas Tate object
*
*/
module.exports.fromSasDateTime = function (sasDate) {
  const basedate = new Date("January 1, 1960 00:00:00");
  const currdate = sasDate;

  // offsets for UTC and timezones and BST
  const baseOffset = basedate.getTimezoneOffset(); // in minutes

  // convert sas datetime to a current valid javascript date
  const basedateMs  = basedate.getTime(); // in ms
  const currdateMs  = currdate * 1000; // to ms
  const sasDatetime = currdateMs + basedateMs;
  const jsDate      = new Date();
  jsDate.setTime(sasDatetime); // first time to get offset BST daylight savings etc
  const currOffset  = jsDate.getTimezoneOffset(); // adjust for offset in minutes
  const offsetVar   = (baseOffset - currOffset) * 60 * 1000; // difference in milliseconds
  const offsetTime  = sasDatetime - offsetVar; // finding BST and daylight savings
  jsDate.setTime(offsetTime); // update with offset
  return jsDate;
};

/**
 * Checks whether response object is a login redirect
 * @param {Object} responseObj xhr response to be checked for logon redirect
 */
module.exports.needToLogin = function(responseObj) {
	const isSASLogon = responseObj.responseURL && responseObj.responseURL.includes('SASLogon')
	if (isSASLogon === false) {
		return false
	}

  const patt = /<form.+action="(.*Logon[^"]*).*>/;
  const matches = patt.exec(responseObj.responseText);
  let newLoginUrl;

  if(!matches) {
    //there's no form, we are in. hooray!
    return false;
  } else {
    const actionUrl = matches[1].replace(/\?.*/, '');
    if(actionUrl.charAt(0) === '/') {
      newLoginUrl = this.hostUrl ? this.hostUrl + actionUrl : actionUrl;
      if(newLoginUrl !== this.loginUrl) {
        this._loginChanged = true;
        this.loginUrl = newLoginUrl;
      }
    } else {
      //relative path

      const lastIndOfSlash = responseObj.responseURL.lastIndexOf('/') + 1;
      //remove everything after the last slash, and everything until the first
      const relativeLoginUrl = responseObj.responseURL.substr(0, lastIndOfSlash).replace(/.*\/{2}[^\/]*/, '') + actionUrl;
      newLoginUrl = this.hostUrl ? this.hostUrl + relativeLoginUrl : relativeLoginUrl;
      if(newLoginUrl !== this.loginUrl) {
        this._loginChanged = true;
        this.loginUrl = newLoginUrl;
      }
    }

    //save parameters from hidden form fields
    const parser = new DOMParser();
    const doc = parser.parseFromString(responseObj.responseText,"text/html");
    const res = doc.querySelectorAll("input[type='hidden']");
    const hiddenFormParams = {};
    if(res) {
      //it's new login page if we have these additional parameters
      this._isNewLoginPage = true;
      res.forEach(function(node) {
        hiddenFormParams[node.name] = node.value;
      });
      this._aditionalLoginParams = hiddenFormParams;
    }
    return true;
  }
};

/**
* Get full program path from metadata root and relative path
*
* @param {string} metadataRoot - Metadata root (path where all programs for the project are located)
* @param {string} sasProgramPath - Sas program path
*
*/
module.exports.getFullProgramPath = function(metadataRoot, sasProgramPath) {
  return metadataRoot ? metadataRoot.replace(/\/?$/, '/') + sasProgramPath.replace(/^\//, '') : sasProgramPath;
};

// Returns object where table rows are groupped by key
module.exports.getObjOfTable = function (table, key, value = null) {
	const obj = {}
	table.forEach(row => {
		obj[row[key]] = value ? row[value] : row
	})
	return obj
}

// Returns self uri out of links array
module.exports.getSelfUri = function (links) {
	return links
		.filter(e => e.rel === 'self')
		.map(e => e.uri)
		.shift();
}

},{"../error.js":1,"../logs.js":5}],9:[function(require,module,exports){
const h54sError = require('./error.js');
const logs      = require('./logs.js');
const Tables    = require('./tables');
const Files     = require('./files');
const toSasDateTime = require('./tables/utils.js').toSasDateTime;

/**
 * Checks whether a given table name is a valid SAS macro name
 * @param {String} macroName The SAS macro name to be given to this table
 */
function validateMacro(macroName) {
  if(macroName.length > 32) {
    throw new h54sError('argumentError', 'Table name too long. Maximum is 32 characters');
  }

  const charCodeAt0 = macroName.charCodeAt(0);
  // validate it starts with A-Z, a-z, or _
  if((charCodeAt0 < 65 || charCodeAt0 > 90) && (charCodeAt0 < 97 || charCodeAt0 > 122) && macroName[0] !== '_') {
    throw new h54sError('argumentError', 'Table name starting with number or special characters');
  }

  for(let i = 0; i < macroName.length; i++) {
    const charCode = macroName.charCodeAt(i);

    if((charCode < 48 || charCode > 57) &&
      (charCode < 65 || charCode > 90) &&
      (charCode < 97 || charCode > 122) &&
      macroName[i] !== '_')
    {
      throw new h54sError('argumentError', 'Table name has unsupported characters');
    }
  }
}

/**
* h54s SAS data object constructor
* @constructor
*
* @param {array|file} data - Table or file added when object is created
* @param {String} macroName The SAS macro name to be given to this table
* @param {number} parameterThreshold - size of data objects sent to SAS (legacy)
*
*/
function SasData(data, macroName, specs) {
  if(data instanceof Array) {
    this._files = {};
    this.addTable(data, macroName, specs);
  } else if(data instanceof File || data instanceof Blob) {
    Files.call(this, data, macroName);
  } else {
    throw new h54sError('argumentError', 'Data argument wrong type or missing');
  }
}

/**
* Add table to tables object
* @param {array} table - Array of table objects
* @param {String} macroName The SAS macro name to be given to this table
*
*/
SasData.prototype.addTable = function(table, macroName, specs) {
  const isSpecsProvided = !!specs;
  if(table && macroName) {
    if(!(table instanceof Array)) {
      throw new h54sError('argumentError', 'First argument must be array');
    }
    if(typeof macroName !== 'string') {
      throw new h54sError('argumentError', 'Second argument must be string');
    }

    validateMacro(macroName);
  } else {
    throw new h54sError('argumentError', 'Missing arguments');
  }

  if (typeof table !== 'object' || !(table instanceof Array)) {
    throw new h54sError('argumentError', 'Table argument is not an array');
  }

  let key;
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

  let i, j, //counters used latter in code
      row, val, type,
      specKeys = [];
	const specialChars = ['"', '\\', '/', '\n', '\t', '\f', '\r', '\b'];

  if(!specs) {
    specs = {};

    for (i = 0; i < table.length; i++) {
      row = table[i];

      if(typeof row !== 'object') {
        throw new h54sError('argumentError', 'Table item is not an object');
      }

      for(key in row) {
        if(row.hasOwnProperty(key)) {
          val  = row[key];
          type = typeof val;

          if(specs[key] === undefined) {
            specKeys.push(key);
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
            } else if(val instanceof Date) {
              specs[key].colType   = 'date';
              specs[key].colLength = 8;
            } else if (type === 'object') {
              specs[key].colType   = 'json';
              specs[key].colLength = JSON.stringify(val).length;
            }
          }
        }
      }
    }
  } else {
    specKeys = Object.keys(specs);
  }

  let sasCsv = '';

  // we need two loops - the first one is creating specs and validating
  for (i = 0; i < table.length; i++) {
    row = table[i];
    for(j = 0; j < specKeys.length; j++) {
      key = specKeys[j];
      if(row.hasOwnProperty(key)) {
        val  = row[key];
        type = typeof val;

        if(type === 'number' && isNaN(val)) {
          throw new h54sError('typeError', 'NaN value in one of the values (columns) is not allowed');
        }
        if(val === -Infinity || val === Infinity) {
          throw new h54sError('typeError', val.toString() + ' value in one of the values (columns) is not allowed');
        }
        if(val === true || val === false) {
          throw new h54sError('typeError', 'Boolean value in one of the values (columns) is not allowed');
        }
        if(type === 'string' && val.indexOf('\r\n') !== -1) {
          throw new h54sError('typeError', 'New line character is not supported');
        }

        // convert null to '.' for numbers and to '' for strings
        if(val === null) {
          if(specs[key].colType === 'string') {
            val = '';
            type = 'string';
          } else if(specs[key].colType === 'num') {
            val = '.';
            type = 'number';
          } else {
            throw new h54sError('typeError', 'Cannot convert null value');
          }
        }


        if ((type === 'number' && specs[key].colType !== 'num' && val !== '.') ||
          ((type === 'string' && !(val instanceof Date) && specs[key].colType !== 'string') &&
          (type === 'string' && specs[key].colType == 'num' && val !== '.')) ||
          (val instanceof Date && specs[key].colType !== 'date') ||
          ((type === 'object' && val.constructor !== Date) && specs[key].colType !== 'json'))
        {
          throw new h54sError('typeError', 'There is a specs type mismatch in the array between values (columns) of the same name.' +
            ' type/colType/val = ' + type +'/' + specs[key].colType + '/' + val );
        } else if(!isSpecsProvided && type === 'string' && specs[key].colLength < val.length) {
          specs[key].colLength = val.length;
        } else if((type === 'string' && specs[key].colLength < val.length) || (type !== 'string' && specs[key].colLength !== 8)) {
          throw new h54sError('typeError', 'There is a specs length mismatch in the array between values (columns) of the same name.' +
            ' type/colType/val = ' + type +'/' + specs[key].colType + '/' + val );
        }

        if (val instanceof Date) {
          val = toSasDateTime(val);
        }

        switch(specs[key].colType) {
          case 'num':
          case 'date':
            sasCsv += val;
            break;
          case 'string':
            sasCsv += '"' + val.replace(/"/g, '""') + '"';
            let colLength = val.length;
            for(let k = 0; k < val.length; k++) {
              if(specialChars.indexOf(val[k]) !== -1) {
                colLength++;
              } else {
                let code = val.charCodeAt(k);
                if(code > 0xffff) {
                  colLength += 3;
                } else if(code > 0x7ff) {
                  colLength += 2;
                } else if(code > 0x7f) {
                  colLength += 1;
                }
              }
            }
            // use maximum value between max previous, current value and 1 (first two can be 0 wich is not supported)
            specs[key].colLength = Math.max(specs[key].colLength, colLength, 1);
            break;
          case 'object':
            sasCsv += '"' + JSON.stringify(val).replace(/"/g, '""') + '"';
            break;
        }
      }
      // do not insert if it's the last column
      if(j < specKeys.length - 1) {
        sasCsv += ',';
      }
    }
    if(i < table.length - 1) {
      sasCsv += '\r\n';
    }
  }

  //convert specs to csv with pipes
  const specString = specKeys.map(function(key) {
    return key + ',' + specs[key].colType + ',' + specs[key].colLength;
  }).join('|');

  this._files[macroName] = [
    specString,
    new Blob([sasCsv], {type: 'text/csv;charset=UTF-8'})
  ];
};

/**
 * Add file as a verbatim blob file uplaod
 * @param {Blob} file - the blob that will be uploaded as file
 * @param {String} macroName - the SAS webin name given to this file
 */
SasData.prototype.addFile  = function(file, macroName) {
  Files.prototype.add.call(this, file, macroName);
};

module.exports = SasData;

},{"./error.js":1,"./files":2,"./logs.js":5,"./tables":10,"./tables/utils.js":11}],10:[function(require,module,exports){
const h54sError = require('../error.js');

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

  Tables.prototype.add.call(this, table, macroName);
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

  const result = this._utils.convertTableObject(table, this._parameterThreshold);

  const tableArray = [];
  tableArray.push(JSON.stringify(result.spec));
  for (let numberOfTables = 0; numberOfTables < result.data.length; numberOfTables++) {
    const outString = JSON.stringify(result.data[numberOfTables]);
    tableArray.push(outString);
  }
  this._tables[macroName] = tableArray;
};

Tables.prototype._utils = require('./utils.js');

module.exports = Tables;

},{"../error.js":1,"./utils.js":11}],11:[function(require,module,exports){
const h54sError = require('../error.js');
const logs = require('../logs.js');

/*
* Convert table object to Sas readable object
*
* @param {object} inObject - Object to convert
*
*/
module.exports.convertTableObject = function(inObject, chunkThreshold) {
  const self            = this;

  if(chunkThreshold > 30000) {
    console.warn('You should not set threshold larger than 30kb because of the SAS limitations');
  }

  // first check that the object is an array
  if (typeof (inObject) !== 'object') {
    throw new h54sError('argumentError', 'The parameter passed to checkAndGetTypeObject is not an object');
  }

  const arrayLength = inObject.length;
  if (typeof (arrayLength) !== 'number') {
    throw new h54sError('argumentError', 'The parameter passed to checkAndGetTypeObject does not have a valid length and is most likely not an array');
  }

  const existingCols = {}; // this is just to make lookup easier rather than traversing array each time. Will transform after

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
  let chunkArrayCount         = 0; // this is for keeping tabs on how long the current array string would be
  const targetArray           = []; // this is the array of target arrays
  let currentTarget           = 0;
  targetArray[currentTarget]  = [];
  let j                       = 0;
  for (let i = 0; i < inObject.length; i++) {
    targetArray[currentTarget][j] = {};
    let chunkRowCount             = 0;

    for (let key in inObject[i]) {
      const thisSpec  = {};
      const thisValue = inObject[i][key];

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
      const thisType  = typeof (thisValue);

      if (thisType === 'number') { // straightforward number
        if(thisValue < Number.MIN_SAFE_INTEGER || thisValue > Number.MAX_SAFE_INTEGER) {
          logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
        }
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'num';
        thisSpec.colLength                  = 8;
        thisSpec.encodedLength              = thisValue.toString().length;
        targetArray[currentTarget][j][key]  = thisValue;
      } else if (thisType === 'string') {
        thisSpec.colName    = key;
        thisSpec.colType    = 'string';
        thisSpec.colLength  = thisValue.length;

        if (thisValue === "") {
          targetArray[currentTarget][j][key] = " ";
        } else {
          targetArray[currentTarget][j][key] = encodeURIComponent(thisValue).replace(/'/g, '%27');
        }
        thisSpec.encodedLength = targetArray[currentTarget][j][key].length;
      } else if(thisValue instanceof Date) {
      	console.log("ERROR VALUE ", thisValue)
      	console.log("TYPEOF VALUE ", typeof thisValue)
        throw new h54sError('typeError', 'Date type not supported. Please use h54s.toSasDateTime function to convert it');
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
      const lastRow = targetArray[currentTarget].pop(); // get rid of that last row
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
  const specArray = [];
  for (let k in existingCols) {
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
  const basedate = new Date("January 1, 1960 00:00:00");
  const currdate = jsDate;

  // offsets for UTC and timezones and BST
  const baseOffset = basedate.getTimezoneOffset(); // in minutes
  const currOffset = currdate.getTimezoneOffset(); // in minutes

  // convert currdate to a sas datetime
  const offsetSecs    = (currOffset - baseOffset) * 60; // offsetDiff is in minutes to start with
  const baseDateSecs  = basedate.getTime() / 1000; // get rid of ms
  const currdateSecs  = currdate.getTime() / 1000; // get rid of ms
  const sasDatetime   = Math.round(currdateSecs - baseDateSecs - offsetSecs); // adjust

  return sasDatetime;
};

},{"../error.js":1,"../logs.js":5}]},{},[3])(3)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvZmlsZXMvaW5kZXguanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9pbmRleC5qcyIsInNyYy9tZXRob2RzL3V0aWxzLmpzIiwic3JjL3Nhc0RhdGEuanMiLCJzcmMvdGFibGVzL2luZGV4LmpzIiwic3JjL3RhYmxlcy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMzJCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOVNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDelFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvKlxyXG4qIGg1NHMgZXJyb3IgY29uc3RydWN0b3JcclxuKiBAY29uc3RydWN0b3JcclxuKlxyXG4qQHBhcmFtIHtzdHJpbmd9IHR5cGUgLSBFcnJvciB0eXBlXHJcbipAcGFyYW0ge3N0cmluZ30gbWVzc2FnZSAtIEVycm9yIG1lc3NhZ2VcclxuKkBwYXJhbSB7c3RyaW5nfSBzdGF0dXMgLSBFcnJvciBzdGF0dXMgcmV0dXJuZWQgZnJvbSBTQVNcclxuKlxyXG4qL1xyXG5mdW5jdGlvbiBoNTRzRXJyb3IodHlwZSwgbWVzc2FnZSwgc3RhdHVzKSB7XHJcbiAgaWYoRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UpIHtcclxuICAgIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKHRoaXMpO1xyXG4gIH1cclxuICB0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xyXG4gIHRoaXMudHlwZSAgICA9IHR5cGU7XHJcbiAgdGhpcy5zdGF0dXMgID0gc3RhdHVzO1xyXG59XHJcblxyXG5oNTRzRXJyb3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShFcnJvci5wcm90b3R5cGUsIHtcclxuICBjb25zdHJ1Y3Rvcjoge1xyXG4gICAgY29uZmlndXJhYmxlOiBmYWxzZSxcclxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxyXG4gICAgd3JpdGFibGU6IGZhbHNlLFxyXG4gICAgdmFsdWU6IGg1NHNFcnJvclxyXG4gIH0sXHJcbiAgbmFtZToge1xyXG4gICAgY29uZmlndXJhYmxlOiBmYWxzZSxcclxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxyXG4gICAgd3JpdGFibGU6IGZhbHNlLFxyXG4gICAgdmFsdWU6ICdoNTRzRXJyb3InXHJcbiAgfVxyXG59KTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gaDU0c0Vycm9yO1xyXG4iLCJjb25zdCBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xyXG5cclxuLyoqXHJcbiogaDU0cyBTQVMgRmlsZXMgb2JqZWN0IGNvbnN0cnVjdG9yXHJcbiogQGNvbnN0cnVjdG9yXHJcbipcclxuKkBwYXJhbSB7ZmlsZX0gZmlsZSAtIEZpbGUgYWRkZWQgd2hlbiBvYmplY3QgaXMgY3JlYXRlZFxyXG4qQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIG1hY3JvIG5hbWVcclxuKlxyXG4qL1xyXG5mdW5jdGlvbiBGaWxlcyhmaWxlLCBtYWNyb05hbWUpIHtcclxuICB0aGlzLl9maWxlcyA9IHt9O1xyXG5cclxuICBGaWxlcy5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgZmlsZSwgbWFjcm9OYW1lKTtcclxufVxyXG5cclxuLyoqXHJcbiogQWRkIGZpbGUgdG8gZmlsZXMgb2JqZWN0XHJcbiogQHBhcmFtIHtmaWxlfSBmaWxlIC0gSW5zdGFuY2Ugb2YgSmF2YVNjcmlwdCBGaWxlIG9iamVjdFxyXG4qIEBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBTYXMgbWFjcm8gbmFtZVxyXG4qXHJcbiovXHJcbkZpbGVzLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbihmaWxlLCBtYWNyb05hbWUpIHtcclxuICBpZihmaWxlICYmIG1hY3JvTmFtZSkge1xyXG4gICAgaWYoIShmaWxlIGluc3RhbmNlb2YgRmlsZSB8fCBmaWxlIGluc3RhbmNlb2YgQmxvYikpIHtcclxuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBhcmd1bWVudCBtdXN0IGJlIGluc3RhbmNlIG9mIEZpbGUgb2JqZWN0Jyk7XHJcbiAgICB9XHJcbiAgICBpZih0eXBlb2YgbWFjcm9OYW1lICE9PSAnc3RyaW5nJykge1xyXG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1NlY29uZCBhcmd1bWVudCBtdXN0IGJlIHN0cmluZycpO1xyXG4gICAgfVxyXG4gICAgaWYoIWlzTmFOKG1hY3JvTmFtZVttYWNyb05hbWUubGVuZ3RoIC0gMV0pKSB7XHJcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWFjcm8gbmFtZSBjYW5ub3QgaGF2ZSBudW1iZXIgYXQgdGhlIGVuZCcpO1xyXG4gICAgfVxyXG4gIH0gZWxzZSB7XHJcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgYXJndW1lbnRzJyk7XHJcbiAgfVxyXG5cclxuICB0aGlzLl9maWxlc1ttYWNyb05hbWVdID0gW1xyXG4gICAgJ0ZJTEUnLFxyXG4gICAgZmlsZVxyXG4gIF07XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IEZpbGVzO1xyXG4iLCJjb25zdCBoNTRzRXJyb3IgPSByZXF1aXJlKCcuL2Vycm9yLmpzJyk7XHJcblxyXG5jb25zdCBzYXNWZXJzaW9uTWFwID0ge1xyXG5cdHY5OiB7XHJcbiAgICB1cmw6ICcvU0FTU3RvcmVkUHJvY2Vzcy9kbycsXHJcbiAgICBsb2dpblVybDogJy9TQVNMb2dvbi9sb2dpbicsXHJcblx0XHRsb2dvdXRVcmw6ICcvU0FTU3RvcmVkUHJvY2Vzcy9kbz9fYWN0aW9uPWxvZ29mZicsXHJcbiAgICBSRVNUQXV0aExvZ2luVXJsOiAnL1NBU0xvZ29uL3YxL3RpY2tldHMnXHJcblx0fSxcclxuXHR2aXlhOiB7XHJcblx0XHR1cmw6ICcvU0FTSm9iRXhlY3V0aW9uLycsXHJcbiAgICBsb2dpblVybDogJy9TQVNMb2dvbi9sb2dpbi5kbycsXHJcblx0XHRsb2dvdXRVcmw6ICcvU0FTTG9nb24vbG9nb3V0LmRvPycsXHJcbiAgICBSRVNUQXV0aExvZ2luVXJsOiAnJ1xyXG5cdH1cclxufVxyXG5cclxuLyoqXHJcbipcclxuKiBAY29uc3RydWN0b3JcclxuKiBAcGFyYW0ge09iamVjdH0gY29uZmlnIC0gQ29uZmlndXJhdGlvbiBvYmplY3QgZm9yIHRoZSBINTRTIFNBUyBBZGFwdGVyXHJcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5zYXNWZXJzaW9uIC0gVmVyc2lvbiBvZiBTQVMsIGVpdGhlciAndjknIG9yICd2aXlhJ1xyXG4qIEBwYXJhbSB7Qm9vbGVhbn0gY29uZmlnLmRlYnVnIC0gV2hldGhlciBkZWJ1ZyBtb2RlIGlzIGVuYWJsZWQsIHNldHMgX2RlYnVnPTEzMVxyXG4qIEBwYXJhbSB7U3RyaW5nfSBjb25maWcubWV0YWRhdGFSb290IC0gQmFzZSBwYXRoIG9mIGFsbCBwcm9qZWN0IHNlcnZpY2VzIHRvIGJlIHByZXBlbmRlZCB0byBfcHJvZ3JhbSBwYXRoXHJcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy51cmwgLSBVUkkgb2YgdGhlIGpvYiBleGVjdXRvciAtIFNQV0Egb3IgSkVTXHJcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5sb2dpblVybCAtIFVSSSBvZiB0aGUgU0FTTG9nb24gd2ViIGxvZ2luIHBhdGggLSBvdmVycmlkZGVuIGJ5IGZvcm0gYWN0aW9uXHJcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5sb2dvdXRVcmwgLSBVUkkgb2YgdGhlIGxvZ291dCBhY3Rpb25cclxuKiBAcGFyYW0ge1N0cmluZ30gY29uZmlnLlJFU1RhdXRoIC0gQm9vbGVhbiB0byB0b2dnbGUgdXNlIG9mIFJFU1QgYXV0aGVudGljYXRpb24gaW4gU0FTIHY5XHJcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5SRVNUYXV0aExvZ2luVXJsIC0gQWRkcmVzcyBvZiBTQVNMb2dvbiB0aWNrZXRzIGVuZHBvaW50IGZvciBSRVNUIGF1dGhcclxuKiBAcGFyYW0ge0Jvb2xlYW59IGNvbmZpZy5yZXRyeUFmdGVyTG9naW4gLSBXaGV0aGVyIHRvIHJlc3VtZSByZXF1ZXN0cyB3aGljaCB3ZXJlIHBhcmtlZCB3aXRoIGxvZ2luIHJlZGlyZWN0IGFmdGVyIGEgc3VjY2Vzc2Z1bCByZS1sb2dpblxyXG4qIEBwYXJhbSB7TnVtYmVyfSBjb25maWcubWF4WGhyUmV0cmllcyAtIElmIGEgcHJvZ3JhbSBjYWxsIGZhaWxzLCBhdHRlbXB0IHRvIGNhbGwgaXQgYWdhaW4gTiB0aW1lcyB1bnRpbCBpdCBzdWNjZWVkc1xyXG4qIEBwYXJhbSB7TnVtYmVyfSBjb25maWcuYWpheFRpbWVvdXQgLSBOdW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRvIHdhaXQgZm9yIGEgcmVzcG9uc2UgYmVmb3JlIGNsb3NpbmcgdGhlIHJlcXVlc3RcclxuKiBAcGFyYW0ge0Jvb2xlYW59IGNvbmZpZy51c2VNdWx0aXBhcnRGb3JtRGF0YSAtIFdoZXRoZXIgdG8gdXNlIG11bHRpcGFydCBmb3IgUE9TVCAtIGZvciBsZWdhY3kgYmFja2VuZCBzdXBwb3J0XHJcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5jc3JmIC0gQ1NSRiB0b2tlbiBmb3IgSkVTXHJcbiogQFxyXG4qXHJcbiovXHJcbmNvbnN0IGg1NHMgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNvbmZpZykge1xyXG4gIC8vIERlZmF1bHQgY29uZmlnIHZhbHVlcywgb3ZlcnJpZGRlbiBieSBhbnl0aGluZyBpbiB0aGUgY29uZmlnIG9iamVjdFxyXG5cdHRoaXMuc2FzVmVyc2lvbiAgICAgICAgICAgPSAoY29uZmlnICYmIGNvbmZpZy5zYXNWZXJzaW9uKSB8fCAndjknIC8vdXNlIHY5IGFzIGRlZmF1bHQ9XHJcbiAgdGhpcy5kZWJ1ZyAgICAgICAgICAgICAgICA9IChjb25maWcgJiYgY29uZmlnLmRlYnVnKSB8fCBmYWxzZTtcclxuICB0aGlzLm1ldGFkYXRhUm9vdFx0XHRcdFx0XHQ9IChjb25maWcgJiYgY29uZmlnLm1ldGFkYXRhUm9vdCkgfHwgJyc7XHJcbiAgdGhpcy51cmwgICAgICAgICAgICAgICAgICA9IHNhc1ZlcnNpb25NYXBbdGhpcy5zYXNWZXJzaW9uXS51cmw7XHJcbiAgdGhpcy5sb2dpblVybCAgICAgICAgICAgICA9IHNhc1ZlcnNpb25NYXBbdGhpcy5zYXNWZXJzaW9uXS5sb2dpblVybDtcclxuICB0aGlzLmxvZ291dFVybCAgICAgICAgICAgID0gc2FzVmVyc2lvbk1hcFt0aGlzLnNhc1ZlcnNpb25dLmxvZ291dFVybDtcclxuICB0aGlzLlJFU1RhdXRoICAgICAgICAgICAgID0gZmFsc2U7XHJcbiAgdGhpcy5SRVNUYXV0aExvZ2luVXJsICAgICA9IHNhc1ZlcnNpb25NYXBbdGhpcy5zYXNWZXJzaW9uXS5SRVNUQXV0aExvZ2luVXJsO1xyXG4gIHRoaXMucmV0cnlBZnRlckxvZ2luICAgICAgPSB0cnVlO1xyXG4gIHRoaXMubWF4WGhyUmV0cmllcyAgICAgICAgPSA1O1xyXG4gIHRoaXMuYWpheFRpbWVvdXQgICAgICAgICAgPSAoY29uZmlnICYmIGNvbmZpZy5hamF4VGltZW91dCkgfHwgMzAwMDAwO1xyXG4gIHRoaXMudXNlTXVsdGlwYXJ0Rm9ybURhdGEgPSAoY29uZmlnICYmIGNvbmZpZy51c2VNdWx0aXBhcnRGb3JtRGF0YSkgfHwgdHJ1ZTtcclxuICB0aGlzLmNzcmYgICAgICAgICAgICAgICAgID0gJydcclxuICB0aGlzLmlzVml5YVx0XHRcdFx0XHRcdFx0XHQ9IHRoaXMuc2FzVmVyc2lvbiA9PT0gJ3ZpeWEnO1xyXG5cclxuICAvLyBJbml0aWFsaXNpbmcgY2FsbGJhY2sgc3RhY2tzIGZvciB3aGVuIGF1dGhlbnRpY2F0aW9uIGlzIHBhdXNlZFxyXG4gIHRoaXMucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzID0gW107XHJcbiAgdGhpcy5fcGVuZGluZ0NhbGxzID0gW107XHJcbiAgdGhpcy5fY3VzdG9tUGVuZGluZ0NhbGxzID0gW107XHJcbiAgdGhpcy5fZGlzYWJsZUNhbGxzID0gZmFsc2VcclxuICB0aGlzLl9hamF4ID0gcmVxdWlyZSgnLi9tZXRob2RzL2FqYXguanMnKSgpO1xyXG5cclxuICBfc2V0Q29uZmlnLmNhbGwodGhpcywgY29uZmlnKTtcclxuXHJcbiAgLy8gSWYgdGhpcyBpbnN0YW5jZSB3YXMgZGVwbG95ZWQgd2l0aCBhIHN0YW5kYWxvbmUgY29uZmlnIGV4dGVybmFsIHRvIHRoZSBidWlsZCB1c2UgdGhhdFxyXG4gIGlmKGNvbmZpZyAmJiBjb25maWcuaXNSZW1vdGVDb25maWcpIHtcclxuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xyXG5cclxuICAgIHRoaXMuX2Rpc2FibGVDYWxscyA9IHRydWU7XHJcblxyXG4gICAgLy8gJ2g1NHNDb25maWcuanNvbicgaXMgZm9yIHRoZSB0ZXN0aW5nIHdpdGgga2FybWFcclxuICAgIC8vcmVwbGFjZWQgYnkgZ3VscCBpbiBkZXYgYnVpbGQgKGRlZmluZWQgaW4gZ3VscGZpbGUgdW5kZXIgcHJveGllcylcclxuICAgIHRoaXMuX2FqYXguZ2V0KCdoNTRzQ29uZmlnLmpzb24nKS5zdWNjZXNzKGZ1bmN0aW9uKHJlcykge1xyXG4gICAgICBjb25zdCByZW1vdGVDb25maWcgPSBKU09OLnBhcnNlKHJlcy5yZXNwb25zZVRleHQpXHJcblxyXG5cdFx0XHQvLyBTYXZlIGxvY2FsIGNvbmZpZyBiZWZvcmUgdXBkYXRpbmcgaXQgd2l0aCByZW1vdGUgY29uZmlnXHJcblx0XHRcdGNvbnN0IGxvY2FsQ29uZmlnID0gT2JqZWN0LmFzc2lnbih7fSwgY29uZmlnKVxyXG5cdFx0XHRjb25zdCBvbGRNZXRhZGF0YVJvb3QgPSBsb2NhbENvbmZpZy5tZXRhZGF0YVJvb3Q7XHJcblxyXG4gICAgICBmb3IobGV0IGtleSBpbiByZW1vdGVDb25maWcpIHtcclxuICAgICAgICBpZihyZW1vdGVDb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSAmJiBrZXkgIT09ICdpc1JlbW90ZUNvbmZpZycpIHtcclxuICAgICAgICAgIGNvbmZpZ1trZXldID0gcmVtb3RlQ29uZmlnW2tleV07XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBfc2V0Q29uZmlnLmNhbGwoc2VsZiwgY29uZmlnKTtcclxuXHJcbiAgICAgIC8vIEV4ZWN1dGUgY2FsbGJhY2tzIHdoZW4gb3ZlcnJpZGVzIGZyb20gcmVtb3RlIGNvbmZpZyBhcmUgYXBwbGllZFxyXG4gICAgICBmb3IobGV0IGkgPSAwLCBuID0gc2VsZi5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgZm4gPSBzZWxmLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrc1tpXTtcclxuICAgICAgICBmbigpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBFeGVjdXRlIHNhcyBjYWxscyBkaXNhYmxlZCB3aGlsZSB3YWl0aW5nIGZvciB0aGUgY29uZmlnXHJcbiAgICAgIHNlbGYuX2Rpc2FibGVDYWxscyA9IGZhbHNlO1xyXG4gICAgICB3aGlsZShzZWxmLl9wZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGNvbnN0IHBlbmRpbmdDYWxsID0gc2VsZi5fcGVuZGluZ0NhbGxzLnNoaWZ0KCk7XHJcblx0XHRcdFx0Y29uc3Qgc2FzUHJvZ3JhbSA9IHBlbmRpbmdDYWxsLm9wdGlvbnMuc2FzUHJvZ3JhbTtcclxuXHRcdFx0XHRjb25zdCBjYWxsYmFja1BlbmRpbmcgPSBwZW5kaW5nQ2FsbC5vcHRpb25zLmNhbGxiYWNrO1xyXG5cdFx0XHRcdGNvbnN0IHBhcmFtcyA9IHBlbmRpbmdDYWxsLnBhcmFtcztcclxuXHRcdFx0XHQvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXHJcblx0XHRcdFx0cGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgcHJvZ3JhbSBwYXRoIHdpdGggbWV0YWRhdGFSb290IGlmIGl0J3Mgbm90IHNldFxyXG4gICAgICAgIGlmKHNlbGYubWV0YWRhdGFSb290ICYmIHBhcmFtcy5fcHJvZ3JhbS5pbmRleE9mKHNlbGYubWV0YWRhdGFSb290KSA9PT0gLTEpIHtcclxuICAgICAgICAgIHBhcmFtcy5fcHJvZ3JhbSA9IHNlbGYubWV0YWRhdGFSb290LnJlcGxhY2UoL1xcLz8kLywgJy8nKSArIHBhcmFtcy5fcHJvZ3JhbS5yZXBsYWNlKG9sZE1ldGFkYXRhUm9vdCwgJycpLnJlcGxhY2UoL15cXC8vLCAnJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxyXG4gICAgICAgIHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcclxuXHJcbiAgICAgICAgc2VsZi5jYWxsKHNhc1Byb2dyYW0sIG51bGwsIGNhbGxiYWNrUGVuZGluZywgcGFyYW1zKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRXhlY3V0ZSBjdXN0b20gY2FsbHMgdGhhdCB3ZSBtYWRlIHdoaWxlIHdhaXRpbmYgZm9yIHRoZSBjb25maWdcclxuICAgICAgIHdoaWxlKHNlbGYuX2N1c3RvbVBlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIFx0Y29uc3QgcGVuZGluZ0NhbGwgPSBzZWxmLl9jdXN0b21QZW5kaW5nQ2FsbHMuc2hpZnQoKVxyXG5cdFx0XHRcdGNvbnN0IGNhbGxNZXRob2QgPSBwZW5kaW5nQ2FsbC5jYWxsTWV0aG9kXHJcblx0XHRcdFx0Y29uc3QgX3VybCA9IHBlbmRpbmdDYWxsLl91cmxcclxuXHRcdFx0XHRjb25zdCBvcHRpb25zID0gcGVuZGluZ0NhbGwub3B0aW9ucztcclxuICAgICAgICAvLy91cGRhdGUgcHJvZ3JhbSB3aXRoIG1ldGFkYXRhUm9vdCBpZiBpdCdzIG5vdCBzZXRcclxuICAgICAgICBpZihzZWxmLm1ldGFkYXRhUm9vdCAmJiBvcHRpb25zLnBhcmFtcyAmJiBvcHRpb25zLnBhcmFtcy5fcHJvZ3JhbS5pbmRleE9mKHNlbGYubWV0YWRhdGFSb290KSA9PT0gLTEpIHtcclxuICAgICAgICAgIG9wdGlvbnMucGFyYW1zLl9wcm9ncmFtID0gc2VsZi5tZXRhZGF0YVJvb3QucmVwbGFjZSgvXFwvPyQvLCAnLycpICsgb3B0aW9ucy5wYXJhbXMuX3Byb2dyYW0ucmVwbGFjZShvbGRNZXRhZGF0YVJvb3QsICcnKS5yZXBsYWNlKC9eXFwvLywgJycpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IGFsc28gbWF5IGhhdmUgY2hhbmdlZCBmcm9tIHJlbW90ZUNvbmZpZ1xyXG5cdFx0XHRcdGlmIChvcHRpb25zLnBhcmFtcykge1xyXG5cdFx0XHRcdFx0b3B0aW9ucy5wYXJhbXMuX2RlYnVnID0gc2VsZi5kZWJ1ZyA/IDEzMSA6IDA7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdHNlbGYubWFuYWdlZFJlcXVlc3QoY2FsbE1ldGhvZCwgX3VybCwgb3B0aW9ucyk7XHJcbiAgICAgIH1cclxuICAgIH0pLmVycm9yKGZ1bmN0aW9uIChlcnIpIHtcclxuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYWpheEVycm9yJywgJ1JlbW90ZSBjb25maWcgZmlsZSBjYW5ub3QgYmUgbG9hZGVkLiBIdHRwIHN0YXR1cyBjb2RlOiAnICsgZXJyLnN0YXR1cyk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8vIHByaXZhdGUgZnVuY3Rpb24gdG8gc2V0IGg1NHMgaW5zdGFuY2UgcHJvcGVydGllc1xyXG4gIGZ1bmN0aW9uIF9zZXRDb25maWcoY29uZmlnKSB7XHJcbiAgICBpZighY29uZmlnKSB7XHJcbiAgICAgIHRoaXMuX2FqYXguc2V0VGltZW91dCh0aGlzLmFqYXhUaW1lb3V0KTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfSBlbHNlIGlmKHR5cGVvZiBjb25maWcgIT09ICdvYmplY3QnKSB7XHJcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgcGFyYW1ldGVyIHNob3VsZCBiZSBjb25maWcgb2JqZWN0Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy9tZXJnZSBjb25maWcgb2JqZWN0IGZyb20gcGFyYW1ldGVyIHdpdGggdGhpc1xyXG4gICAgZm9yKGxldCBrZXkgaW4gY29uZmlnKSB7XHJcbiAgICAgIGlmKGNvbmZpZy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcbiAgICAgICAgaWYoKGtleSA9PT0gJ3VybCcgfHwga2V5ID09PSAnbG9naW5VcmwnKSAmJiBjb25maWdba2V5XS5jaGFyQXQoMCkgIT09ICcvJykge1xyXG4gICAgICAgICAgY29uZmlnW2tleV0gPSAnLycgKyBjb25maWdba2V5XTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpc1trZXldID0gY29uZmlnW2tleV07XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvL2lmIHNlcnZlciBpcyByZW1vdGUgdXNlIHRoZSBmdWxsIHNlcnZlciB1cmxcclxuICAgIC8vTk9URTogVGhpcyByZXF1aXJlcyBDT1JTIGFuZCBpcyBoZXJlIGZvciBsZWdhY3kgc3VwcG9ydFxyXG4gICAgaWYoY29uZmlnLmhvc3RVcmwpIHtcclxuICAgICAgaWYoY29uZmlnLmhvc3RVcmwuY2hhckF0KGNvbmZpZy5ob3N0VXJsLmxlbmd0aCAtIDEpID09PSAnLycpIHtcclxuICAgICAgICBjb25maWcuaG9zdFVybCA9IGNvbmZpZy5ob3N0VXJsLnNsaWNlKDAsIC0xKTtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLmhvc3RVcmwgPSBjb25maWcuaG9zdFVybDtcclxuICAgICAgaWYgKCF0aGlzLnVybC5pbmNsdWRlcyh0aGlzLmhvc3RVcmwpKSB7XHJcblx0XHRcdFx0dGhpcy51cmwgPSBjb25maWcuaG9zdFVybCArIHRoaXMudXJsO1xyXG5cdFx0XHR9XHJcblx0XHRcdGlmICghdGhpcy5sb2dpblVybC5pbmNsdWRlcyh0aGlzLmhvc3RVcmwpKSB7XHJcblx0XHRcdFx0dGhpcy5sb2dpblVybCA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy5sb2dpblVybDtcclxuXHRcdFx0fVxyXG5cdFx0XHRpZiAoIXRoaXMuUkVTVGF1dGhMb2dpblVybC5pbmNsdWRlcyh0aGlzLmhvc3RVcmwpKSB7XHJcblx0XHRcdFx0dGhpcy5SRVNUYXV0aExvZ2luVXJsID0gY29uZmlnLmhvc3RVcmwgKyB0aGlzLlJFU1RhdXRoTG9naW5Vcmw7XHJcblx0XHRcdH1cclxuICAgIH1cclxuXHJcbiAgICB0aGlzLl9hamF4LnNldFRpbWVvdXQodGhpcy5hamF4VGltZW91dCk7XHJcbiAgfVxyXG59O1xyXG5cclxuLy8gcmVwbGFjZWQgYnkgZ3VscCB3aXRoIHJlYWwgdmVyc2lvbiBhdCBidWlsZCB0aW1lXHJcbmg1NHMudmVyc2lvbiA9ICdfX3ZlcnNpb25fXyc7XHJcblxyXG5cclxuaDU0cy5wcm90b3R5cGUgPSByZXF1aXJlKCcuL21ldGhvZHMnKTtcclxuXHJcbmg1NHMuVGFibGVzID0gcmVxdWlyZSgnLi90YWJsZXMnKTtcclxuaDU0cy5GaWxlcyA9IHJlcXVpcmUoJy4vZmlsZXMnKTtcclxuaDU0cy5TYXNEYXRhID0gcmVxdWlyZSgnLi9zYXNEYXRhLmpzJyk7XHJcblxyXG5oNTRzLmZyb21TYXNEYXRlVGltZSA9IHJlcXVpcmUoJy4vbWV0aG9kcy91dGlscy5qcycpLmZyb21TYXNEYXRlVGltZTtcclxuaDU0cy50b1Nhc0RhdGVUaW1lID0gcmVxdWlyZSgnLi90YWJsZXMvdXRpbHMuanMnKS50b1Nhc0RhdGVUaW1lO1xyXG5cclxuLy9zZWxmIGludm9rZWQgZnVuY3Rpb24gbW9kdWxlXHJcbnJlcXVpcmUoJy4vaWVfcG9seWZpbGxzLmpzJyk7XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XHJcbiAgaWYgKCFPYmplY3QuY3JlYXRlKSB7XHJcbiAgICBPYmplY3QuY3JlYXRlID0gZnVuY3Rpb24ocHJvdG8sIHByb3BzKSB7XHJcbiAgICAgIGlmICh0eXBlb2YgcHJvcHMgIT09IFwidW5kZWZpbmVkXCIpIHtcclxuICAgICAgICB0aHJvdyBcIlRoZSBtdWx0aXBsZS1hcmd1bWVudCB2ZXJzaW9uIG9mIE9iamVjdC5jcmVhdGUgaXMgbm90IHByb3ZpZGVkIGJ5IHRoaXMgYnJvd3NlciBhbmQgY2Fubm90IGJlIHNoaW1tZWQuXCI7XHJcbiAgICAgIH1cclxuICAgICAgZnVuY3Rpb24gY3RvcigpIHsgfVxyXG4gICAgICBjdG9yLnByb3RvdHlwZSA9IHByb3RvO1xyXG4gICAgICByZXR1cm4gbmV3IGN0b3IoKTtcclxuICAgIH07XHJcbiAgfVxyXG5cclxuXHJcbiAgLy8gRnJvbSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9PYmplY3Qva2V5c1xyXG4gIGlmICghT2JqZWN0LmtleXMpIHtcclxuICAgIE9iamVjdC5rZXlzID0gKGZ1bmN0aW9uICgpIHtcclxuICAgICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgICB2YXIgaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LFxyXG4gICAgICAgICAgaGFzRG9udEVudW1CdWcgPSAhKHt0b1N0cmluZzogbnVsbH0pLnByb3BlcnR5SXNFbnVtZXJhYmxlKCd0b1N0cmluZycpLFxyXG4gICAgICAgICAgZG9udEVudW1zID0gW1xyXG4gICAgICAgICAgICAndG9TdHJpbmcnLFxyXG4gICAgICAgICAgICAndG9Mb2NhbGVTdHJpbmcnLFxyXG4gICAgICAgICAgICAndmFsdWVPZicsXHJcbiAgICAgICAgICAgICdoYXNPd25Qcm9wZXJ0eScsXHJcbiAgICAgICAgICAgICdpc1Byb3RvdHlwZU9mJyxcclxuICAgICAgICAgICAgJ3Byb3BlcnR5SXNFbnVtZXJhYmxlJyxcclxuICAgICAgICAgICAgJ2NvbnN0cnVjdG9yJ1xyXG4gICAgICAgICAgXSxcclxuICAgICAgICAgIGRvbnRFbnVtc0xlbmd0aCA9IGRvbnRFbnVtcy5sZW5ndGg7XHJcblxyXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKG9iaikge1xyXG4gICAgICAgIGlmICh0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JyAmJiAodHlwZW9mIG9iaiAhPT0gJ2Z1bmN0aW9uJyB8fCBvYmogPT09IG51bGwpKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdPYmplY3Qua2V5cyBjYWxsZWQgb24gbm9uLW9iamVjdCcpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdLCBwcm9wLCBpO1xyXG5cclxuICAgICAgICBmb3IgKHByb3AgaW4gb2JqKSB7XHJcbiAgICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApKSB7XHJcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKHByb3ApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGhhc0RvbnRFbnVtQnVnKSB7XHJcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZG9udEVudW1zTGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqLCBkb250RW51bXNbaV0pKSB7XHJcbiAgICAgICAgICAgICAgcmVzdWx0LnB1c2goZG9udEVudW1zW2ldKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgICB9O1xyXG4gICAgfSgpKTtcclxuICB9XHJcblxyXG4gIC8vIEZyb20gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvQXJyYXkvbGFzdEluZGV4T2ZcclxuICBpZiAoIUFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZikge1xyXG4gICAgQXJyYXkucHJvdG90eXBlLmxhc3RJbmRleE9mID0gZnVuY3Rpb24oc2VhcmNoRWxlbWVudCAvKiwgZnJvbUluZGV4Ki8pIHtcclxuICAgICAgJ3VzZSBzdHJpY3QnO1xyXG5cclxuICAgICAgaWYgKHRoaXMgPT09IHZvaWQgMCB8fCB0aGlzID09PSBudWxsKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB2YXIgbiwgayxcclxuICAgICAgICB0ID0gT2JqZWN0KHRoaXMpLFxyXG4gICAgICAgIGxlbiA9IHQubGVuZ3RoID4+PiAwO1xyXG4gICAgICBpZiAobGVuID09PSAwKSB7XHJcbiAgICAgICAgcmV0dXJuIC0xO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBuID0gbGVuIC0gMTtcclxuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XHJcbiAgICAgICAgbiA9IE51bWJlcihhcmd1bWVudHNbMV0pO1xyXG4gICAgICAgIGlmIChuICE9IG4pIHtcclxuICAgICAgICAgIG4gPSAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIGlmIChuICE9PSAwICYmIG4gIT0gKDEgLyAwKSAmJiBuICE9IC0oMSAvIDApKSB7XHJcbiAgICAgICAgICBuID0gKG4gPiAwIHx8IC0xKSAqIE1hdGguZmxvb3IoTWF0aC5hYnMobikpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgZm9yIChrID0gbiA+PSAwID8gTWF0aC5taW4obiwgbGVuIC0gMSkgOiBsZW4gLSBNYXRoLmFicyhuKTsgayA+PSAwOyBrLS0pIHtcclxuICAgICAgICBpZiAoayBpbiB0ICYmIHRba10gPT09IHNlYXJjaEVsZW1lbnQpIHtcclxuICAgICAgICAgIHJldHVybiBrO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gLTE7XHJcbiAgICB9O1xyXG4gIH1cclxufSgpO1xyXG4iLCJjb25zdCBsb2dzID0ge1xyXG4gIGFwcGxpY2F0aW9uTG9nczogW10sXHJcbiAgZGVidWdEYXRhOiBbXSxcclxuICBzYXNFcnJvcnM6IFtdLFxyXG4gIGZhaWxlZFJlcXVlc3RzOiBbXVxyXG59O1xyXG5cclxuY29uc3QgbGltaXRzID0ge1xyXG4gIGFwcGxpY2F0aW9uTG9nczogMTAwLFxyXG4gIGRlYnVnRGF0YTogMjAsXHJcbiAgZmFpbGVkUmVxdWVzdHM6IDIwLFxyXG4gIHNhc0Vycm9yczogMTAwXHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5nZXQgPSB7XHJcbiAgZ2V0U2FzRXJyb3JzOiBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiBsb2dzLnNhc0Vycm9ycztcclxuICB9LFxyXG4gIGdldEFwcGxpY2F0aW9uTG9nczogZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gbG9ncy5hcHBsaWNhdGlvbkxvZ3M7XHJcbiAgfSxcclxuICBnZXREZWJ1Z0RhdGE6IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIGxvZ3MuZGVidWdEYXRhO1xyXG4gIH0sXHJcbiAgZ2V0RmFpbGVkUmVxdWVzdHM6IGZ1bmN0aW9uKCkge1xyXG4gICAgcmV0dXJuIGxvZ3MuZmFpbGVkUmVxdWVzdHM7XHJcbiAgfSxcclxuICBnZXRBbGxMb2dzOiBmdW5jdGlvbiAoKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzYXNFcnJvcnM6IGxvZ3Muc2FzRXJyb3JzLFxyXG4gICAgICBhcHBsaWNhdGlvbkxvZ3M6IGxvZ3MuYXBwbGljYXRpb25Mb2dzLFxyXG4gICAgICBkZWJ1Z0RhdGE6IGxvZ3MuZGVidWdEYXRhLFxyXG4gICAgICBmYWlsZWRSZXF1ZXN0czogbG9ncy5mYWlsZWRSZXF1ZXN0c1xyXG4gICAgfVxyXG4gIH1cclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzLmNsZWFyID0ge1xyXG4gIGNsZWFyQXBwbGljYXRpb25Mb2dzOiBmdW5jdGlvbigpIHtcclxuICAgIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnNwbGljZSgwLCBsb2dzLmFwcGxpY2F0aW9uTG9ncy5sZW5ndGgpO1xyXG4gIH0sXHJcbiAgY2xlYXJEZWJ1Z0RhdGE6IGZ1bmN0aW9uKCkge1xyXG4gICAgbG9ncy5kZWJ1Z0RhdGEuc3BsaWNlKDAsIGxvZ3MuZGVidWdEYXRhLmxlbmd0aCk7XHJcbiAgfSxcclxuICBjbGVhclNhc0Vycm9yczogZnVuY3Rpb24oKSB7XHJcbiAgICBsb2dzLnNhc0Vycm9ycy5zcGxpY2UoMCwgbG9ncy5zYXNFcnJvcnMubGVuZ3RoKTtcclxuICB9LFxyXG4gIGNsZWFyRmFpbGVkUmVxdWVzdHM6IGZ1bmN0aW9uKCkge1xyXG4gICAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5zcGxpY2UoMCwgbG9ncy5mYWlsZWRSZXF1ZXN0cy5sZW5ndGgpO1xyXG4gIH0sXHJcbiAgY2xlYXJBbGxMb2dzOiBmdW5jdGlvbigpIHtcclxuICAgIHRoaXMuY2xlYXJBcHBsaWNhdGlvbkxvZ3MoKTtcclxuICAgIHRoaXMuY2xlYXJEZWJ1Z0RhdGEoKTtcclxuICAgIHRoaXMuY2xlYXJTYXNFcnJvcnMoKTtcclxuICAgIHRoaXMuY2xlYXJGYWlsZWRSZXF1ZXN0cygpO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4qICBBZGRzIGFwcGxpY2F0aW9uIGxvZ3MgdG8gYW4gYXJyYXkgb2YgbG9nc1xyXG4qXHJcbiogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgLSBNZXNzYWdlIHRvIGFkZCB0byBhcHBsaWNhdGlvbkxvZ3NcclxuKiBAcGFyYW0ge1N0cmluZ30gc2FzUHJvZ3JhbSAtIEhlYWRlciAtIHdoaWNoIHJlcXVlc3QgZGlkIG1lc3NhZ2UgY29tZSBmcm9tXHJcbipcclxuKi9cclxubW9kdWxlLmV4cG9ydHMuYWRkQXBwbGljYXRpb25Mb2cgPSBmdW5jdGlvbihtZXNzYWdlLCBzYXNQcm9ncmFtKSB7XHJcbiAgaWYobWVzc2FnZSA9PT0gJ2JsYW5rJykge1xyXG4gICAgcmV0dXJuO1xyXG4gIH1cclxuICBjb25zdCBsb2cgPSB7XHJcbiAgICBtZXNzYWdlOiAgICBtZXNzYWdlLFxyXG4gICAgdGltZTogICAgICAgbmV3IERhdGUoKSxcclxuICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW1cclxuICB9O1xyXG4gIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnB1c2gobG9nKTtcclxuXHJcbiAgaWYobG9ncy5hcHBsaWNhdGlvbkxvZ3MubGVuZ3RoID4gbGltaXRzLmFwcGxpY2F0aW9uTG9ncykge1xyXG4gICAgbG9ncy5hcHBsaWNhdGlvbkxvZ3Muc2hpZnQoKTtcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuKiBBZGRzIGRlYnVnIGRhdGEgdG8gYW4gYXJyYXkgb2YgbG9nc1xyXG4qXHJcbiogQHBhcmFtIHtTdHJpbmd9IGh0bWxEYXRhIC0gRnVsbCBodG1sIGxvZyBmcm9tIGV4ZWN1dG9yXHJcbiogQHBhcmFtIHtTdHJpbmd9IGRlYnVnVGV4dCAtIERlYnVnIHRleHQgdGhhdCBjYW1lIGFmdGVyIGRhdGEgb3V0cHV0XHJcbiogQHBhcmFtIHtTdHJpbmd9IHNhc1Byb2dyYW0gLSBXaGljaCBwcm9ncmFtIHJlcXVlc3QgZGlkIG1lc3NhZ2UgY29tZSBmcm9tXHJcbiogQHBhcmFtIHtTdHJpbmd9IHBhcmFtcyAtIFdlYiBhcHAgcGFyYW1zIHRoYXQgd2VyZSByZWNlaXZlZFxyXG4qXHJcbiovXHJcbm1vZHVsZS5leHBvcnRzLmFkZERlYnVnRGF0YSA9IGZ1bmN0aW9uKGh0bWxEYXRhLCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0sIHBhcmFtcykge1xyXG4gIGxvZ3MuZGVidWdEYXRhLnB1c2goe1xyXG4gICAgZGVidWdIdG1sOiAgaHRtbERhdGEsXHJcbiAgICBkZWJ1Z1RleHQ6ICBkZWJ1Z1RleHQsXHJcbiAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxyXG4gICAgcGFyYW1zOiAgICAgcGFyYW1zLFxyXG4gICAgdGltZTogICAgICAgbmV3IERhdGUoKVxyXG4gIH0pO1xyXG5cclxuICBpZihsb2dzLmRlYnVnRGF0YS5sZW5ndGggPiBsaW1pdHMuZGVidWdEYXRhKSB7XHJcbiAgICBsb2dzLmRlYnVnRGF0YS5zaGlmdCgpO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4qIEFkZHMgZmFpbGVkIHJlcXVlc3RzIHRvIGFuIGFycmF5IG9mIGZhaWxlZCByZXF1ZXN0IGxvZ3NcclxuKlxyXG4qIEBwYXJhbSB7U3RyaW5nfSByZXNwb25zZVRleHQgLSBGdWxsIGh0bWwgb3V0cHV0IGZyb20gZXhlY3V0b3JcclxuKiBAcGFyYW0ge1N0cmluZ30gZGVidWdUZXh0IC0gRGVidWcgdGV4dCB0aGF0IGNhbWUgYWZ0ZXIgZGF0YSBvdXRwdXRcclxuKiBAcGFyYW0ge1N0cmluZ30gc2FzUHJvZ3JhbSAtIFdoaWNoIHByb2dyYW0gcmVxdWVzdCBkaWQgbWVzc2FnZSBjb21lIGZyb21cclxuKlxyXG4qL1xyXG5tb2R1bGUuZXhwb3J0cy5hZGRGYWlsZWRSZXF1ZXN0ID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0pIHtcclxuICBsb2dzLmZhaWxlZFJlcXVlc3RzLnB1c2goe1xyXG4gICAgcmVzcG9uc2VIdG1sOiByZXNwb25zZVRleHQsXHJcbiAgICByZXNwb25zZVRleHQ6IGRlYnVnVGV4dCxcclxuICAgIHNhc1Byb2dyYW06ICAgc2FzUHJvZ3JhbSxcclxuICAgIHRpbWU6ICAgICAgICAgbmV3IERhdGUoKVxyXG4gIH0pO1xyXG5cclxuICAvL21heCAyMCBmYWlsZWQgcmVxdWVzdHNcclxuICBpZihsb2dzLmZhaWxlZFJlcXVlc3RzLmxlbmd0aCA+IGxpbWl0cy5mYWlsZWRSZXF1ZXN0cykge1xyXG4gICAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5zaGlmdCgpO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4qIEFkZHMgU0FTIGVycm9ycyB0byBhbiBhcnJheSBvZiBsb2dzXHJcbipcclxuKiBAcGFyYW0ge0FycmF5fSBlcnJvcnMgLSBBcnJheSBvZiBlcnJvcnMgdG8gY29uY2F0IHRvIG1haW4gbG9nXHJcbipcclxuKi9cclxubW9kdWxlLmV4cG9ydHMuYWRkU2FzRXJyb3JzID0gZnVuY3Rpb24oZXJyb3JzKSB7XHJcbiAgbG9ncy5zYXNFcnJvcnMgPSBsb2dzLnNhc0Vycm9ycy5jb25jYXQoZXJyb3JzKTtcclxuXHJcbiAgd2hpbGUobG9ncy5zYXNFcnJvcnMubGVuZ3RoID4gbGltaXRzLnNhc0Vycm9ycykge1xyXG4gICAgbG9ncy5zYXNFcnJvcnMuc2hpZnQoKTtcclxuICB9XHJcbn07XHJcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xyXG4gIGxldCB0aW1lb3V0ID0gMzAwMDA7XHJcbiAgbGV0IHRpbWVvdXRIYW5kbGU7XHJcblxyXG4gIGNvbnN0IHhociA9IGZ1bmN0aW9uICh0eXBlLCB1cmwsIGRhdGEsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzID0ge30pIHtcclxuICAgIGNvbnN0IG1ldGhvZHMgPSB7XHJcbiAgICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgfSxcclxuICAgICAgZXJyb3I6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCBYSFIgPSBYTUxIdHRwUmVxdWVzdDtcclxuICAgIGNvbnN0IHJlcXVlc3QgPSBuZXcgWEhSKCdNU1hNTDIuWE1MSFRUUC4zLjAnKTtcclxuXHJcbiAgICByZXF1ZXN0Lm9wZW4odHlwZSwgdXJsLCB0cnVlKTtcclxuXHJcbiAgICAvL211bHRpcGFydC9mb3JtLWRhdGEgaXMgc2V0IGF1dG9tYXRpY2FsbHkgc28gbm8gbmVlZCBmb3IgZWxzZSBibG9ja1xyXG4gICAgLy8gQ29udGVudC1UeXBlIGhlYWRlciBoYXMgdG8gYmUgZXhwbGljaXRseSBzZXQgdXBcclxuICAgIGlmICghbXVsdGlwYXJ0Rm9ybURhdGEpIHtcclxuICAgICAgaWYgKGhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddKSB7XHJcbiAgICAgICAgcmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKCdDb250ZW50LVR5cGUnLCBoZWFkZXJzWydDb250ZW50LVR5cGUnXSlcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICByZXF1ZXN0LnNldFJlcXVlc3RIZWFkZXIoJ0NvbnRlbnQtVHlwZScsICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgT2JqZWN0LmtleXMoaGVhZGVycykuZm9yRWFjaChrZXkgPT4ge1xyXG4gICAgICBpZiAoa2V5ICE9PSAnQ29udGVudC1UeXBlJykge1xyXG4gICAgICAgIHJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcihrZXksIGhlYWRlcnNba2V5XSlcclxuICAgICAgfVxyXG4gICAgfSlcclxuICAgIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgICBpZiAocmVxdWVzdC5yZWFkeVN0YXRlID09PSA0KSB7XHJcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRIYW5kbGUpO1xyXG4gICAgICAgIGlmIChyZXF1ZXN0LnN0YXR1cyA+PSAyMDAgJiYgcmVxdWVzdC5zdGF0dXMgPCAzMDApIHtcclxuICAgICAgICAgIG1ldGhvZHMuc3VjY2Vzcy5jYWxsKG1ldGhvZHMsIHJlcXVlc3QpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBtZXRob2RzLmVycm9yLmNhbGwobWV0aG9kcywgcmVxdWVzdCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIGlmICh0aW1lb3V0ID4gMCkge1xyXG4gICAgICB0aW1lb3V0SGFuZGxlID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgcmVxdWVzdC5hYm9ydCgpO1xyXG4gICAgICB9LCB0aW1lb3V0KTtcclxuICAgIH1cclxuXHJcbiAgICByZXF1ZXN0LnNlbmQoZGF0YSk7XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc3VjY2VzczogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XHJcbiAgICAgICAgbWV0aG9kcy5zdWNjZXNzID0gY2FsbGJhY2s7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgIH0sXHJcbiAgICAgIGVycm9yOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcclxuICAgICAgICBtZXRob2RzLmVycm9yID0gY2FsbGJhY2s7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgfTtcclxuXHJcbiAgY29uc3Qgc2VyaWFsaXplID0gZnVuY3Rpb24gKG9iaikge1xyXG4gICAgY29uc3Qgc3RyID0gW107XHJcbiAgICBmb3IgKGxldCBwIGluIG9iaikge1xyXG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XHJcbiAgICAgICAgaWYgKG9ialtwXSBpbnN0YW5jZW9mIEFycmF5KSB7XHJcbiAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcclxuICAgICAgICAgICAgc3RyLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KHApICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQob2JqW3BdW2ldKSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXSkpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHN0ci5qb2luKFwiJlwiKTtcclxuICB9O1xyXG5cclxuICBjb25zdCBjcmVhdGVNdWx0aXBhcnRGb3JtRGF0YVBheWxvYWQgPSBmdW5jdGlvbiAob2JqKSB7XHJcbiAgICBsZXQgZGF0YSA9IG5ldyBGb3JtRGF0YSgpO1xyXG4gICAgZm9yIChsZXQgcCBpbiBvYmopIHtcclxuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xyXG4gICAgICAgIGlmIChvYmpbcF0gaW5zdGFuY2VvZiBBcnJheSAmJiBwICE9PSAnZmlsZScpIHtcclxuICAgICAgICAgIGZvciAobGV0IGkgPSAwLCBuID0gb2JqW3BdLmxlbmd0aDsgaSA8IG47IGkrKykge1xyXG4gICAgICAgICAgICBkYXRhLmFwcGVuZChwLCBvYmpbcF1baV0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAocCA9PT0gJ2ZpbGUnKSB7XHJcbiAgICAgICAgICBkYXRhLmFwcGVuZChwLCBvYmpbcF1bMF0sIG9ialtwXVsxXSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZGF0YTtcclxuICB9O1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgZ2V0OiBmdW5jdGlvbiAodXJsLCBkYXRhLCBtdWx0aXBhcnRGb3JtRGF0YSwgaGVhZGVycykge1xyXG4gICAgICBsZXQgZGF0YVN0cjtcclxuICAgICAgaWYgKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xyXG4gICAgICAgIGRhdGFTdHIgPSBzZXJpYWxpemUoZGF0YSk7XHJcbiAgICAgIH1cclxuICAgICAgY29uc3QgdXJsV2l0aFBhcmFtcyA9IGRhdGFTdHIgPyAodXJsICsgJz8nICsgZGF0YVN0cikgOiB1cmw7XHJcbiAgICAgIHJldHVybiB4aHIoJ0dFVCcsIHVybFdpdGhQYXJhbXMsIG51bGwsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKTtcclxuICAgIH0sXHJcblx0XHRwb3N0OiBmdW5jdGlvbih1cmwsIGRhdGEsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKSB7XHJcbiAgICAgIGxldCBwYXlsb2FkID0gZGF0YTtcclxuICAgICAgaWYodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgaWYobXVsdGlwYXJ0Rm9ybURhdGEpIHtcclxuICAgICAgICAgIHBheWxvYWQgPSBjcmVhdGVNdWx0aXBhcnRGb3JtRGF0YVBheWxvYWQoZGF0YSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHBheWxvYWQgPSBzZXJpYWxpemUoZGF0YSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiB4aHIoJ1BPU1QnLCB1cmwsIHBheWxvYWQsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKTtcclxuICAgIH0sXHJcbiAgICBwdXQ6IGZ1bmN0aW9uKHVybCwgZGF0YSwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMpIHtcclxuICAgICAgbGV0IHBheWxvYWQgPSBkYXRhO1xyXG4gICAgICBpZih0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICBpZihtdWx0aXBhcnRGb3JtRGF0YSkge1xyXG4gICAgICAgICAgcGF5bG9hZCA9IGNyZWF0ZU11bHRpcGFydEZvcm1EYXRhUGF5bG9hZChkYXRhKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHhocignUFVUJywgdXJsLCBwYXlsb2FkLCBtdWx0aXBhcnRGb3JtRGF0YSwgaGVhZGVycyk7XHJcbiAgICB9LFxyXG5cdFx0ZGVsZXRlOiBmdW5jdGlvbih1cmwsIHBheWxvYWQsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKSB7XHJcbiAgICBcdHJldHVybiB4aHIoJ0RFTEVURScsIHVybCwgcGF5bG9hZCwgbnVsbCwgaGVhZGVycyk7XHJcblx0XHR9LFxyXG4gICAgc2V0VGltZW91dDogZnVuY3Rpb24gKHQpIHtcclxuICAgICAgdGltZW91dCA9IHQ7XHJcbiAgICB9LFxyXG4gICAgc2VyaWFsaXplXHJcbiAgfTtcclxufTtcclxuIiwiY29uc3QgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcclxuY29uc3QgbG9ncyA9IHJlcXVpcmUoJy4uL2xvZ3MuanMnKTtcclxuY29uc3QgVGFibGVzID0gcmVxdWlyZSgnLi4vdGFibGVzJyk7XHJcbmNvbnN0IFNhc0RhdGEgPSByZXF1aXJlKCcuLi9zYXNEYXRhLmpzJyk7XHJcbmNvbnN0IEZpbGVzID0gcmVxdWlyZSgnLi4vZmlsZXMnKTtcclxuXHJcbi8qKlxyXG4qIENhbGwgU2FzIHByb2dyYW1cclxuKlxyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gUGF0aCBvZiB0aGUgc2FzIHByb2dyYW1cclxuKiBAcGFyYW0ge09iamVjdH0gZGF0YU9iaiAtIEluc3RhbmNlIG9mIFRhYmxlcyBvYmplY3Qgd2l0aCBkYXRhIGFkZGVkXHJcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcclxuKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIC0gb2JqZWN0IGNvbnRhaW5pbmcgYWRkaXRpb25hbCBwcm9ncmFtIHBhcmFtZXRlcnNcclxuKlxyXG4qL1xyXG5tb2R1bGUuZXhwb3J0cy5jYWxsID0gZnVuY3Rpb24gKHNhc1Byb2dyYW0sIGRhdGFPYmosIGNhbGxiYWNrLCBwYXJhbXMpIHtcclxuXHRjb25zdCBzZWxmID0gdGhpcztcclxuXHRsZXQgcmV0cnlDb3VudCA9IDA7XHJcblx0Y29uc3QgZGJnID0gdGhpcy5kZWJ1Z1xyXG5cdGNvbnN0IGNzcmYgPSB0aGlzLmNzcmY7XHJcblxyXG5cdGlmICghY2FsbGJhY2sgfHwgdHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XHJcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgYSBjYWxsYmFjaycpO1xyXG5cdH1cclxuXHRpZiAoIXNhc1Byb2dyYW0pIHtcclxuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBTYXMgcHJvZ3JhbSBmaWxlIHBhdGgnKTtcclxuXHR9XHJcblx0aWYgKHR5cGVvZiBzYXNQcm9ncmFtICE9PSAnc3RyaW5nJykge1xyXG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBwYXJhbWV0ZXIgc2hvdWxkIGJlIHN0cmluZycpO1xyXG5cdH1cclxuXHRpZiAodGhpcy51c2VNdWx0aXBhcnRGb3JtRGF0YSA9PT0gZmFsc2UgJiYgIShkYXRhT2JqIGluc3RhbmNlb2YgVGFibGVzKSkge1xyXG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdDYW5ub3Qgc2VuZCBmaWxlcyB1c2luZyBhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQuIFBsZWFzZSB1c2UgVGFibGVzIG9yIGRlZmF1bHQgdmFsdWUgZm9yIHVzZU11bHRpcGFydEZvcm1EYXRhJyk7XHJcblx0fVxyXG5cclxuXHRpZiAoIXBhcmFtcykge1xyXG5cdFx0cGFyYW1zID0ge1xyXG5cdFx0XHRfcHJvZ3JhbTogdGhpcy5fdXRpbHMuZ2V0RnVsbFByb2dyYW1QYXRoKHRoaXMubWV0YWRhdGFSb290LCBzYXNQcm9ncmFtKSxcclxuXHRcdFx0X2RlYnVnOiB0aGlzLmRlYnVnID8gMTMxIDogMCxcclxuXHRcdFx0X3NlcnZpY2U6ICdkZWZhdWx0JyxcclxuXHRcdFx0X2NzcmY6IGNzcmZcclxuXHRcdH07XHJcblx0fSBlbHNlIHtcclxuXHRcdHBhcmFtcyA9IE9iamVjdC5hc3NpZ24oe30sIHBhcmFtcywge19jc3JmOiBjc3JmfSlcclxuXHR9XHJcblxyXG5cdGlmIChkYXRhT2JqKSB7XHJcblx0XHRsZXQga2V5LCBkYXRhUHJvdmlkZXI7XHJcblx0XHRpZiAoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykge1xyXG5cdFx0XHRkYXRhUHJvdmlkZXIgPSBkYXRhT2JqLl90YWJsZXM7XHJcblx0XHR9IGVsc2UgaWYgKGRhdGFPYmogaW5zdGFuY2VvZiBGaWxlcyB8fCBkYXRhT2JqIGluc3RhbmNlb2YgU2FzRGF0YSkge1xyXG5cdFx0XHRkYXRhUHJvdmlkZXIgPSBkYXRhT2JqLl9maWxlcztcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGNvbnNvbGUubG9nKG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnV3JvbmcgdHlwZSBvZiB0YWJsZXMgb2JqZWN0JykpXHJcblx0XHR9XHJcblx0XHRmb3IgKGtleSBpbiBkYXRhUHJvdmlkZXIpIHtcclxuXHRcdFx0aWYgKGRhdGFQcm92aWRlci5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcblx0XHRcdFx0cGFyYW1zW2tleV0gPSBkYXRhUHJvdmlkZXJba2V5XTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0aWYgKHRoaXMuX2Rpc2FibGVDYWxscykge1xyXG5cdFx0dGhpcy5fcGVuZGluZ0NhbGxzLnB1c2goe1xyXG5cdFx0XHRwYXJhbXMsXHJcblx0XHRcdG9wdGlvbnM6IHtcclxuXHRcdFx0XHRzYXNQcm9ncmFtLFxyXG5cdFx0XHRcdGRhdGFPYmosXHJcblx0XHRcdFx0Y2FsbGJhY2tcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0XHRyZXR1cm47XHJcblx0fVxyXG5cclxuXHR0aGlzLl9hamF4LnBvc3QodGhpcy51cmwsIHBhcmFtcywgdGhpcy51c2VNdWx0aXBhcnRGb3JtRGF0YSkuc3VjY2Vzcyhhc3luYyBmdW5jdGlvbiAocmVzKSB7XHJcblx0XHRpZiAoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XHJcblx0XHRcdC8vcmVtZW1iZXIgdGhlIGNhbGwgZm9yIGxhdHRlciB1c2VcclxuXHRcdFx0c2VsZi5fcGVuZGluZ0NhbGxzLnB1c2goe1xyXG5cdFx0XHRcdHBhcmFtcyxcclxuXHRcdFx0XHRvcHRpb25zOiB7XHJcblx0XHRcdFx0XHRzYXNQcm9ncmFtLFxyXG5cdFx0XHRcdFx0ZGF0YU9iaixcclxuXHRcdFx0XHRcdGNhbGxiYWNrXHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9KTtcclxuXHJcblx0XHRcdC8vdGhlcmUncyBubyBuZWVkIHRvIGNvbnRpbnVlIGlmIHByZXZpb3VzIGNhbGwgcmV0dXJuZWQgbG9naW4gZXJyb3JcclxuXHRcdFx0aWYgKHNlbGYuX2Rpc2FibGVDYWxscykge1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRzZWxmLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdub3RMb2dnZWRpbkVycm9yJywgJ1lvdSBhcmUgbm90IGxvZ2dlZCBpbicpKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGxldCByZXNPYmosIHVuZXNjYXBlZFJlc09iaiwgZXJyO1xyXG5cdFx0XHRsZXQgZG9uZSA9IGZhbHNlO1xyXG5cclxuXHRcdFx0aWYgKCFkYmcpIHtcclxuXHRcdFx0XHR0cnkge1xyXG5cdFx0XHRcdFx0cmVzT2JqID0gc2VsZi5fdXRpbHMucGFyc2VSZXMocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKTtcclxuXHRcdFx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2cocmVzT2JqLmxvZ21lc3NhZ2UsIHNhc1Byb2dyYW0pO1xyXG5cclxuXHRcdFx0XHRcdGlmIChkYXRhT2JqIGluc3RhbmNlb2YgVGFibGVzKSB7XHJcblx0XHRcdFx0XHRcdHVuZXNjYXBlZFJlc09iaiA9IHNlbGYuX3V0aWxzLnVuZXNjYXBlVmFsdWVzKHJlc09iaik7XHJcblx0XHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0XHR1bmVzY2FwZWRSZXNPYmogPSByZXNPYmo7XHJcblx0XHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdFx0aWYgKHJlc09iai5zdGF0dXMgIT09ICdzdWNjZXNzJykge1xyXG5cdFx0XHRcdFx0XHRlcnIgPSBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtRXJyb3InLCByZXNPYmouZXJyb3JtZXNzYWdlLCByZXNPYmouc3RhdHVzKTtcclxuXHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcclxuXHRcdFx0XHR9IGNhdGNoIChlKSB7XHJcblx0XHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB7XHJcblx0XHRcdFx0XHRcdGlmIChyZXRyeUNvdW50IDwgc2VsZi5tYXhYaHJSZXRyaWVzKSB7XHJcblx0XHRcdFx0XHRcdFx0ZG9uZSA9IGZhbHNlO1xyXG5cdFx0XHRcdFx0XHRcdHNlbGYuX2FqYXgucG9zdChzZWxmLnVybCwgcGFyYW1zLCBzZWxmLnVzZU11bHRpcGFydEZvcm1EYXRhKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XHJcblx0XHRcdFx0XHRcdFx0cmV0cnlDb3VudCsrO1xyXG5cdFx0XHRcdFx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coXCJSZXRyeWluZyAjXCIgKyByZXRyeUNvdW50LCBzYXNQcm9ncmFtKTtcclxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdFx0XHRzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XHJcblx0XHRcdFx0XHRcdFx0c2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XHJcblx0XHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpO1xyXG5cdFx0XHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcclxuXHRcdFx0XHRcdFx0c2VsZi5fdXRpbHMucGFyc2VFcnJvclJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xyXG5cdFx0XHRcdFx0XHRzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcclxuXHRcdFx0XHRcdFx0ZXJyID0gZTtcclxuXHRcdFx0XHRcdFx0ZG9uZSA9IHRydWU7XHJcblx0XHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0XHRzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XHJcblx0XHRcdFx0XHRcdHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xyXG5cdFx0XHRcdFx0XHRlcnIgPSBuZXcgaDU0c0Vycm9yKCd1bmtub3duRXJyb3InLCBlLm1lc3NhZ2UpO1xyXG5cdFx0XHRcdFx0XHRlcnIuc3RhY2sgPSBlLnN0YWNrO1xyXG5cdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9IGZpbmFsbHkge1xyXG5cdFx0XHRcdFx0aWYgKGRvbmUpIHtcclxuXHRcdFx0XHRcdFx0Y2FsbGJhY2soZXJyLCB1bmVzY2FwZWRSZXNPYmopO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHR0cnkge1xyXG5cdFx0XHRcdFx0cmVzT2JqID0gYXdhaXQgc2VsZi5fdXRpbHMucGFyc2VEZWJ1Z1JlcyhyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMsIHNlbGYuaG9zdFVybCwgc2VsZi5pc1ZpeWEpO1xyXG5cdFx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhyZXNPYmoubG9nbWVzc2FnZSwgc2FzUHJvZ3JhbSk7XHJcblxyXG5cdFx0XHRcdFx0aWYgKGRhdGFPYmogaW5zdGFuY2VvZiBUYWJsZXMpIHtcclxuXHRcdFx0XHRcdFx0dW5lc2NhcGVkUmVzT2JqID0gc2VsZi5fdXRpbHMudW5lc2NhcGVWYWx1ZXMocmVzT2JqKTtcclxuXHRcdFx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0XHRcdHVuZXNjYXBlZFJlc09iaiA9IHJlc09iajtcclxuXHRcdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0XHRpZiAocmVzT2JqLnN0YXR1cyAhPT0gJ3N1Y2Nlc3MnKSB7XHJcblx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1FcnJvcicsIHJlc09iai5lcnJvcm1lc3NhZ2UsIHJlc09iai5zdGF0dXMpO1xyXG5cdFx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xyXG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgU3ludGF4RXJyb3IpIHtcclxuXHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsIGUubWVzc2FnZSk7XHJcblx0XHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xyXG5cdFx0XHRcdFx0fSBlbHNlIGlmIChlIGluc3RhbmNlb2YgaDU0c0Vycm9yKSB7XHJcblx0XHRcdFx0XHRcdGlmIChlLnR5cGUgPT09ICdwYXJzZUVycm9yJyAmJiByZXRyeUNvdW50IDwgMSkge1xyXG5cdFx0XHRcdFx0XHRcdGRvbmUgPSBmYWxzZTtcclxuXHRcdFx0XHRcdFx0XHRzZWxmLl9hamF4LnBvc3Qoc2VsZi51cmwsIHBhcmFtcywgc2VsZi51c2VNdWx0aXBhcnRGb3JtRGF0YSkuc3VjY2Vzcyh0aGlzLnN1Y2Nlc3MpLmVycm9yKHRoaXMuZXJyb3IpO1xyXG5cdFx0XHRcdFx0XHRcdHJldHJ5Q291bnQrKztcclxuXHRcdFx0XHRcdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKFwiUmV0cnlpbmcgI1wiICsgcmV0cnlDb3VudCwgc2FzUHJvZ3JhbSk7XHJcblx0XHRcdFx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcclxuXHRcdFx0XHRcdFx0XHRcdGVyciA9IGU7XHJcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcclxuXHRcdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdFx0ZG9uZSA9IHRydWU7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Vua25vd25FcnJvcicsIGUubWVzc2FnZSk7XHJcblx0XHRcdFx0XHRcdGVyci5zdGFjayA9IGUuc3RhY2s7XHJcblx0XHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH0gZmluYWxseSB7XHJcblx0XHRcdFx0XHRpZiAoZG9uZSkge1xyXG5cdFx0XHRcdFx0XHRjYWxsYmFjayhlcnIsIHVuZXNjYXBlZFJlc09iaik7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSkuZXJyb3IoZnVuY3Rpb24gKHJlcykge1xyXG5cdFx0bGV0IF9jc3JmXHJcblx0XHRpZiAocmVzLnN0YXR1cyA9PSA0NDkgfHwgKHJlcy5zdGF0dXMgPT0gNDAzICYmIChyZXMucmVzcG9uc2VUZXh0LmluY2x1ZGVzKCdfY3NyZicpIHx8IHJlcy5nZXRSZXNwb25zZUhlYWRlcignWC1Gb3JiaWRkZW4tUmVhc29uJykgPT09ICdDU1JGJykgJiYgKF9jc3JmID0gcmVzLmdldFJlc3BvbnNlSGVhZGVyKHJlcy5nZXRSZXNwb25zZUhlYWRlcignWC1DU1JGLUhFQURFUicpKSkpKSB7XHJcblx0XHRcdHBhcmFtc1snX2NzcmYnXSA9IF9jc3JmO1xyXG5cdFx0XHRzZWxmLmNzcmYgPSBfY3NyZlxyXG5cdFx0XHRpZiAocmV0cnlDb3VudCA8IHNlbGYubWF4WGhyUmV0cmllcykge1xyXG5cdFx0XHRcdHNlbGYuX2FqYXgucG9zdChzZWxmLnVybCwgcGFyYW1zLCB0cnVlKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XHJcblx0XHRcdFx0cmV0cnlDb3VudCsrO1xyXG5cdFx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coXCJSZXRyeWluZyAjXCIgKyByZXRyeUNvdW50LCBzYXNQcm9ncmFtKTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XHJcblx0XHRcdFx0c2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XHJcblx0XHRcdFx0Y2FsbGJhY2sobmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpKTtcclxuXHRcdFx0fVxyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnUmVxdWVzdCBmYWlsZWQgd2l0aCBzdGF0dXM6ICcgKyByZXMuc3RhdHVzLCBzYXNQcm9ncmFtKTtcclxuXHRcdFx0Ly8gaWYgcmVxdWVzdCBoYXMgZXJyb3IgdGV4dCBlbHNlIGNhbGxiYWNrXHJcblx0XHRcdGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ2h0dHBFcnJvcicsIHJlcy5zdGF0dXNUZXh0KSk7XHJcblx0XHR9XHJcblx0fSk7XHJcbn07XHJcblxyXG4vKipcclxuKiBMb2dpbiBtZXRob2RcclxuKlxyXG4qIEBwYXJhbSB7c3RyaW5nfSB1c2VyIC0gTG9naW4gdXNlcm5hbWVcclxuKiBAcGFyYW0ge3N0cmluZ30gcGFzcyAtIExvZ2luIHBhc3N3b3JkXHJcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcclxuKlxyXG4qIE9SXHJcbipcclxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxyXG4qXHJcbiovXHJcbm1vZHVsZS5leHBvcnRzLmxvZ2luID0gZnVuY3Rpb24gKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XHJcblx0aWYgKCF1c2VyIHx8ICFwYXNzKSB7XHJcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0NyZWRlbnRpYWxzIG5vdCBzZXQnKTtcclxuXHR9XHJcblx0aWYgKHR5cGVvZiB1c2VyICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgcGFzcyAhPT0gJ3N0cmluZycpIHtcclxuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVXNlciBhbmQgcGFzcyBwYXJhbWV0ZXJzIG11c3QgYmUgc3RyaW5ncycpO1xyXG5cdH1cclxuXHQvL05PVEU6IGNhbGxiYWNrIG9wdGlvbmFsP1xyXG5cdGlmICghY2FsbGJhY2sgfHwgdHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XHJcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgY2FsbGJhY2snKTtcclxuXHR9XHJcblxyXG5cdGlmICghdGhpcy5SRVNUYXV0aCkge1xyXG5cdFx0aGFuZGxlU2FzTG9nb24uY2FsbCh0aGlzLCB1c2VyLCBwYXNzLCBjYWxsYmFjayk7XHJcblx0fSBlbHNlIHtcclxuXHRcdGhhbmRsZVJlc3RMb2dvbi5jYWxsKHRoaXMsIHVzZXIsIHBhc3MsIGNhbGxiYWNrKTtcclxuXHR9XHJcbn07XHJcblxyXG4vKipcclxuKiBNYW5hZ2VkUmVxdWVzdCBtZXRob2RcclxuKlxyXG4qIEBwYXJhbSB7c3RyaW5nfSBjYWxsTWV0aG9kIC0gZ2V0LCBwb3N0LFxyXG4qIEBwYXJhbSB7c3RyaW5nfSBfdXJsIC0gVVJMIHRvIG1ha2UgcmVxdWVzdCB0b1xyXG4qIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIC0gY2FsbGJhY2sgZnVuY3Rpb24gYXMgY2FsbGJhY2sgcGFyYW10ZXIgaW4gb3B0aW9ucyBvYmplY3QgaXMgcmVxdWlyZWRcclxuKlxyXG4qL1xyXG5tb2R1bGUuZXhwb3J0cy5tYW5hZ2VkUmVxdWVzdCA9IGZ1bmN0aW9uIChjYWxsTWV0aG9kID0gJ2dldCcsIF91cmwsIG9wdGlvbnMgPSB7XHJcblx0Y2FsbGJhY2s6ICgpID0+IGNvbnNvbGUubG9nKCdNaXNzaW5nIGNhbGxiYWNrIGZ1bmN0aW9uJylcclxufSkge1xyXG5cdGNvbnN0IHNlbGYgPSB0aGlzO1xyXG5cdGNvbnN0IGNzcmYgPSB0aGlzLmNzcmY7XHJcblx0bGV0IHJldHJ5Q291bnQgPSAwO1xyXG5cdGNvbnN0IHt1c2VNdWx0aXBhcnRGb3JtRGF0YSwgc2FzUHJvZ3JhbSwgZGF0YU9iaiwgcGFyYW1zLCBjYWxsYmFjaywgaGVhZGVyc30gPSBvcHRpb25zXHJcblxyXG5cdGlmIChzYXNQcm9ncmFtKSB7XHJcblx0XHRyZXR1cm4gc2VsZi5jYWxsKHNhc1Byb2dyYW0sIGRhdGFPYmosIGNhbGxiYWNrLCBwYXJhbXMpXHJcblx0fVxyXG5cclxuXHRsZXQgdXJsID0gX3VybFxyXG5cdGlmICghX3VybC5zdGFydHNXaXRoKCdodHRwJykpIHtcclxuXHRcdHVybCA9IHNlbGYuaG9zdFVybCArIF91cmxcclxuXHR9XHJcblxyXG5cdGNvbnN0IF9oZWFkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgaGVhZGVycywge1xyXG5cdFx0J1gtQ1NSRi1UT0tFTic6IGNzcmZcclxuXHR9KVxyXG5cdGNvbnN0IF9vcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge1xyXG5cdFx0aGVhZGVyczogX2hlYWRlcnNcclxuXHR9KVxyXG5cclxuXHRpZiAodGhpcy5fZGlzYWJsZUNhbGxzKSB7XHJcblx0XHR0aGlzLl9jdXN0b21QZW5kaW5nQ2FsbHMucHVzaCh7XHJcblx0XHRcdGNhbGxNZXRob2QsXHJcblx0XHRcdF91cmwsXHJcblx0XHRcdG9wdGlvbnM6IF9vcHRpb25zXHJcblx0XHR9KTtcclxuXHRcdHJldHVybjtcclxuXHR9XHJcblxyXG5cdHNlbGYuX2FqYXhbY2FsbE1ldGhvZF0odXJsLCBwYXJhbXMsIHVzZU11bHRpcGFydEZvcm1EYXRhLCBfaGVhZGVycykuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XHJcblx0XHRpZiAoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XHJcblx0XHRcdC8vcmVtZW1iZXIgdGhlIGNhbGwgZm9yIGxhdHRlciB1c2VcclxuXHRcdFx0c2VsZi5fY3VzdG9tUGVuZGluZ0NhbGxzLnB1c2goe1xyXG5cdFx0XHRcdGNhbGxNZXRob2QsXHJcblx0XHRcdFx0X3VybCxcclxuXHRcdFx0XHRvcHRpb25zOiBfb3B0aW9uc1xyXG5cdFx0XHR9KTtcclxuXHJcblx0XHRcdC8vdGhlcmUncyBubyBuZWVkIHRvIGNvbnRpbnVlIGlmIHByZXZpb3VzIGNhbGwgcmV0dXJuZWQgbG9naW4gZXJyb3JcclxuXHRcdFx0aWYgKHNlbGYuX2Rpc2FibGVDYWxscykge1xyXG5cdFx0XHRcdHJldHVybjtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRzZWxmLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdub3RMb2dnZWRpbkVycm9yJywgJ1lvdSBhcmUgbm90IGxvZ2dlZCBpbicpKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGxldCByZXNPYmosIGVycjtcclxuXHRcdFx0bGV0IGRvbmUgPSBmYWxzZTtcclxuXHJcblx0XHRcdHRyeSB7XHJcblx0XHRcdFx0Y29uc3QgYXJyID0gcmVzLmdldEFsbFJlc3BvbnNlSGVhZGVycygpLnNwbGl0KCdcXHJcXG4nKTtcclxuXHRcdFx0XHRjb25zdCByZXNIZWFkZXJzID0gYXJyLnJlZHVjZShmdW5jdGlvbiAoYWNjLCBjdXJyZW50LCBpKSB7XHJcblx0XHRcdFx0XHRsZXQgcGFydHMgPSBjdXJyZW50LnNwbGl0KCc6ICcpO1xyXG5cdFx0XHRcdFx0YWNjW3BhcnRzWzBdXSA9IHBhcnRzWzFdO1xyXG5cdFx0XHRcdFx0cmV0dXJuIGFjYztcclxuXHRcdFx0XHR9LCB7fSk7XHJcblx0XHRcdFx0bGV0IGJvZHkgPSByZXMucmVzcG9uc2VUZXh0XHJcblx0XHRcdFx0dHJ5IHtcclxuXHRcdFx0XHRcdGJvZHkgPSBKU09OLnBhcnNlKGJvZHkpXHJcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xyXG5cdFx0XHRcdFx0Y29uc29sZS5sb2coJ3Jlc3BvbnNlIGlzIG5vdCBKU09OIHN0cmluZycpXHJcblx0XHRcdFx0fSBmaW5hbGx5IHtcclxuXHRcdFx0XHRcdHJlc09iaiA9IE9iamVjdC5hc3NpZ24oe30sIHtcclxuXHRcdFx0XHRcdFx0aGVhZGVyczogcmVzSGVhZGVycyxcclxuXHRcdFx0XHRcdFx0c3RhdHVzOiByZXMuc3RhdHVzLFxyXG5cdFx0XHRcdFx0XHRzdGF0dXNUZXh0OiByZXMuc3RhdHVzVGV4dCxcclxuXHRcdFx0XHRcdFx0Ym9keVxyXG5cdFx0XHRcdFx0fSlcclxuXHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fSBjYXRjaCAoZSkge1xyXG5cdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Vua25vd25FcnJvcicsIGUubWVzc2FnZSk7XHJcblx0XHRcdFx0ZXJyLnN0YWNrID0gZS5zdGFjaztcclxuXHRcdFx0XHRkb25lID0gdHJ1ZTtcclxuXHJcblx0XHRcdH0gZmluYWxseSB7XHJcblx0XHRcdFx0aWYgKGRvbmUpIHtcclxuXHRcdFx0XHRcdGNhbGxiYWNrKGVyciwgcmVzT2JqKVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcclxuXHRcdGxldCBfY3NyZlxyXG5cdFx0aWYgKHJlcy5zdGF0dXMgPT0gNDQ5IHx8IChyZXMuc3RhdHVzID09IDQwMyAmJiAocmVzLnJlc3BvbnNlVGV4dC5pbmNsdWRlcygnX2NzcmYnKSB8fCByZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ1gtRm9yYmlkZGVuLVJlYXNvbicpID09PSAnQ1NSRicpICYmIChfY3NyZiA9IHJlcy5nZXRSZXNwb25zZUhlYWRlcihyZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ1gtQ1NSRi1IRUFERVInKSkpKSkge1xyXG5cdFx0XHRzZWxmLmNzcmYgPSBfY3NyZlxyXG5cdFx0XHRjb25zdCBfaGVhZGVycyA9IE9iamVjdC5hc3NpZ24oe30sIGhlYWRlcnMsIHtbcmVzLmdldFJlc3BvbnNlSGVhZGVyKCdYLUNTUkYtSEVBREVSJyldOiBfY3NyZn0pXHJcblx0XHRcdGlmIChyZXRyeUNvdW50IDwgc2VsZi5tYXhYaHJSZXRyaWVzKSB7XHJcblx0XHRcdFx0c2VsZi5fYWpheFtjYWxsTWV0aG9kXSh1cmwsIHBhcmFtcywgdXNlTXVsdGlwYXJ0Rm9ybURhdGEsIF9oZWFkZXJzKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XHJcblx0XHRcdFx0cmV0cnlDb3VudCsrO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKSk7XHJcblx0XHRcdH1cclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ01hbmFnZWQgcmVxdWVzdCBmYWlsZWQgd2l0aCBzdGF0dXM6ICcgKyByZXMuc3RhdHVzLCBfdXJsKTtcclxuXHRcdFx0Ly8gaWYgcmVxdWVzdCBoYXMgZXJyb3IgdGV4dCBlbHNlIGNhbGxiYWNrXHJcblx0XHRcdGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ2h0dHBFcnJvcicsIHJlcy5yZXNwb25zZVRleHQsIHJlcy5zdGF0dXMpKTtcclxuXHRcdH1cclxuXHR9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIExvZyBvbiB0byBTQVMgaWYgd2UgYXJlIGFza2VkIHRvXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VyIC0gVXNlcm5hbWUgb2YgdXNlclxyXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzcyAtIFBhc3N3b3JkIG9mIHVzZXJcclxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSB3aGF0IHRvIGRvIGFmdGVyXHJcbiAqL1xyXG5mdW5jdGlvbiBoYW5kbGVTYXNMb2dvbih1c2VyLCBwYXNzLCBjYWxsYmFjaykge1xyXG5cdGNvbnN0IHNlbGYgPSB0aGlzO1xyXG5cclxuXHRjb25zdCBsb2dpblBhcmFtcyA9IHtcclxuXHRcdF9zZXJ2aWNlOiAnZGVmYXVsdCcsXHJcblx0XHQvL2ZvciBTQVMgOS40LFxyXG5cdFx0dXNlcm5hbWU6IHVzZXIsXHJcblx0XHRwYXNzd29yZDogcGFzc1xyXG5cdH07XHJcblxyXG5cdGZvciAobGV0IGtleSBpbiB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtcykge1xyXG5cdFx0bG9naW5QYXJhbXNba2V5XSA9IHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zW2tleV07XHJcblx0fVxyXG5cclxuXHR0aGlzLl9sb2dpbkF0dGVtcHRzID0gMDtcclxuXHJcblx0dGhpcy5fYWpheC5wb3N0KHRoaXMubG9naW5VcmwsIGxvZ2luUGFyYW1zKVxyXG5cdFx0LnN1Y2Nlc3MoaGFuZGxlU2FzTG9nb25TdWNjZXNzKVxyXG5cdFx0LmVycm9yKGhhbmRsZVNhc0xvZ29uRXJyb3IpO1xyXG5cclxuXHRmdW5jdGlvbiBoYW5kbGVTYXNMb2dvbkVycm9yKHJlcykge1xyXG5cdFx0aWYgKHJlcy5zdGF0dXMgPT0gNDQ5KSB7XHJcblx0XHRcdGhhbmRsZVNhc0xvZ29uU3VjY2VzcyhyZXMpO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcclxuXHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xyXG5cdH1cclxuXHJcblx0ZnVuY3Rpb24gaGFuZGxlU2FzTG9nb25TdWNjZXNzKHJlcykge1xyXG5cdFx0aWYgKCsrc2VsZi5fbG9naW5BdHRlbXB0cyA9PT0gMykge1xyXG5cdFx0XHRyZXR1cm4gY2FsbGJhY2soLTIpO1xyXG5cdFx0fVxyXG5cdFx0aWYgKHNlbGYuX3V0aWxzLm5lZWRUb0xvZ2luLmNhbGwoc2VsZiwgcmVzKSkge1xyXG5cdFx0XHQvL3dlIGFyZSBnZXR0aW5nIGZvcm0gYWdhaW4gYWZ0ZXIgcmVkaXJlY3RcclxuXHRcdFx0Ly9hbmQgbmVlZCB0byBsb2dpbiBhZ2FpbiB1c2luZyB0aGUgbmV3IHVybFxyXG5cdFx0XHQvL19sb2dpbkNoYW5nZWQgaXMgc2V0IGluIG5lZWRUb0xvZ2luIGZ1bmN0aW9uXHJcblx0XHRcdC8vYnV0IGlmIGxvZ2luIHVybCBpcyBub3QgZGlmZmVyZW50LCB3ZSBhcmUgY2hlY2tpbmcgaWYgdGhlcmUgYXJlIGFkaXRpb25hbCBwYXJhbWV0ZXJzXHJcblx0XHRcdGlmIChzZWxmLl9sb2dpbkNoYW5nZWQgfHwgKHNlbGYuX2lzTmV3TG9naW5QYWdlICYmICFzZWxmLl9hZGl0aW9uYWxMb2dpblBhcmFtcykpIHtcclxuXHRcdFx0XHRkZWxldGUgc2VsZi5fbG9naW5DaGFuZ2VkO1xyXG5cdFx0XHRcdGNvbnN0IGlucHV0cyA9IHJlcy5yZXNwb25zZVRleHQubWF0Y2goLzxpbnB1dC4qXCJoaWRkZW5cIltePl0qPi9nKTtcclxuXHRcdFx0XHRpZiAoaW5wdXRzKSB7XHJcblx0XHRcdFx0XHRpbnB1dHMuZm9yRWFjaChmdW5jdGlvbiAoaW5wdXRTdHIpIHtcclxuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWVNYXRjaCA9IGlucHV0U3RyLm1hdGNoKC9uYW1lPVwiKFteXCJdKilcIlxcc3ZhbHVlPVwiKFteXCJdKikvKTtcclxuXHRcdFx0XHRcdFx0bG9naW5QYXJhbXNbdmFsdWVNYXRjaFsxXV0gPSB2YWx1ZU1hdGNoWzJdO1xyXG5cdFx0XHRcdFx0fSk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdHNlbGYuX2FqYXgucG9zdChzZWxmLmxvZ2luVXJsLCBsb2dpblBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbiAoKSB7XHJcblx0XHRcdFx0XHQvL3dlIG5lZWQgdGhpcyBnZXQgcmVxdWVzdCBiZWNhdXNlIG9mIHRoZSBzYXMgOS40IHNlY3VyaXR5IGNoZWNrc1xyXG5cdFx0XHRcdFx0c2VsZi5fYWpheC5nZXQoc2VsZi51cmwpLnN1Y2Nlc3MoaGFuZGxlU2FzTG9nb25TdWNjZXNzKS5lcnJvcihoYW5kbGVTYXNMb2dvbkVycm9yKTtcclxuXHRcdFx0XHR9KS5lcnJvcihoYW5kbGVTYXNMb2dvbkVycm9yKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIHtcclxuXHRcdFx0XHQvL2dldHRpbmcgZm9ybSBhZ2FpbiwgYnV0IGl0IHdhc24ndCBhIHJlZGlyZWN0XHJcblx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnV3JvbmcgdXNlcm5hbWUgb3IgcGFzc3dvcmQnKTtcclxuXHRcdFx0XHRjYWxsYmFjaygtMSk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRzZWxmLl9kaXNhYmxlQ2FsbHMgPSBmYWxzZTtcclxuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XHJcblx0XHRcdHdoaWxlIChzZWxmLl9wZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xyXG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdDYWxsID0gc2VsZi5fcGVuZGluZ0NhbGxzLnNoaWZ0KCk7XHJcblx0XHRcdFx0Y29uc3QgbWV0aG9kID0gcGVuZGluZ0NhbGwubWV0aG9kIHx8IHNlbGYuY2FsbC5iaW5kKHNlbGYpO1xyXG5cdFx0XHRcdGNvbnN0IHNhc1Byb2dyYW0gPSBwZW5kaW5nQ2FsbC5vcHRpb25zLnNhc1Byb2dyYW07XHJcblx0XHRcdFx0Y29uc3QgY2FsbGJhY2tQZW5kaW5nID0gcGVuZGluZ0NhbGwub3B0aW9ucy5jYWxsYmFjaztcclxuXHRcdFx0XHRjb25zdCBwYXJhbXMgPSBwZW5kaW5nQ2FsbC5wYXJhbXM7XHJcblx0XHRcdFx0Ly91cGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxyXG5cdFx0XHRcdHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcclxuXHRcdFx0XHRpZiAoc2VsZi5yZXRyeUFmdGVyTG9naW4pIHtcclxuXHRcdFx0XHRcdG1ldGhvZChzYXNQcm9ncmFtLCBudWxsLCBjYWxsYmFja1BlbmRpbmcsIHBhcmFtcyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fVxyXG59XHJcbi8qKlxyXG4gKiBSRVNUIGxvZ29uIGZvciA5LjQgdjEgdGlja2V0IGJhc2VkIGF1dGhcclxuICogQHBhcmFtIHtTdHJpbmd9IHVzZXIgLVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzc1xyXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFja1xyXG4gKi9cclxuZnVuY3Rpb24gaGFuZGxlUmVzdExvZ29uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XHJcblx0Y29uc3Qgc2VsZiA9IHRoaXM7XHJcblxyXG5cdGNvbnN0IGxvZ2luUGFyYW1zID0ge1xyXG5cdFx0dXNlcm5hbWU6IHVzZXIsXHJcblx0XHRwYXNzd29yZDogcGFzc1xyXG5cdH07XHJcblxyXG5cdHRoaXMuX2FqYXgucG9zdCh0aGlzLlJFU1RhdXRoTG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uIChyZXMpIHtcclxuXHRcdGNvbnN0IGxvY2F0aW9uID0gcmVzLmdldFJlc3BvbnNlSGVhZGVyKCdMb2NhdGlvbicpO1xyXG5cclxuXHRcdHNlbGYuX2FqYXgucG9zdChsb2NhdGlvbiwge1xyXG5cdFx0XHRzZXJ2aWNlOiBzZWxmLnVybFxyXG5cdFx0fSkuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XHJcblx0XHRcdGlmIChzZWxmLnVybC5pbmRleE9mKCc/JykgPT09IC0xKSB7XHJcblx0XHRcdFx0c2VsZi51cmwgKz0gJz90aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQ7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0aWYgKHNlbGYudXJsLmluZGV4T2YoJ3RpY2tldCcpICE9PSAtMSkge1xyXG5cdFx0XHRcdFx0c2VsZi51cmwgPSBzZWxmLnVybC5yZXBsYWNlKC90aWNrZXQ9W14mXSsvLCAndGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0KTtcclxuXHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0c2VsZi51cmwgKz0gJyZ0aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQ7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcclxuXHRcdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcclxuXHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcclxuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XHJcblx0XHR9KTtcclxuXHR9KS5lcnJvcihmdW5jdGlvbiAocmVzKSB7XHJcblx0XHRpZiAocmVzLnJlc3BvbnNlVGV4dCA9PT0gJ2Vycm9yLmF1dGhlbnRpY2F0aW9uLmNyZWRlbnRpYWxzLmJhZCcpIHtcclxuXHRcdFx0Y2FsbGJhY2soLTEpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcclxuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XHJcblx0XHR9XHJcblx0fSk7XHJcbn1cclxuXHJcbi8qKlxyXG4qIExvZ291dCBtZXRob2RcclxuKlxyXG4qIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gQ2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIHdoZW4gbG9nb3V0IGlzIGRvbmVcclxuKlxyXG4qL1xyXG5cclxubW9kdWxlLmV4cG9ydHMubG9nb3V0ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XHJcblx0Y29uc3QgYmFzZVVybCA9IHRoaXMuaG9zdFVybCB8fCAnJztcclxuXHRjb25zdCB1cmwgPSBiYXNlVXJsICsgdGhpcy5sb2dvdXRVcmw7XHJcblxyXG5cdHRoaXMuX2FqYXguZ2V0KHVybCkuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XHJcblx0XHR0aGlzLl9kaXNhYmxlQ2FsbHMgPSB0cnVlXHJcblx0XHRjYWxsYmFjaygpO1xyXG5cdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcclxuXHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ291dCBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xyXG5cdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XHJcblx0fSk7XHJcbn07XHJcblxyXG4vKlxyXG4qIEVudGVyIGRlYnVnIG1vZGVcclxuKlxyXG4qL1xyXG5tb2R1bGUuZXhwb3J0cy5zZXREZWJ1Z01vZGUgPSBmdW5jdGlvbiAoKSB7XHJcblx0dGhpcy5kZWJ1ZyA9IHRydWU7XHJcbn07XHJcblxyXG4vKlxyXG4qIEV4aXQgZGVidWcgbW9kZSBhbmQgY2xlYXIgbG9nc1xyXG4qXHJcbiovXHJcbm1vZHVsZS5leHBvcnRzLnVuc2V0RGVidWdNb2RlID0gZnVuY3Rpb24gKCkge1xyXG5cdHRoaXMuZGVidWcgPSBmYWxzZTtcclxufTtcclxuXHJcbmZvciAobGV0IGtleSBpbiBsb2dzLmdldCkge1xyXG5cdGlmIChsb2dzLmdldC5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcblx0XHRtb2R1bGUuZXhwb3J0c1trZXldID0gbG9ncy5nZXRba2V5XTtcclxuXHR9XHJcbn1cclxuXHJcbmZvciAobGV0IGtleSBpbiBsb2dzLmNsZWFyKSB7XHJcblx0aWYgKGxvZ3MuY2xlYXIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xyXG5cdFx0bW9kdWxlLmV4cG9ydHNba2V5XSA9IGxvZ3MuY2xlYXJba2V5XTtcclxuXHR9XHJcbn1cclxuXHJcbi8qXHJcbiogQWRkIGNhbGxiYWNrIGZ1bmN0aW9ucyBleGVjdXRlZCB3aGVuIHByb3BlcnRpZXMgYXJlIHVwZGF0ZWQgd2l0aCByZW1vdGUgY29uZmlnXHJcbipcclxuKkBjYWxsYmFjayAtIGNhbGxiYWNrIHB1c2hlZCB0byBhcnJheVxyXG4qXHJcbiovXHJcbm1vZHVsZS5leHBvcnRzLm9uUmVtb3RlQ29uZmlnVXBkYXRlID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XHJcblx0dGhpcy5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MucHVzaChjYWxsYmFjayk7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cy5fdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XHJcblxyXG4vKipcclxuICogTG9naW4gY2FsbCB3aGljaCByZXR1cm5zIGEgcHJvbWlzZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlciAtIFVzZXJuYW1lXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXNzIC0gUGFzc3dvcmRcclxuICovXHJcbm1vZHVsZS5leHBvcnRzLnByb21pc2VMb2dpbiA9IGZ1bmN0aW9uICh1c2VyLCBwYXNzKSB7XHJcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuXHRcdGlmICghdXNlciB8fCAhcGFzcykge1xyXG5cdFx0XHRyZWplY3QobmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdDcmVkZW50aWFscyBub3Qgc2V0JykpXHJcblx0XHR9XHJcblx0XHRpZiAodHlwZW9mIHVzZXIgIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBwYXNzICE9PSAnc3RyaW5nJykge1xyXG5cdFx0XHRyZWplY3QobmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdVc2VyIGFuZCBwYXNzIHBhcmFtZXRlcnMgbXVzdCBiZSBzdHJpbmdzJykpXHJcblx0XHR9XHJcblx0XHRpZiAoIXRoaXMuUkVTVGF1dGgpIHtcclxuXHRcdFx0Y3VzdG9tSGFuZGxlU2FzTG9nb24uY2FsbCh0aGlzLCB1c2VyLCBwYXNzLCByZXNvbHZlKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGN1c3RvbUhhbmRsZVJlc3RMb2dvbi5jYWxsKHRoaXMsIHVzZXIsIHBhc3MsIHJlc29sdmUpO1xyXG5cdFx0fVxyXG5cdH0pXHJcbn1cclxuXHJcbi8qKlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlciAtIFVzZXJuYW1lXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXNzIC0gUGFzc3dvcmRcclxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gc3VjY2Vzc2Z1bFxyXG4gKi9cclxuZnVuY3Rpb24gY3VzdG9tSGFuZGxlU2FzTG9nb24odXNlciwgcGFzcywgY2FsbGJhY2spIHtcclxuXHRjb25zdCBzZWxmID0gdGhpcztcclxuXHRsZXQgbG9naW5QYXJhbXMgPSB7XHJcblx0XHRfc2VydmljZTogJ2RlZmF1bHQnLFxyXG5cdFx0Ly9mb3IgU0FTIDkuNCxcclxuXHRcdHVzZXJuYW1lOiB1c2VyLFxyXG5cdFx0cGFzc3dvcmQ6IHBhc3NcclxuXHR9O1xyXG5cclxuXHRmb3IgKGxldCBrZXkgaW4gdGhpcy5fYWRpdGlvbmFsTG9naW5QYXJhbXMpIHtcclxuXHRcdGxvZ2luUGFyYW1zW2tleV0gPSB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtc1trZXldO1xyXG5cdH1cclxuXHJcblx0dGhpcy5fbG9naW5BdHRlbXB0cyA9IDA7XHJcblx0bG9naW5QYXJhbXMgPSB0aGlzLl9hamF4LnNlcmlhbGl6ZShsb2dpblBhcmFtcylcclxuXHJcblx0dGhpcy5fYWpheC5wb3N0KHRoaXMubG9naW5VcmwsIGxvZ2luUGFyYW1zKVxyXG5cdFx0LnN1Y2Nlc3MoaGFuZGxlU2FzTG9nb25TdWNjZXNzKVxyXG5cdFx0LmVycm9yKGhhbmRsZVNhc0xvZ29uRXJyb3IpO1xyXG5cclxuXHRmdW5jdGlvbiBoYW5kbGVTYXNMb2dvbkVycm9yKHJlcykge1xyXG5cdFx0aWYgKHJlcy5zdGF0dXMgPT0gNDQ5KSB7XHJcblx0XHRcdGhhbmRsZVNhc0xvZ29uU3VjY2VzcyhyZXMpO1xyXG5cdFx0XHQvLyByZXNvbHZlKHJlcy5zdGF0dXMpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcclxuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRmdW5jdGlvbiBoYW5kbGVTYXNMb2dvblN1Y2Nlc3MocmVzKSB7XHJcblx0XHRpZiAoKytzZWxmLl9sb2dpbkF0dGVtcHRzID09PSAzKSB7XHJcblx0XHRcdGNhbGxiYWNrKC0yKTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XHJcblx0XHRcdC8vd2UgYXJlIGdldHRpbmcgZm9ybSBhZ2FpbiBhZnRlciByZWRpcmVjdFxyXG5cdFx0XHQvL2FuZCBuZWVkIHRvIGxvZ2luIGFnYWluIHVzaW5nIHRoZSBuZXcgdXJsXHJcblx0XHRcdC8vX2xvZ2luQ2hhbmdlZCBpcyBzZXQgaW4gbmVlZFRvTG9naW4gZnVuY3Rpb25cclxuXHRcdFx0Ly9idXQgaWYgbG9naW4gdXJsIGlzIG5vdCBkaWZmZXJlbnQsIHdlIGFyZSBjaGVja2luZyBpZiB0aGVyZSBhcmUgYWRpdGlvbmFsIHBhcmFtZXRlcnNcclxuXHRcdFx0aWYgKHNlbGYuX2xvZ2luQ2hhbmdlZCB8fCAoc2VsZi5faXNOZXdMb2dpblBhZ2UgJiYgIXNlbGYuX2FkaXRpb25hbExvZ2luUGFyYW1zKSkge1xyXG5cdFx0XHRcdGRlbGV0ZSBzZWxmLl9sb2dpbkNoYW5nZWQ7XHJcblx0XHRcdFx0Y29uc3QgaW5wdXRzID0gcmVzLnJlc3BvbnNlVGV4dC5tYXRjaCgvPGlucHV0LipcImhpZGRlblwiW14+XSo+L2cpO1xyXG5cdFx0XHRcdGlmIChpbnB1dHMpIHtcclxuXHRcdFx0XHRcdGlucHV0cy5mb3JFYWNoKGZ1bmN0aW9uIChpbnB1dFN0cikge1xyXG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZU1hdGNoID0gaW5wdXRTdHIubWF0Y2goL25hbWU9XCIoW15cIl0qKVwiXFxzdmFsdWU9XCIoW15cIl0qKS8pO1xyXG5cdFx0XHRcdFx0XHRsb2dpblBhcmFtc1t2YWx1ZU1hdGNoWzFdXSA9IHZhbHVlTWF0Y2hbMl07XHJcblx0XHRcdFx0XHR9KTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0c2VsZi5fYWpheC5wb3N0KHNlbGYubG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uICgpIHtcclxuXHRcdFx0XHRcdGhhbmRsZVNhc0xvZ29uU3VjY2VzcygpXHJcblx0XHRcdFx0fSkuZXJyb3IoaGFuZGxlU2FzTG9nb25FcnJvcik7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0Ly9nZXR0aW5nIGZvcm0gYWdhaW4sIGJ1dCBpdCB3YXNuJ3QgYSByZWRpcmVjdFxyXG5cdFx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ1dyb25nIHVzZXJuYW1lIG9yIHBhc3N3b3JkJyk7XHJcblx0XHRcdFx0Y2FsbGJhY2soLTEpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0c2VsZi5fZGlzYWJsZUNhbGxzID0gZmFsc2U7XHJcblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xyXG5cdFx0XHR3aGlsZSAoc2VsZi5fY3VzdG9tUGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcclxuXHRcdFx0XHRjb25zdCBwZW5kaW5nQ2FsbCA9IHNlbGYuX2N1c3RvbVBlbmRpbmdDYWxscy5zaGlmdCgpXHJcblx0XHRcdFx0Y29uc3QgbWV0aG9kID0gcGVuZGluZ0NhbGwubWV0aG9kIHx8IHNlbGYubWFuYWdlZFJlcXVlc3QuYmluZChzZWxmKTtcclxuXHRcdFx0XHRjb25zdCBjYWxsTWV0aG9kID0gcGVuZGluZ0NhbGwuY2FsbE1ldGhvZFxyXG5cdFx0XHRcdGNvbnN0IF91cmwgPSBwZW5kaW5nQ2FsbC5fdXJsXHJcblx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHBlbmRpbmdDYWxsLm9wdGlvbnM7XHJcblx0XHRcdFx0Ly91cGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxyXG5cdFx0XHRcdGlmIChvcHRpb25zLnBhcmFtcykge1xyXG5cdFx0XHRcdFx0b3B0aW9ucy5wYXJhbXMuX2RlYnVnID0gc2VsZi5kZWJ1ZyA/IDEzMSA6IDA7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGlmIChzZWxmLnJldHJ5QWZ0ZXJMb2dpbikge1xyXG5cdFx0XHRcdFx0bWV0aG9kKGNhbGxNZXRob2QsIF91cmwsIG9wdGlvbnMpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0d2hpbGUgKHNlbGYuX3BlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XHJcblx0XHRcdFx0Y29uc3QgcGVuZGluZ0NhbGwgPSBzZWxmLl9wZW5kaW5nQ2FsbHMuc2hpZnQoKTtcclxuXHRcdFx0XHRjb25zdCBtZXRob2QgPSBwZW5kaW5nQ2FsbC5tZXRob2QgfHwgc2VsZi5jYWxsLmJpbmQoc2VsZik7XHJcblx0XHRcdFx0Y29uc3Qgc2FzUHJvZ3JhbSA9IHBlbmRpbmdDYWxsLm9wdGlvbnMuc2FzUHJvZ3JhbTtcclxuXHRcdFx0XHRjb25zdCBjYWxsYmFja1BlbmRpbmcgPSBwZW5kaW5nQ2FsbC5vcHRpb25zLmNhbGxiYWNrO1xyXG5cdFx0XHRcdGNvbnN0IHBhcmFtcyA9IHBlbmRpbmdDYWxsLnBhcmFtcztcclxuXHRcdFx0XHQvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXHJcblx0XHRcdFx0cGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xyXG5cdFx0XHRcdGlmIChzZWxmLnJldHJ5QWZ0ZXJMb2dpbikge1xyXG5cdFx0XHRcdFx0bWV0aG9kKHNhc1Byb2dyYW0sIG51bGwsIGNhbGxiYWNrUGVuZGluZywgcGFyYW1zKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9O1xyXG59XHJcblxyXG4vKipcclxuICogVG8gYmUgdXNlZCB3aXRoIGZ1dHVyZSBtYW5hZ2VkIG1ldGFkYXRhIGNhbGxzXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VyIC0gVXNlcm5hbWVcclxuICogQHBhcmFtIHtTdHJpbmd9IHBhc3MgLSBQYXNzd29yZFxyXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIHdoYXQgdG8gY2FsbCBhZnRlclxyXG4gKiBAcGFyYW0ge1N0cmluZ30gY2FsbGJhY2tVcmwgLSB3aGVyZSB0byBuYXZpZ2F0ZSBhZnRlciBnZXR0aW5nIHRpY2tldFxyXG4gKi9cclxuZnVuY3Rpb24gY3VzdG9tSGFuZGxlUmVzdExvZ29uKHVzZXIsIHBhc3MsIGNhbGxiYWNrLCBjYWxsYmFja1VybCkge1xyXG5cdGNvbnN0IHNlbGYgPSB0aGlzO1xyXG5cclxuXHRjb25zdCBsb2dpblBhcmFtcyA9IHtcclxuXHRcdHVzZXJuYW1lOiB1c2VyLFxyXG5cdFx0cGFzc3dvcmQ6IHBhc3NcclxuXHR9O1xyXG5cclxuXHR0aGlzLl9hamF4LnBvc3QodGhpcy5SRVNUYXV0aExvZ2luVXJsLCBsb2dpblBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XHJcblx0XHRjb25zdCBsb2NhdGlvbiA9IHJlcy5nZXRSZXNwb25zZUhlYWRlcignTG9jYXRpb24nKTtcclxuXHJcblx0XHRzZWxmLl9hamF4LnBvc3QobG9jYXRpb24sIHtcclxuXHRcdFx0c2VydmljZTogY2FsbGJhY2tVcmxcclxuXHRcdH0pLnN1Y2Nlc3MoZnVuY3Rpb24gKHJlcykge1xyXG5cdFx0XHRpZiAoY2FsbGJhY2tVcmwuaW5kZXhPZignPycpID09PSAtMSkge1xyXG5cdFx0XHRcdGNhbGxiYWNrVXJsICs9ICc/dGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0O1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdGlmIChjYWxsYmFja1VybC5pbmRleE9mKCd0aWNrZXQnKSAhPT0gLTEpIHtcclxuXHRcdFx0XHRcdGNhbGxiYWNrVXJsID0gY2FsbGJhY2tVcmwucmVwbGFjZSgvdGlja2V0PVteJl0rLywgJ3RpY2tldD0nICsgcmVzLnJlc3BvbnNlVGV4dCk7XHJcblx0XHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRcdGNhbGxiYWNrVXJsICs9ICcmdGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0O1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XHJcblx0XHR9KS5lcnJvcihmdW5jdGlvbiAocmVzKSB7XHJcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XHJcblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xyXG5cdFx0fSk7XHJcblx0fSkuZXJyb3IoZnVuY3Rpb24gKHJlcykge1xyXG5cdFx0aWYgKHJlcy5yZXNwb25zZVRleHQgPT09ICdlcnJvci5hdXRoZW50aWNhdGlvbi5jcmVkZW50aWFscy5iYWQnKSB7XHJcblx0XHRcdGNhbGxiYWNrKC0xKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XHJcblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xyXG5cdFx0fVxyXG5cdH0pO1xyXG59XHJcblxyXG5cclxuLy8gVXRpbGlsaXR5IGZ1bmN0aW9ucyBmb3IgaGFuZGxpbmcgZmlsZXMgYW5kIGZvbGRlcnMgb24gVklZQVxyXG4vKipcclxuICogUmV0dXJucyB0aGUgZGV0YWlscyBvZiBhIGZvbGRlciBmcm9tIGZvbGRlciBzZXJ2aWNlXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmb2xkZXJOYW1lIC0gRnVsbCBwYXRoIG9mIGZvbGRlciB0byBiZSBmb3VuZFxyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxyXG4gKi9cclxubW9kdWxlLmV4cG9ydHMuZ2V0Rm9sZGVyRGV0YWlscyA9IGZ1bmN0aW9uIChmb2xkZXJOYW1lLCBvcHRpb25zKSB7XHJcblx0Ly8gRmlyc3QgY2FsbCB0byBnZXQgZm9sZGVyJ3MgaWRcclxuXHRsZXQgdXJsID0gXCIvZm9sZGVycy9mb2xkZXJzL0BpdGVtP3BhdGg9XCIgKyBmb2xkZXJOYW1lXHJcblx0cmV0dXJuIHRoaXMubWFuYWdlZFJlcXVlc3QoJ2dldCcsIHVybCwgb3B0aW9ucyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBkZXRhaWxzIG9mIGEgZmlsZSBmcm9tIGZpbGVzIHNlcnZpY2VcclxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVVcmkgLSBGdWxsIHBhdGggb2YgZmlsZSB0byBiZSBmb3VuZFxyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdDogY2FjaGVCdXN0IGZvcmNlcyBicm93c2VyIHRvIGZldGNoIG5ldyBmaWxlXHJcbiAqL1xyXG5tb2R1bGUuZXhwb3J0cy5nZXRGaWxlRGV0YWlscyA9IGZ1bmN0aW9uIChmaWxlVXJpLCBvcHRpb25zKSB7XHJcblx0Y29uc3QgY2FjaGVCdXN0ID0gb3B0aW9ucy5jYWNoZUJ1c3RcclxuXHRpZiAoY2FjaGVCdXN0KSB7XHJcblx0XHRmaWxlVXJpICs9ICc/Y2FjaGVCdXN0PScgKyBuZXcgRGF0ZSgpLmdldFRpbWUoKVxyXG5cdH1cclxuXHRyZXR1cm4gdGhpcy5tYW5hZ2VkUmVxdWVzdCgnZ2V0JywgZmlsZVVyaSwgb3B0aW9ucyk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIHRoZSBjb250ZW50cyBvZiBhIGZpbGUgZnJvbSBmaWxlcyBzZXJ2aWNlXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlVXJpIC0gRnVsbCBwYXRoIG9mIGZpbGUgdG8gYmUgZG93bmxvYWRlZFxyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdDogY2FjaGVCdXN0IGZvcmNlcyBicm93c2VyIHRvIGZldGNoIG5ldyBmaWxlXHJcbiAqL1xyXG5tb2R1bGUuZXhwb3J0cy5nZXRGaWxlQ29udGVudCA9IGZ1bmN0aW9uIChmaWxlVXJpLCBvcHRpb25zKSB7XHJcblx0Y29uc3QgY2FjaGVCdXN0ID0gb3B0aW9ucy5jYWNoZUJ1c3RcclxuXHRsZXQgdXJpID0gZmlsZVVyaSArICcvY29udGVudCdcclxuXHRpZiAoY2FjaGVCdXN0KSB7XHJcblx0XHR1cmkgKz0gJz9jYWNoZUJ1c3Q9JyArIG5ldyBEYXRlKCkuZ2V0VGltZSgpXHJcblx0fVxyXG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdnZXQnLCB1cmksIG9wdGlvbnMpO1xyXG59XHJcblxyXG5cclxuLy8gVXRpbCBmdW5jdGlvbnMgZm9yIHdvcmtpbmcgd2l0aCBmaWxlcyBhbmQgZm9sZGVyc1xyXG4vKipcclxuICogUmV0dXJucyBkZXRhaWxzIGFib3V0IGZvbGRlciBpdCBzZWxmIGFuZCBpdCdzIG1lbWJlcnMgd2l0aCBkZXRhaWxzXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmb2xkZXJOYW1lIC0gRnVsbCBwYXRoIG9mIGZvbGRlciB0byBiZSBmb3VuZFxyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxyXG4gKi9cclxubW9kdWxlLmV4cG9ydHMuZ2V0Rm9sZGVyQ29udGVudHMgPSBhc3luYyBmdW5jdGlvbiAoZm9sZGVyTmFtZSwgb3B0aW9ucykge1xyXG5cdGNvbnN0IHNlbGYgPSB0aGlzXHJcblx0Y29uc3Qge2NhbGxiYWNrfSA9IG9wdGlvbnNcclxuXHJcblx0Ly8gU2Vjb25kIGNhbGwgdG8gZ2V0IGZvbGRlcidzIG1lbWViZXJzXHJcblx0Y29uc3QgX2NhbGxiYWNrID0gKGVyciwgZGF0YSkgPT4ge1xyXG5cdFx0Ly8gaGFuZGxlIGVycm9yIG9mIHRoZSBmaXJzdCBjYWxsXHJcblx0XHRpZihlcnIpIHtcclxuXHRcdFx0Y2FsbGJhY2soZXJyLCBkYXRhKVxyXG5cdFx0XHRyZXR1cm5cclxuXHRcdH1cclxuXHRcdGxldCBpZCA9IGRhdGEuYm9keS5pZFxyXG5cdFx0bGV0IG1lbWJlcnNVcmwgPSAnL2ZvbGRlcnMvZm9sZGVycy8nICsgaWQgKyAnL21lbWJlcnMnICsgJy8/bGltaXQ9MTAwMDAwMDAnO1xyXG5cdFx0cmV0dXJuIHNlbGYubWFuYWdlZFJlcXVlc3QoJ2dldCcsIG1lbWJlcnNVcmwsIHtjYWxsYmFja30pXHJcblx0fVxyXG5cclxuXHQvLyBGaXJzdCBjYWxsIHRvIGdldCBmb2xkZXIncyBpZFxyXG5cdGxldCB1cmwgPSBcIi9mb2xkZXJzL2ZvbGRlcnMvQGl0ZW0/cGF0aD1cIiArIGZvbGRlck5hbWVcclxuXHRjb25zdCBvcHRpb25zT2JqID0gT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge1xyXG5cdFx0Y2FsbGJhY2s6IF9jYWxsYmFja1xyXG5cdH0pXHJcblx0dGhpcy5tYW5hZ2VkUmVxdWVzdCgnZ2V0JywgdXJsLCBvcHRpb25zT2JqKVxyXG59XHJcblxyXG4vKipcclxuICogQ3JlYXRlcyBhIGZvbGRlclxyXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFyZW50VXJpIC0gVGhlIHVyaSBvZiB0aGUgZm9sZGVyIHdoZXJlIHRoZSBuZXcgY2hpbGQgaXMgYmVpbmcgY3JlYXRlZFxyXG4gKiBAcGFyYW0ge1N0cmluZ30gZm9sZGVyTmFtZSAtIEZ1bGwgcGF0aCBvZiBmb2xkZXIgdG8gYmUgZm91bmRcclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcclxuICovXHJcbm1vZHVsZS5leHBvcnRzLmNyZWF0ZU5ld0ZvbGRlciA9IGZ1bmN0aW9uIChwYXJlbnRVcmksIGZvbGRlck5hbWUsIG9wdGlvbnMpIHtcclxuXHRjb25zdCBoZWFkZXJzID0ge1xyXG5cdFx0J0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uLCB0ZXh0L2phdmFzY3JpcHQsICovKjsgcT0wLjAxJyxcclxuXHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXHJcblx0fVxyXG5cclxuXHRjb25zdCB1cmwgPSAnL2ZvbGRlcnMvZm9sZGVycz9wYXJlbnRGb2xkZXJVcmk9JyArIHBhcmVudFVyaTtcclxuXHRjb25zdCBkYXRhID0ge1xyXG5cdFx0J25hbWUnOiBmb2xkZXJOYW1lLFxyXG5cdFx0J3R5cGUnOiBcImZvbGRlclwiXHJcblx0fVxyXG5cclxuXHRjb25zdCBvcHRpb25zT2JqID0gT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge1xyXG5cdFx0cGFyYW1zOiBKU09OLnN0cmluZ2lmeShkYXRhKSxcclxuXHRcdGhlYWRlcnMsXHJcblx0XHR1c2VNdWx0aXBhcnRGb3JtRGF0YTogZmFsc2VcclxuXHR9KVxyXG5cclxuXHRyZXR1cm4gdGhpcy5tYW5hZ2VkUmVxdWVzdCgncG9zdCcsIHVybCwgb3B0aW9uc09iaik7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBEZWxldGVzIGEgZm9sZGVyXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmb2xkZXJJZCAtIEZ1bGwgVVJJIG9mIGZvbGRlciB0byBiZSBkZWxldGVkXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XHJcbiAqL1xyXG5tb2R1bGUuZXhwb3J0cy5kZWxldGVGb2xkZXJCeUlkID0gZnVuY3Rpb24gKGZvbGRlcklkLCBvcHRpb25zKSB7XHJcblx0Y29uc3QgdXJsID0gJy9mb2xkZXJzL2ZvbGRlcnMvJyArIGZvbGRlcklkO1xyXG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdkZWxldGUnLCB1cmwsIG9wdGlvbnMpXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhdGVzIGEgbmV3IGZpbGVcclxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVOYW1lIC0gTmFtZSBvZiB0aGUgZmlsZSBiZWluZyBjcmVhdGVkXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlQmxvYiAtIENvbnRlbnQgb2YgdGhlIGZpbGVcclxuICogQHBhcmFtIHtTdHJpbmd9IHBhcmVudEZPbGRlclVyaSAtIFVSSSBvZiB0aGUgcGFyZW50IGZvbGRlciB3aGVyZSB0aGUgZmlsZSBpcyB0byBiZSBjcmVhdGVkXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XHJcbiAqL1xyXG5tb2R1bGUuZXhwb3J0cy5jcmVhdGVOZXdGaWxlID0gZnVuY3Rpb24gKGZpbGVOYW1lLCBmaWxlQmxvYiwgcGFyZW50Rm9sZGVyVXJpLCBvcHRpb25zKSB7XHJcblx0bGV0IHVybCA9IFwiL2ZpbGVzL2ZpbGVzI211bHRpcGFydFVwbG9hZFwiO1xyXG5cdGxldCBkYXRhT2JqID0ge1xyXG5cdFx0ZmlsZTogW2ZpbGVCbG9iLCBmaWxlTmFtZV0sXHJcblx0XHRwYXJlbnRGb2xkZXJVcmlcclxuXHR9XHJcblxyXG5cdGNvbnN0IG9wdGlvbnNPYmogPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7XHJcblx0XHRwYXJhbXM6IGRhdGFPYmosXHJcblx0XHR1c2VNdWx0aXBhcnRGb3JtRGF0YTogdHJ1ZSxcclxuXHR9KVxyXG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdwb3N0JywgdXJsLCBvcHRpb25zT2JqKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEdlbmVyaWMgZGVsZXRlIGZ1bmN0aW9uIHRoYXQgZGVsZXRlcyBieSBVUklcclxuICogQHBhcmFtIHtTdHJpbmd9IGl0ZW1VcmkgLSBOYW1lIG9mIHRoZSBpdGVtIGJlaW5nIGRlbGV0ZWRcclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcclxuICovXHJcbm1vZHVsZS5leHBvcnRzLmRlbGV0ZUl0ZW0gPSBmdW5jdGlvbiAoaXRlbVVyaSwgb3B0aW9ucykge1xyXG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdkZWxldGUnLCBpdGVtVXJpLCBvcHRpb25zKVxyXG59XHJcblxyXG5cclxuLyoqXHJcbiAqIFVwZGF0ZXMgY29udGVudHMgb2YgYSBmaWxlXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlTmFtZSAtIE5hbWUgb2YgdGhlIGZpbGUgYmVpbmcgdXBkYXRlZFxyXG4gKiBAcGFyYW0ge09iamVjdCB8IEJsb2J9IGRhdGFPYmogLSBOZXcgY29udGVudCBvZiB0aGUgZmlsZSAoT2JqZWN0IG11c3QgY29udGFpbiBmaWxlIGtleSlcclxuICogT2JqZWN0IGV4YW1wbGUge1xyXG4gKiAgIGZpbGU6IFs8YmxvYj4sIDxmaWxlTmFtZT5dXHJcbiAqIH1cclxuICogQHBhcmFtIHtTdHJpbmd9IGxhc3RNb2RpZmllZCAtIHRoZSBsYXN0LW1vZGlmaWVkIGhlYWRlciBzdHJpbmcgdGhhdCBtYXRjaGVzIHRoYXQgb2YgZmlsZSBiZWluZyBvdmVyd3JpdHRlblxyXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxyXG4gKi9cclxubW9kdWxlLmV4cG9ydHMudXBkYXRlRmlsZSA9IGZ1bmN0aW9uIChpdGVtVXJpLCBkYXRhT2JqLCBsYXN0TW9kaWZpZWQsIG9wdGlvbnMpIHtcclxuXHRjb25zdCB1cmwgPSBpdGVtVXJpICsgJy9jb250ZW50J1xyXG5cdGNvbnNvbGUubG9nKCdVUkwnLCB1cmwpXHJcblx0bGV0IGhlYWRlcnMgPSB7XHJcblx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3ZuZC5zYXMuZmlsZScsXHJcblx0XHQnSWYtVW5tb2RpZmllZC1TaW5jZSc6IGxhc3RNb2RpZmllZFxyXG5cdH1cclxuXHRjb25zdCBpc0Jsb2IgPSBkYXRhT2JqIGluc3RhbmNlb2YgQmxvYlxyXG5cdGNvbnN0IHVzZU11bHRpcGFydEZvcm1EYXRhID0gIWlzQmxvYiAvLyBzZXQgdXNlTXVsdGlwYXJ0Rm9ybURhdGEgdG8gdHJ1ZSBpZiBkYXRhT2JqIGlzIG5vdCBCbG9iXHJcblxyXG5cdGNvbnN0IG9wdGlvbnNPYmogPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7XHJcblx0XHRwYXJhbXM6IGRhdGFPYmosXHJcblx0XHRoZWFkZXJzLFxyXG5cdFx0dXNlTXVsdGlwYXJ0Rm9ybURhdGFcclxuXHR9KVxyXG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdwdXQnLCB1cmwsIG9wdGlvbnNPYmopO1xyXG59XHJcbiIsImNvbnN0IGxvZ3MgPSByZXF1aXJlKCcuLi9sb2dzLmpzJyk7XHJcbmNvbnN0IGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XHJcblxyXG5jb25zdCBwcm9ncmFtTm90Rm91bmRQYXR0ID0gLzx0aXRsZT4oU3RvcmVkIFByb2Nlc3MgRXJyb3J8U0FTU3RvcmVkUHJvY2Vzcyk8XFwvdGl0bGU+W1xcc1xcU10qPGgyPihTdG9yZWQgcHJvY2VzcyBub3QgZm91bmQ6Lip8Lipub3QgYSB2YWxpZCBzdG9yZWQgcHJvY2VzcyBwYXRoLik8XFwvaDI+LztcclxuY29uc3QgYmFkSm9iRGVmaW5pdGlvbiA9IFwiPGgyPlBhcmFtZXRlciBFcnJvciA8YnIvPlVuYWJsZSB0byBnZXQgam9iIGRlZmluaXRpb24uPC9oMj5cIjtcclxuXHJcbmNvbnN0IHJlc3BvbnNlUmVwbGFjZSA9IGZ1bmN0aW9uKHJlcykge1xyXG4gIHJldHVybiByZXNcclxufTtcclxuXHJcbi8qKlxyXG4qIFBhcnNlIHJlc3BvbnNlIGZyb20gc2VydmVyXHJcbipcclxuKiBAcGFyYW0ge29iamVjdH0gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcclxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxyXG4qXHJcbiovXHJcbm1vZHVsZS5leHBvcnRzLnBhcnNlUmVzID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcclxuICBjb25zdCBtYXRjaGVzID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHByb2dyYW1Ob3RGb3VuZFBhdHQpO1xyXG4gIGlmKG1hdGNoZXMpIHtcclxuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1Ob3RGb3VuZCcsICdZb3UgaGF2ZSBub3QgYmVlbiBncmFudGVkIHBlcm1pc3Npb24gdG8gcGVyZm9ybSB0aGlzIGFjdGlvbiwgb3IgdGhlIFNUUCBpcyBtaXNzaW5nLicpO1xyXG4gIH1cclxuICAvL3JlbW92ZSBuZXcgbGluZXMgaW4ganNvbiByZXNwb25zZVxyXG4gIC8vcmVwbGFjZSBcXFxcKGQpIHdpdGggXFwoZCkgLSBTQVMganNvbiBwYXJzZXIgaXMgZXNjYXBpbmcgaXRcclxuICByZXR1cm4gSlNPTi5wYXJzZShyZXNwb25zZVJlcGxhY2UocmVzcG9uc2VUZXh0KSk7XHJcbn07XHJcblxyXG4vKipcclxuKiBQYXJzZSByZXNwb25zZSBmcm9tIHNlcnZlciBpbiBkZWJ1ZyBtb2RlXHJcbipcclxuKiBAcGFyYW0ge29iamVjdH0gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcclxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxyXG4qIEBwYXJhbSB7c3RyaW5nfSBob3N0VXJsIC0gc2FtZSBhcyBpbiBoNTRzIGNvbnN0cnVjdG9yXHJcbiogQHBhcmFtIHtib29sfSBpc1ZpeWEgLSBzYW1lIGFzIGluIGg1NHMgY29uc3RydWN0b3JcclxuKlxyXG4qL1xyXG5tb2R1bGUuZXhwb3J0cy5wYXJzZURlYnVnUmVzID0gZnVuY3Rpb24gKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zLCBob3N0VXJsLCBpc1ZpeWEpIHtcclxuXHRjb25zdCBzZWxmID0gdGhpc1xyXG5cdGxldCBtYXRjaGVzID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHByb2dyYW1Ob3RGb3VuZFBhdHQpO1xyXG5cdGlmIChtYXRjaGVzKSB7XHJcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtTm90Rm91bmQnLCAnU2FzIHByb2dyYW0gY29tcGxldGVkIHdpdGggZXJyb3JzJyk7XHJcblx0fVxyXG5cclxuXHRpZiAoaXNWaXlhKSB7XHJcblx0XHRjb25zdCBtYXRjaGVzV3JvbmdKb2IgPSByZXNwb25zZVRleHQubWF0Y2goYmFkSm9iRGVmaW5pdGlvbik7XHJcblx0XHRpZiAobWF0Y2hlc1dyb25nSm9iKSB7XHJcblx0XHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1Ob3RGb3VuZCcsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMuIFVuYWJsZSB0byBnZXQgam9iIGRlZmluaXRpb24uJyk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHQvL2ZpbmQganNvblxyXG5cdGxldCBwYXR0ID0gaXNWaXlhID8gL14oLj88aWZyYW1lLipzcmM9XCIpKFteXCJdKykoLippZnJhbWU+KS9tIDogL14oLj8tLWg1NHMtZGF0YS1zdGFydC0tKShbXFxTXFxzXSo/KSgtLWg1NHMtZGF0YS1lbmQtLSkvbTtcclxuXHRtYXRjaGVzID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHBhdHQpO1xyXG5cclxuXHRjb25zdCBwYWdlID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UocGF0dCwgJycpO1xyXG5cdGNvbnN0IGh0bWxCb2R5UGF0dCA9IC88Ym9keS4qPihbXFxzXFxTXSopPFxcL2JvZHk+LztcclxuXHRjb25zdCBib2R5TWF0Y2hlcyA9IHBhZ2UubWF0Y2goaHRtbEJvZHlQYXR0KTtcclxuXHQvL3JlbW92ZSBodG1sIHRhZ3NcclxuXHRsZXQgZGVidWdUZXh0ID0gYm9keU1hdGNoZXNbMV0ucmVwbGFjZSgvPFtePl0qPi9nLCAnJyk7XHJcblx0ZGVidWdUZXh0ID0gdGhpcy5kZWNvZGVIVE1MRW50aXRpZXMoZGVidWdUZXh0KTtcclxuXHJcblx0bG9ncy5hZGREZWJ1Z0RhdGEoYm9keU1hdGNoZXNbMV0sIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKTtcclxuXHJcbiAgaWYgKGlzVml5YSAmJiB0aGlzLnBhcnNlRXJyb3JSZXNwb25zZShyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pKSB7XHJcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdzYXNFcnJvcicsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKTtcclxuXHR9XHJcblx0aWYgKCFtYXRjaGVzKSB7XHJcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJyk7XHJcblx0fVxyXG5cclxuXHJcblx0Y29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcclxuXHRcdGxldCBqc29uT2JqXHJcblx0XHRpZiAoaXNWaXlhKSB7XHJcblx0XHRcdGNvbnN0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xyXG5cdFx0XHRjb25zdCBiYXNlVXJsID0gaG9zdFVybCB8fCBcIlwiO1xyXG5cdFx0XHR4aHIub3BlbihcIkdFVFwiLCBiYXNlVXJsICsgbWF0Y2hlc1syXSk7XHJcblx0XHRcdHhoci5vbmxvYWQgPSBmdW5jdGlvbiAoKSB7XHJcblx0XHRcdFx0aWYgKHRoaXMuc3RhdHVzID49IDIwMCAmJiB0aGlzLnN0YXR1cyA8IDMwMCkge1xyXG5cdFx0XHRcdFx0cmVzb2x2ZShKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQucmVwbGFjZSgvKFxcclxcbnxcXHJ8XFxuKS9nLCAnJykpKTtcclxuXHRcdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdFx0cmVqZWN0KG5ldyBoNTRzRXJyb3IoJ2ZldGNoRXJyb3InLCB4aHIuc3RhdHVzVGV4dCwgdGhpcy5zdGF0dXMpKVxyXG5cdFx0XHRcdH1cclxuXHRcdFx0fTtcclxuXHRcdFx0eGhyLm9uZXJyb3IgPSBmdW5jdGlvbiAoKSB7XHJcblx0XHRcdFx0cmVqZWN0KG5ldyBoNTRzRXJyb3IoJ2ZldGNoRXJyb3InLCB4aHIuc3RhdHVzVGV4dCkpXHJcblx0XHRcdH07XHJcblx0XHRcdHhoci5zZW5kKCk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0cnkge1xyXG5cdFx0XHRcdGpzb25PYmogPSBKU09OLnBhcnNlKHJlc3BvbnNlUmVwbGFjZShtYXRjaGVzWzJdKSk7XHJcblx0XHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0XHRyZWplY3QobmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpKVxyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRpZiAoanNvbk9iaiAmJiBqc29uT2JqLmg1NHNBYm9ydCkge1xyXG5cdFx0XHRcdHJlc29sdmUoanNvbk9iaik7XHJcblx0XHRcdH0gZWxzZSBpZiAoc2VsZi5wYXJzZUVycm9yUmVzcG9uc2UocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKSkge1xyXG5cdFx0XHRcdHJlamVjdChuZXcgaDU0c0Vycm9yKCdzYXNFcnJvcicsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKSlcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRyZXNvbHZlKGpzb25PYmopO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSk7XHJcblxyXG5cdHJldHVybiBwcm9taXNlO1xyXG59O1xyXG5cclxuLyoqXHJcbiogQWRkIGZhaWxlZCByZXNwb25zZSB0byBsb2dzIC0gdXNlZCBvbmx5IGlmIGRlYnVnPWZhbHNlXHJcbipcclxuKiBAcGFyYW0ge3N0cmluZ30gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcclxuKlxyXG4qL1xyXG5tb2R1bGUuZXhwb3J0cy5hZGRGYWlsZWRSZXNwb25zZSA9IGZ1bmN0aW9uKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSkge1xyXG4gIGNvbnN0IHBhdHQgICAgICA9IC88c2NyaXB0KFtcXHNcXFNdKilcXC9mb3JtPi87XHJcbiAgY29uc3QgcGF0dDIgICAgID0gL2Rpc3BsYXlcXHM/Olxccz9ub25lOz9cXHM/LztcclxuICAvL3JlbW92ZSBzY3JpcHQgd2l0aCBmb3JtIGZvciB0b2dnbGluZyB0aGUgbG9ncyBhbmQgXCJkaXNwbGF5Om5vbmVcIiBmcm9tIHN0eWxlXHJcbiAgcmVzcG9uc2VUZXh0ICA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKHBhdHQsICcnKS5yZXBsYWNlKHBhdHQyLCAnJyk7XHJcbiAgbGV0IGRlYnVnVGV4dCA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKC88W14+XSo+L2csICcnKTtcclxuICBkZWJ1Z1RleHQgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhkZWJ1Z1RleHQpO1xyXG5cclxuICBsb2dzLmFkZEZhaWxlZFJlcXVlc3QocmVzcG9uc2VUZXh0LCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0pO1xyXG59O1xyXG5cclxuLyoqXHJcbiogVW5lc2NhcGUgYWxsIHN0cmluZyB2YWx1ZXMgaW4gcmV0dXJuZWQgb2JqZWN0XHJcbipcclxuKiBAcGFyYW0ge29iamVjdH0gb2JqXHJcbipcclxuKi9cclxubW9kdWxlLmV4cG9ydHMudW5lc2NhcGVWYWx1ZXMgPSBmdW5jdGlvbihvYmopIHtcclxuICBmb3IgKGxldCBrZXkgaW4gb2JqKSB7XHJcbiAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnc3RyaW5nJykge1xyXG4gICAgICBvYmpba2V5XSA9IGRlY29kZVVSSUNvbXBvbmVudChvYmpba2V5XSk7XHJcbiAgICB9IGVsc2UgaWYodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgdGhpcy51bmVzY2FwZVZhbHVlcyhvYmpba2V5XSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHJldHVybiBvYmo7XHJcbn07XHJcblxyXG4vKipcclxuKiBQYXJzZSBlcnJvciByZXNwb25zZSBmcm9tIHNlcnZlciBhbmQgc2F2ZSBlcnJvcnMgaW4gbWVtb3J5XHJcbipcclxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXHJcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSB3aGljaCByZXR1cm5lZCB0aGUgcmVzcG9uc2VcclxuKlxyXG4qL1xyXG5tb2R1bGUuZXhwb3J0cy5wYXJzZUVycm9yUmVzcG9uc2UgPSBmdW5jdGlvbihyZXMsIHNhc1Byb2dyYW0pIHtcclxuICAvL2NhcHR1cmUgJ0VSUk9SOiBbdGV4dF0uJyBvciAnRVJST1IgeHggW3RleHRdLidcclxuICBjb25zdCBwYXR0ICAgID0gL15FUlJPUig6XFxzfFxcc1xcZFxcZCkoLipcXC58LipcXG4uKlxcLikvZ207XHJcbiAgbGV0IGVycm9ycyAgPSByZXMucmVwbGFjZSgvKDwoW14+XSspPikvaWcsICcnKS5tYXRjaChwYXR0KTtcclxuICBpZighZXJyb3JzKSB7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBsZXQgZXJyTWVzc2FnZTtcclxuICBmb3IobGV0IGkgPSAwLCBuID0gZXJyb3JzLmxlbmd0aDsgaSA8IG47IGkrKykge1xyXG4gICAgZXJyTWVzc2FnZSAgPSBlcnJvcnNbaV0ucmVwbGFjZSgvPFtePl0qPi9nLCAnJykucmVwbGFjZSgvKFxcbnxcXHN7Mix9KS9nLCAnICcpO1xyXG4gICAgZXJyTWVzc2FnZSAgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhlcnJNZXNzYWdlKTtcclxuICAgIGVycm9yc1tpXSAgID0ge1xyXG4gICAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxyXG4gICAgICBtZXNzYWdlOiAgICBlcnJNZXNzYWdlLFxyXG4gICAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgbG9ncy5hZGRTYXNFcnJvcnMoZXJyb3JzKTtcclxuXHJcbiAgcmV0dXJuIHRydWU7XHJcbn07XHJcblxyXG4vKipcclxuKiBEZWNvZGUgSFRNTCBlbnRpdGllcyAtIG9sZCB1dGlsaXR5IGZ1bmN0aW9uXHJcbipcclxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXHJcbipcclxuKi9cclxubW9kdWxlLmV4cG9ydHMuZGVjb2RlSFRNTEVudGl0aWVzID0gZnVuY3Rpb24gKGh0bWwpIHtcclxuICBjb25zdCB0ZW1wRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICBsZXQgc3RyXHQ9IGh0bWwucmVwbGFjZSgvJigjKD86eFswLTlhLWZdK3xcXGQrKXxbYS16XSspOy9naSxcclxuICAgIGZ1bmN0aW9uIChzdHIpIHtcclxuICAgICAgdGVtcEVsZW1lbnQuaW5uZXJIVE1MID0gc3RyO1xyXG4gICAgICBzdHIgPSB0ZW1wRWxlbWVudC50ZXh0Q29udGVudCB8fCB0ZW1wRWxlbWVudC5pbm5lclRleHQ7XHJcbiAgICAgIHJldHVybiBzdHI7XHJcbiAgICB9XHJcbiAgKTtcclxuICByZXR1cm4gc3RyO1xyXG59O1xyXG5cclxuLyoqXHJcbiogQ29udmVydCBzYXMgdGltZSB0byBqYXZhc2NyaXB0IGRhdGVcclxuKlxyXG4qIEBwYXJhbSB7bnVtYmVyfSBzYXNEYXRlIC0gc2FzIFRhdGUgb2JqZWN0XHJcbipcclxuKi9cclxubW9kdWxlLmV4cG9ydHMuZnJvbVNhc0RhdGVUaW1lID0gZnVuY3Rpb24gKHNhc0RhdGUpIHtcclxuICBjb25zdCBiYXNlZGF0ZSA9IG5ldyBEYXRlKFwiSmFudWFyeSAxLCAxOTYwIDAwOjAwOjAwXCIpO1xyXG4gIGNvbnN0IGN1cnJkYXRlID0gc2FzRGF0ZTtcclxuXHJcbiAgLy8gb2Zmc2V0cyBmb3IgVVRDIGFuZCB0aW1lem9uZXMgYW5kIEJTVFxyXG4gIGNvbnN0IGJhc2VPZmZzZXQgPSBiYXNlZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXHJcblxyXG4gIC8vIGNvbnZlcnQgc2FzIGRhdGV0aW1lIHRvIGEgY3VycmVudCB2YWxpZCBqYXZhc2NyaXB0IGRhdGVcclxuICBjb25zdCBiYXNlZGF0ZU1zICA9IGJhc2VkYXRlLmdldFRpbWUoKTsgLy8gaW4gbXNcclxuICBjb25zdCBjdXJyZGF0ZU1zICA9IGN1cnJkYXRlICogMTAwMDsgLy8gdG8gbXNcclxuICBjb25zdCBzYXNEYXRldGltZSA9IGN1cnJkYXRlTXMgKyBiYXNlZGF0ZU1zO1xyXG4gIGNvbnN0IGpzRGF0ZSAgICAgID0gbmV3IERhdGUoKTtcclxuICBqc0RhdGUuc2V0VGltZShzYXNEYXRldGltZSk7IC8vIGZpcnN0IHRpbWUgdG8gZ2V0IG9mZnNldCBCU1QgZGF5bGlnaHQgc2F2aW5ncyBldGNcclxuICBjb25zdCBjdXJyT2Zmc2V0ICA9IGpzRGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBhZGp1c3QgZm9yIG9mZnNldCBpbiBtaW51dGVzXHJcbiAgY29uc3Qgb2Zmc2V0VmFyICAgPSAoYmFzZU9mZnNldCAtIGN1cnJPZmZzZXQpICogNjAgKiAxMDAwOyAvLyBkaWZmZXJlbmNlIGluIG1pbGxpc2Vjb25kc1xyXG4gIGNvbnN0IG9mZnNldFRpbWUgID0gc2FzRGF0ZXRpbWUgLSBvZmZzZXRWYXI7IC8vIGZpbmRpbmcgQlNUIGFuZCBkYXlsaWdodCBzYXZpbmdzXHJcbiAganNEYXRlLnNldFRpbWUob2Zmc2V0VGltZSk7IC8vIHVwZGF0ZSB3aXRoIG9mZnNldFxyXG4gIHJldHVybiBqc0RhdGU7XHJcbn07XHJcblxyXG4vKipcclxuICogQ2hlY2tzIHdoZXRoZXIgcmVzcG9uc2Ugb2JqZWN0IGlzIGEgbG9naW4gcmVkaXJlY3RcclxuICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlT2JqIHhociByZXNwb25zZSB0byBiZSBjaGVja2VkIGZvciBsb2dvbiByZWRpcmVjdFxyXG4gKi9cclxubW9kdWxlLmV4cG9ydHMubmVlZFRvTG9naW4gPSBmdW5jdGlvbihyZXNwb25zZU9iaikge1xyXG5cdGNvbnN0IGlzU0FTTG9nb24gPSByZXNwb25zZU9iai5yZXNwb25zZVVSTCAmJiByZXNwb25zZU9iai5yZXNwb25zZVVSTC5pbmNsdWRlcygnU0FTTG9nb24nKVxyXG5cdGlmIChpc1NBU0xvZ29uID09PSBmYWxzZSkge1xyXG5cdFx0cmV0dXJuIGZhbHNlXHJcblx0fVxyXG5cclxuICBjb25zdCBwYXR0ID0gLzxmb3JtLithY3Rpb249XCIoLipMb2dvblteXCJdKikuKj4vO1xyXG4gIGNvbnN0IG1hdGNoZXMgPSBwYXR0LmV4ZWMocmVzcG9uc2VPYmoucmVzcG9uc2VUZXh0KTtcclxuICBsZXQgbmV3TG9naW5Vcmw7XHJcblxyXG4gIGlmKCFtYXRjaGVzKSB7XHJcbiAgICAvL3RoZXJlJ3Mgbm8gZm9ybSwgd2UgYXJlIGluLiBob29yYXkhXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnN0IGFjdGlvblVybCA9IG1hdGNoZXNbMV0ucmVwbGFjZSgvXFw/LiovLCAnJyk7XHJcbiAgICBpZihhY3Rpb25VcmwuY2hhckF0KDApID09PSAnLycpIHtcclxuICAgICAgbmV3TG9naW5VcmwgPSB0aGlzLmhvc3RVcmwgPyB0aGlzLmhvc3RVcmwgKyBhY3Rpb25VcmwgOiBhY3Rpb25Vcmw7XHJcbiAgICAgIGlmKG5ld0xvZ2luVXJsICE9PSB0aGlzLmxvZ2luVXJsKSB7XHJcbiAgICAgICAgdGhpcy5fbG9naW5DaGFuZ2VkID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmxvZ2luVXJsID0gbmV3TG9naW5Vcmw7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vcmVsYXRpdmUgcGF0aFxyXG5cclxuICAgICAgY29uc3QgbGFzdEluZE9mU2xhc2ggPSByZXNwb25zZU9iai5yZXNwb25zZVVSTC5sYXN0SW5kZXhPZignLycpICsgMTtcclxuICAgICAgLy9yZW1vdmUgZXZlcnl0aGluZyBhZnRlciB0aGUgbGFzdCBzbGFzaCwgYW5kIGV2ZXJ5dGhpbmcgdW50aWwgdGhlIGZpcnN0XHJcbiAgICAgIGNvbnN0IHJlbGF0aXZlTG9naW5VcmwgPSByZXNwb25zZU9iai5yZXNwb25zZVVSTC5zdWJzdHIoMCwgbGFzdEluZE9mU2xhc2gpLnJlcGxhY2UoLy4qXFwvezJ9W15cXC9dKi8sICcnKSArIGFjdGlvblVybDtcclxuICAgICAgbmV3TG9naW5VcmwgPSB0aGlzLmhvc3RVcmwgPyB0aGlzLmhvc3RVcmwgKyByZWxhdGl2ZUxvZ2luVXJsIDogcmVsYXRpdmVMb2dpblVybDtcclxuICAgICAgaWYobmV3TG9naW5VcmwgIT09IHRoaXMubG9naW5VcmwpIHtcclxuICAgICAgICB0aGlzLl9sb2dpbkNoYW5nZWQgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMubG9naW5VcmwgPSBuZXdMb2dpblVybDtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vc2F2ZSBwYXJhbWV0ZXJzIGZyb20gaGlkZGVuIGZvcm0gZmllbGRzXHJcbiAgICBjb25zdCBwYXJzZXIgPSBuZXcgRE9NUGFyc2VyKCk7XHJcbiAgICBjb25zdCBkb2MgPSBwYXJzZXIucGFyc2VGcm9tU3RyaW5nKHJlc3BvbnNlT2JqLnJlc3BvbnNlVGV4dCxcInRleHQvaHRtbFwiKTtcclxuICAgIGNvbnN0IHJlcyA9IGRvYy5xdWVyeVNlbGVjdG9yQWxsKFwiaW5wdXRbdHlwZT0naGlkZGVuJ11cIik7XHJcbiAgICBjb25zdCBoaWRkZW5Gb3JtUGFyYW1zID0ge307XHJcbiAgICBpZihyZXMpIHtcclxuICAgICAgLy9pdCdzIG5ldyBsb2dpbiBwYWdlIGlmIHdlIGhhdmUgdGhlc2UgYWRkaXRpb25hbCBwYXJhbWV0ZXJzXHJcbiAgICAgIHRoaXMuX2lzTmV3TG9naW5QYWdlID0gdHJ1ZTtcclxuICAgICAgcmVzLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xyXG4gICAgICAgIGhpZGRlbkZvcm1QYXJhbXNbbm9kZS5uYW1lXSA9IG5vZGUudmFsdWU7XHJcbiAgICAgIH0pO1xyXG4gICAgICB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtcyA9IGhpZGRlbkZvcm1QYXJhbXM7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcbn07XHJcblxyXG4vKipcclxuKiBHZXQgZnVsbCBwcm9ncmFtIHBhdGggZnJvbSBtZXRhZGF0YSByb290IGFuZCByZWxhdGl2ZSBwYXRoXHJcbipcclxuKiBAcGFyYW0ge3N0cmluZ30gbWV0YWRhdGFSb290IC0gTWV0YWRhdGEgcm9vdCAocGF0aCB3aGVyZSBhbGwgcHJvZ3JhbXMgZm9yIHRoZSBwcm9qZWN0IGFyZSBsb2NhdGVkKVxyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtUGF0aCAtIFNhcyBwcm9ncmFtIHBhdGhcclxuKlxyXG4qL1xyXG5tb2R1bGUuZXhwb3J0cy5nZXRGdWxsUHJvZ3JhbVBhdGggPSBmdW5jdGlvbihtZXRhZGF0YVJvb3QsIHNhc1Byb2dyYW1QYXRoKSB7XHJcbiAgcmV0dXJuIG1ldGFkYXRhUm9vdCA/IG1ldGFkYXRhUm9vdC5yZXBsYWNlKC9cXC8/JC8sICcvJykgKyBzYXNQcm9ncmFtUGF0aC5yZXBsYWNlKC9eXFwvLywgJycpIDogc2FzUHJvZ3JhbVBhdGg7XHJcbn07XHJcblxyXG4vLyBSZXR1cm5zIG9iamVjdCB3aGVyZSB0YWJsZSByb3dzIGFyZSBncm91cHBlZCBieSBrZXlcclxubW9kdWxlLmV4cG9ydHMuZ2V0T2JqT2ZUYWJsZSA9IGZ1bmN0aW9uICh0YWJsZSwga2V5LCB2YWx1ZSA9IG51bGwpIHtcclxuXHRjb25zdCBvYmogPSB7fVxyXG5cdHRhYmxlLmZvckVhY2gocm93ID0+IHtcclxuXHRcdG9ialtyb3dba2V5XV0gPSB2YWx1ZSA/IHJvd1t2YWx1ZV0gOiByb3dcclxuXHR9KVxyXG5cdHJldHVybiBvYmpcclxufVxyXG5cclxuLy8gUmV0dXJucyBzZWxmIHVyaSBvdXQgb2YgbGlua3MgYXJyYXlcclxubW9kdWxlLmV4cG9ydHMuZ2V0U2VsZlVyaSA9IGZ1bmN0aW9uIChsaW5rcykge1xyXG5cdHJldHVybiBsaW5rc1xyXG5cdFx0LmZpbHRlcihlID0+IGUucmVsID09PSAnc2VsZicpXHJcblx0XHQubWFwKGUgPT4gZS51cmkpXHJcblx0XHQuc2hpZnQoKTtcclxufVxyXG4iLCJjb25zdCBoNTRzRXJyb3IgPSByZXF1aXJlKCcuL2Vycm9yLmpzJyk7XHJcbmNvbnN0IGxvZ3MgICAgICA9IHJlcXVpcmUoJy4vbG9ncy5qcycpO1xyXG5jb25zdCBUYWJsZXMgICAgPSByZXF1aXJlKCcuL3RhYmxlcycpO1xyXG5jb25zdCBGaWxlcyAgICAgPSByZXF1aXJlKCcuL2ZpbGVzJyk7XHJcbmNvbnN0IHRvU2FzRGF0ZVRpbWUgPSByZXF1aXJlKCcuL3RhYmxlcy91dGlscy5qcycpLnRvU2FzRGF0ZVRpbWU7XHJcblxyXG4vKipcclxuICogQ2hlY2tzIHdoZXRoZXIgYSBnaXZlbiB0YWJsZSBuYW1lIGlzIGEgdmFsaWQgU0FTIG1hY3JvIG5hbWVcclxuICogQHBhcmFtIHtTdHJpbmd9IG1hY3JvTmFtZSBUaGUgU0FTIG1hY3JvIG5hbWUgdG8gYmUgZ2l2ZW4gdG8gdGhpcyB0YWJsZVxyXG4gKi9cclxuZnVuY3Rpb24gdmFsaWRhdGVNYWNybyhtYWNyb05hbWUpIHtcclxuICBpZihtYWNyb05hbWUubGVuZ3RoID4gMzIpIHtcclxuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgbmFtZSB0b28gbG9uZy4gTWF4aW11bSBpcyAzMiBjaGFyYWN0ZXJzJyk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBjaGFyQ29kZUF0MCA9IG1hY3JvTmFtZS5jaGFyQ29kZUF0KDApO1xyXG4gIC8vIHZhbGlkYXRlIGl0IHN0YXJ0cyB3aXRoIEEtWiwgYS16LCBvciBfXHJcbiAgaWYoKGNoYXJDb2RlQXQwIDwgNjUgfHwgY2hhckNvZGVBdDAgPiA5MCkgJiYgKGNoYXJDb2RlQXQwIDwgOTcgfHwgY2hhckNvZGVBdDAgPiAxMjIpICYmIG1hY3JvTmFtZVswXSAhPT0gJ18nKSB7XHJcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIG5hbWUgc3RhcnRpbmcgd2l0aCBudW1iZXIgb3Igc3BlY2lhbCBjaGFyYWN0ZXJzJyk7XHJcbiAgfVxyXG5cclxuICBmb3IobGV0IGkgPSAwOyBpIDwgbWFjcm9OYW1lLmxlbmd0aDsgaSsrKSB7XHJcbiAgICBjb25zdCBjaGFyQ29kZSA9IG1hY3JvTmFtZS5jaGFyQ29kZUF0KGkpO1xyXG5cclxuICAgIGlmKChjaGFyQ29kZSA8IDQ4IHx8IGNoYXJDb2RlID4gNTcpICYmXHJcbiAgICAgIChjaGFyQ29kZSA8IDY1IHx8IGNoYXJDb2RlID4gOTApICYmXHJcbiAgICAgIChjaGFyQ29kZSA8IDk3IHx8IGNoYXJDb2RlID4gMTIyKSAmJlxyXG4gICAgICBtYWNyb05hbWVbaV0gIT09ICdfJylcclxuICAgIHtcclxuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUYWJsZSBuYW1lIGhhcyB1bnN1cHBvcnRlZCBjaGFyYWN0ZXJzJyk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuKiBoNTRzIFNBUyBkYXRhIG9iamVjdCBjb25zdHJ1Y3RvclxyXG4qIEBjb25zdHJ1Y3RvclxyXG4qXHJcbiogQHBhcmFtIHthcnJheXxmaWxlfSBkYXRhIC0gVGFibGUgb3IgZmlsZSBhZGRlZCB3aGVuIG9iamVjdCBpcyBjcmVhdGVkXHJcbiogQHBhcmFtIHtTdHJpbmd9IG1hY3JvTmFtZSBUaGUgU0FTIG1hY3JvIG5hbWUgdG8gYmUgZ2l2ZW4gdG8gdGhpcyB0YWJsZVxyXG4qIEBwYXJhbSB7bnVtYmVyfSBwYXJhbWV0ZXJUaHJlc2hvbGQgLSBzaXplIG9mIGRhdGEgb2JqZWN0cyBzZW50IHRvIFNBUyAobGVnYWN5KVxyXG4qXHJcbiovXHJcbmZ1bmN0aW9uIFNhc0RhdGEoZGF0YSwgbWFjcm9OYW1lLCBzcGVjcykge1xyXG4gIGlmKGRhdGEgaW5zdGFuY2VvZiBBcnJheSkge1xyXG4gICAgdGhpcy5fZmlsZXMgPSB7fTtcclxuICAgIHRoaXMuYWRkVGFibGUoZGF0YSwgbWFjcm9OYW1lLCBzcGVjcyk7XHJcbiAgfSBlbHNlIGlmKGRhdGEgaW5zdGFuY2VvZiBGaWxlIHx8IGRhdGEgaW5zdGFuY2VvZiBCbG9iKSB7XHJcbiAgICBGaWxlcy5jYWxsKHRoaXMsIGRhdGEsIG1hY3JvTmFtZSk7XHJcbiAgfSBlbHNlIHtcclxuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRGF0YSBhcmd1bWVudCB3cm9uZyB0eXBlIG9yIG1pc3NpbmcnKTtcclxuICB9XHJcbn1cclxuXHJcbi8qKlxyXG4qIEFkZCB0YWJsZSB0byB0YWJsZXMgb2JqZWN0XHJcbiogQHBhcmFtIHthcnJheX0gdGFibGUgLSBBcnJheSBvZiB0YWJsZSBvYmplY3RzXHJcbiogQHBhcmFtIHtTdHJpbmd9IG1hY3JvTmFtZSBUaGUgU0FTIG1hY3JvIG5hbWUgdG8gYmUgZ2l2ZW4gdG8gdGhpcyB0YWJsZVxyXG4qXHJcbiovXHJcblNhc0RhdGEucHJvdG90eXBlLmFkZFRhYmxlID0gZnVuY3Rpb24odGFibGUsIG1hY3JvTmFtZSwgc3BlY3MpIHtcclxuICBjb25zdCBpc1NwZWNzUHJvdmlkZWQgPSAhIXNwZWNzO1xyXG4gIGlmKHRhYmxlICYmIG1hY3JvTmFtZSkge1xyXG4gICAgaWYoISh0YWJsZSBpbnN0YW5jZW9mIEFycmF5KSkge1xyXG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgYXJyYXknKTtcclxuICAgIH1cclxuICAgIGlmKHR5cGVvZiBtYWNyb05hbWUgIT09ICdzdHJpbmcnKSB7XHJcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFsaWRhdGVNYWNybyhtYWNyb05hbWUpO1xyXG4gIH0gZWxzZSB7XHJcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgYXJndW1lbnRzJyk7XHJcbiAgfVxyXG5cclxuICBpZiAodHlwZW9mIHRhYmxlICE9PSAnb2JqZWN0JyB8fCAhKHRhYmxlIGluc3RhbmNlb2YgQXJyYXkpKSB7XHJcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIGFyZ3VtZW50IGlzIG5vdCBhbiBhcnJheScpO1xyXG4gIH1cclxuXHJcbiAgbGV0IGtleTtcclxuICBpZihzcGVjcykge1xyXG4gICAgaWYoc3BlY3MuY29uc3RydWN0b3IgIT09IE9iamVjdCkge1xyXG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1NwZWNzIGRhdGEgdHlwZSB3cm9uZy4gT2JqZWN0IGV4cGVjdGVkLicpO1xyXG4gICAgfVxyXG4gICAgZm9yKGtleSBpbiB0YWJsZVswXSkge1xyXG4gICAgICBpZighc3BlY3Nba2V5XSkge1xyXG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBjb2x1bW5zIGluIHNwZWNzIGRhdGEuJyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGZvcihrZXkgaW4gc3BlY3MpIHtcclxuICAgICAgaWYoc3BlY3Nba2V5XS5jb25zdHJ1Y3RvciAhPT0gT2JqZWN0KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdXcm9uZyBjb2x1bW4gZGVzY3JpcHRvciBpbiBzcGVjcyBkYXRhLicpO1xyXG4gICAgICB9XHJcbiAgICAgIGlmKCFzcGVjc1trZXldLmNvbFR5cGUgfHwgIXNwZWNzW2tleV0uY29sTGVuZ3RoKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGNvbHVtbnMgaW4gc3BlY3MgZGVzY3JpcHRvci4nKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgbGV0IGksIGosIC8vY291bnRlcnMgdXNlZCBsYXR0ZXIgaW4gY29kZVxyXG4gICAgICByb3csIHZhbCwgdHlwZSxcclxuICAgICAgc3BlY0tleXMgPSBbXTtcclxuXHRjb25zdCBzcGVjaWFsQ2hhcnMgPSBbJ1wiJywgJ1xcXFwnLCAnLycsICdcXG4nLCAnXFx0JywgJ1xcZicsICdcXHInLCAnXFxiJ107XHJcblxyXG4gIGlmKCFzcGVjcykge1xyXG4gICAgc3BlY3MgPSB7fTtcclxuXHJcbiAgICBmb3IgKGkgPSAwOyBpIDwgdGFibGUubGVuZ3RoOyBpKyspIHtcclxuICAgICAgcm93ID0gdGFibGVbaV07XHJcblxyXG4gICAgICBpZih0eXBlb2Ygcm93ICE9PSAnb2JqZWN0Jykge1xyXG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgaXRlbSBpcyBub3QgYW4gb2JqZWN0Jyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGZvcihrZXkgaW4gcm93KSB7XHJcbiAgICAgICAgaWYocm93Lmhhc093blByb3BlcnR5KGtleSkpIHtcclxuICAgICAgICAgIHZhbCAgPSByb3dba2V5XTtcclxuICAgICAgICAgIHR5cGUgPSB0eXBlb2YgdmFsO1xyXG5cclxuICAgICAgICAgIGlmKHNwZWNzW2tleV0gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBzcGVjS2V5cy5wdXNoKGtleSk7XHJcbiAgICAgICAgICAgIHNwZWNzW2tleV0gPSB7fTtcclxuXHJcbiAgICAgICAgICAgIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgIGlmKHZhbCA8IE51bWJlci5NSU5fU0FGRV9JTlRFR0VSIHx8IHZhbCA+IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB7XHJcbiAgICAgICAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdPYmplY3RbJyArIGkgKyAnXS4nICsga2V5ICsgJyAtIFRoaXMgdmFsdWUgZXhjZWVkcyBleHBlY3RlZCBudW1lcmljIHByZWNpc2lvbi4nKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgPSAnbnVtJztcclxuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IDg7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycgJiYgISh2YWwgaW5zdGFuY2VvZiBEYXRlKSkgeyAvLyBzdHJhaWdodGZvcndhcmQgc3RyaW5nXHJcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgID0gJ3N0cmluZyc7XHJcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggID0gdmFsLmxlbmd0aDtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKHZhbCBpbnN0YW5jZW9mIERhdGUpIHtcclxuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbFR5cGUgICA9ICdkYXRlJztcclxuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IDg7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbFR5cGUgICA9ICdqc29uJztcclxuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IEpTT04uc3RyaW5naWZ5KHZhbCkubGVuZ3RoO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfSBlbHNlIHtcclxuICAgIHNwZWNLZXlzID0gT2JqZWN0LmtleXMoc3BlY3MpO1xyXG4gIH1cclxuXHJcbiAgbGV0IHNhc0NzdiA9ICcnO1xyXG5cclxuICAvLyB3ZSBuZWVkIHR3byBsb29wcyAtIHRoZSBmaXJzdCBvbmUgaXMgY3JlYXRpbmcgc3BlY3MgYW5kIHZhbGlkYXRpbmdcclxuICBmb3IgKGkgPSAwOyBpIDwgdGFibGUubGVuZ3RoOyBpKyspIHtcclxuICAgIHJvdyA9IHRhYmxlW2ldO1xyXG4gICAgZm9yKGogPSAwOyBqIDwgc3BlY0tleXMubGVuZ3RoOyBqKyspIHtcclxuICAgICAga2V5ID0gc3BlY0tleXNbal07XHJcbiAgICAgIGlmKHJvdy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcbiAgICAgICAgdmFsICA9IHJvd1trZXldO1xyXG4gICAgICAgIHR5cGUgPSB0eXBlb2YgdmFsO1xyXG5cclxuICAgICAgICBpZih0eXBlID09PSAnbnVtYmVyJyAmJiBpc05hTih2YWwpKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnTmFOIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZih2YWwgPT09IC1JbmZpbml0eSB8fCB2YWwgPT09IEluZmluaXR5KSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCB2YWwudG9TdHJpbmcoKSArICcgdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmKHZhbCA9PT0gdHJ1ZSB8fCB2YWwgPT09IGZhbHNlKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnQm9vbGVhbiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYodHlwZSA9PT0gJ3N0cmluZycgJiYgdmFsLmluZGV4T2YoJ1xcclxcbicpICE9PSAtMSkge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ05ldyBsaW5lIGNoYXJhY3RlciBpcyBub3Qgc3VwcG9ydGVkJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBjb252ZXJ0IG51bGwgdG8gJy4nIGZvciBudW1iZXJzIGFuZCB0byAnJyBmb3Igc3RyaW5nc1xyXG4gICAgICAgIGlmKHZhbCA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgaWYoc3BlY3Nba2V5XS5jb2xUeXBlID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICB2YWwgPSAnJztcclxuICAgICAgICAgICAgdHlwZSA9ICdzdHJpbmcnO1xyXG4gICAgICAgICAgfSBlbHNlIGlmKHNwZWNzW2tleV0uY29sVHlwZSA9PT0gJ251bScpIHtcclxuICAgICAgICAgICAgdmFsID0gJy4nO1xyXG4gICAgICAgICAgICB0eXBlID0gJ251bWJlcic7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnQ2Fubm90IGNvbnZlcnQgbnVsbCB2YWx1ZScpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcblxyXG4gICAgICAgIGlmICgodHlwZSA9PT0gJ251bWJlcicgJiYgc3BlY3Nba2V5XS5jb2xUeXBlICE9PSAnbnVtJyAmJiB2YWwgIT09ICcuJykgfHxcclxuICAgICAgICAgICgodHlwZSA9PT0gJ3N0cmluZycgJiYgISh2YWwgaW5zdGFuY2VvZiBEYXRlKSAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdzdHJpbmcnKSAmJlxyXG4gICAgICAgICAgKHR5cGUgPT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sVHlwZSA9PSAnbnVtJyAmJiB2YWwgIT09ICcuJykpIHx8XHJcbiAgICAgICAgICAodmFsIGluc3RhbmNlb2YgRGF0ZSAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdkYXRlJykgfHxcclxuICAgICAgICAgICgodHlwZSA9PT0gJ29iamVjdCcgJiYgdmFsLmNvbnN0cnVjdG9yICE9PSBEYXRlKSAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdqc29uJykpXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ1RoZXJlIGlzIGEgc3BlY3MgdHlwZSBtaXNtYXRjaCBpbiB0aGUgYXJyYXkgYmV0d2VlbiB2YWx1ZXMgKGNvbHVtbnMpIG9mIHRoZSBzYW1lIG5hbWUuJyArXHJcbiAgICAgICAgICAgICcgdHlwZS9jb2xUeXBlL3ZhbCA9ICcgKyB0eXBlICsnLycgKyBzcGVjc1trZXldLmNvbFR5cGUgKyAnLycgKyB2YWwgKTtcclxuICAgICAgICB9IGVsc2UgaWYoIWlzU3BlY3NQcm92aWRlZCAmJiB0eXBlID09PSAnc3RyaW5nJyAmJiBzcGVjc1trZXldLmNvbExlbmd0aCA8IHZhbC5sZW5ndGgpIHtcclxuICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gdmFsLmxlbmd0aDtcclxuICAgICAgICB9IGVsc2UgaWYoKHR5cGUgPT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sTGVuZ3RoIDwgdmFsLmxlbmd0aCkgfHwgKHR5cGUgIT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sTGVuZ3RoICE9PSA4KSkge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ1RoZXJlIGlzIGEgc3BlY3MgbGVuZ3RoIG1pc21hdGNoIGluIHRoZSBhcnJheSBiZXR3ZWVuIHZhbHVlcyAoY29sdW1ucykgb2YgdGhlIHNhbWUgbmFtZS4nICtcclxuICAgICAgICAgICAgJyB0eXBlL2NvbFR5cGUvdmFsID0gJyArIHR5cGUgKycvJyArIHNwZWNzW2tleV0uY29sVHlwZSArICcvJyArIHZhbCApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHZhbCBpbnN0YW5jZW9mIERhdGUpIHtcclxuICAgICAgICAgIHZhbCA9IHRvU2FzRGF0ZVRpbWUodmFsKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHN3aXRjaChzcGVjc1trZXldLmNvbFR5cGUpIHtcclxuICAgICAgICAgIGNhc2UgJ251bSc6XHJcbiAgICAgICAgICBjYXNlICdkYXRlJzpcclxuICAgICAgICAgICAgc2FzQ3N2ICs9IHZhbDtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICBjYXNlICdzdHJpbmcnOlxyXG4gICAgICAgICAgICBzYXNDc3YgKz0gJ1wiJyArIHZhbC5yZXBsYWNlKC9cIi9nLCAnXCJcIicpICsgJ1wiJztcclxuICAgICAgICAgICAgbGV0IGNvbExlbmd0aCA9IHZhbC5sZW5ndGg7XHJcbiAgICAgICAgICAgIGZvcihsZXQgayA9IDA7IGsgPCB2YWwubGVuZ3RoOyBrKyspIHtcclxuICAgICAgICAgICAgICBpZihzcGVjaWFsQ2hhcnMuaW5kZXhPZih2YWxba10pICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgY29sTGVuZ3RoKys7XHJcbiAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGxldCBjb2RlID0gdmFsLmNoYXJDb2RlQXQoayk7XHJcbiAgICAgICAgICAgICAgICBpZihjb2RlID4gMHhmZmZmKSB7XHJcbiAgICAgICAgICAgICAgICAgIGNvbExlbmd0aCArPSAzO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmKGNvZGUgPiAweDdmZikge1xyXG4gICAgICAgICAgICAgICAgICBjb2xMZW5ndGggKz0gMjtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihjb2RlID4gMHg3Zikge1xyXG4gICAgICAgICAgICAgICAgICBjb2xMZW5ndGggKz0gMTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLy8gdXNlIG1heGltdW0gdmFsdWUgYmV0d2VlbiBtYXggcHJldmlvdXMsIGN1cnJlbnQgdmFsdWUgYW5kIDEgKGZpcnN0IHR3byBjYW4gYmUgMCB3aWNoIGlzIG5vdCBzdXBwb3J0ZWQpXHJcbiAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gTWF0aC5tYXgoc3BlY3Nba2V5XS5jb2xMZW5ndGgsIGNvbExlbmd0aCwgMSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgY2FzZSAnb2JqZWN0JzpcclxuICAgICAgICAgICAgc2FzQ3N2ICs9ICdcIicgKyBKU09OLnN0cmluZ2lmeSh2YWwpLnJlcGxhY2UoL1wiL2csICdcIlwiJykgKyAnXCInO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgLy8gZG8gbm90IGluc2VydCBpZiBpdCdzIHRoZSBsYXN0IGNvbHVtblxyXG4gICAgICBpZihqIDwgc3BlY0tleXMubGVuZ3RoIC0gMSkge1xyXG4gICAgICAgIHNhc0NzdiArPSAnLCc7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGlmKGkgPCB0YWJsZS5sZW5ndGggLSAxKSB7XHJcbiAgICAgIHNhc0NzdiArPSAnXFxyXFxuJztcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8vY29udmVydCBzcGVjcyB0byBjc3Ygd2l0aCBwaXBlc1xyXG4gIGNvbnN0IHNwZWNTdHJpbmcgPSBzcGVjS2V5cy5tYXAoZnVuY3Rpb24oa2V5KSB7XHJcbiAgICByZXR1cm4ga2V5ICsgJywnICsgc3BlY3Nba2V5XS5jb2xUeXBlICsgJywnICsgc3BlY3Nba2V5XS5jb2xMZW5ndGg7XHJcbiAgfSkuam9pbignfCcpO1xyXG5cclxuICB0aGlzLl9maWxlc1ttYWNyb05hbWVdID0gW1xyXG4gICAgc3BlY1N0cmluZyxcclxuICAgIG5ldyBCbG9iKFtzYXNDc3ZdLCB7dHlwZTogJ3RleHQvY3N2O2NoYXJzZXQ9VVRGLTgnfSlcclxuICBdO1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIEFkZCBmaWxlIGFzIGEgdmVyYmF0aW0gYmxvYiBmaWxlIHVwbGFvZFxyXG4gKiBAcGFyYW0ge0Jsb2J9IGZpbGUgLSB0aGUgYmxvYiB0aGF0IHdpbGwgYmUgdXBsb2FkZWQgYXMgZmlsZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbWFjcm9OYW1lIC0gdGhlIFNBUyB3ZWJpbiBuYW1lIGdpdmVuIHRvIHRoaXMgZmlsZVxyXG4gKi9cclxuU2FzRGF0YS5wcm90b3R5cGUuYWRkRmlsZSAgPSBmdW5jdGlvbihmaWxlLCBtYWNyb05hbWUpIHtcclxuICBGaWxlcy5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgZmlsZSwgbWFjcm9OYW1lKTtcclxufTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gU2FzRGF0YTtcclxuIiwiY29uc3QgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcclxuXHJcbi8qXHJcbiogaDU0cyB0YWJsZXMgb2JqZWN0IGNvbnN0cnVjdG9yXHJcbiogQGNvbnN0cnVjdG9yXHJcbipcclxuKkBwYXJhbSB7YXJyYXl9IHRhYmxlIC0gVGFibGUgYWRkZWQgd2hlbiBvYmplY3QgaXMgY3JlYXRlZFxyXG4qQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIG1hY3JvIG5hbWVcclxuKkBwYXJhbSB7bnVtYmVyfSBwYXJhbWV0ZXJUaHJlc2hvbGQgLSBzaXplIG9mIGRhdGEgb2JqZWN0cyBzZW50IHRvIFNBU1xyXG4qXHJcbiovXHJcbmZ1bmN0aW9uIFRhYmxlcyh0YWJsZSwgbWFjcm9OYW1lLCBwYXJhbWV0ZXJUaHJlc2hvbGQpIHtcclxuICB0aGlzLl90YWJsZXMgPSB7fTtcclxuICB0aGlzLl9wYXJhbWV0ZXJUaHJlc2hvbGQgPSBwYXJhbWV0ZXJUaHJlc2hvbGQgfHwgMzAwMDA7XHJcblxyXG4gIFRhYmxlcy5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgdGFibGUsIG1hY3JvTmFtZSk7XHJcbn1cclxuXHJcbi8qXHJcbiogQWRkIHRhYmxlIHRvIHRhYmxlcyBvYmplY3RcclxuKiBAcGFyYW0ge2FycmF5fSB0YWJsZSAtIEFycmF5IG9mIHRhYmxlIG9iamVjdHNcclxuKiBAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gU2FzIG1hY3JvIG5hbWVcclxuKlxyXG4qL1xyXG5UYWJsZXMucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKHRhYmxlLCBtYWNyb05hbWUpIHtcclxuICBpZih0YWJsZSAmJiBtYWNyb05hbWUpIHtcclxuICAgIGlmKCEodGFibGUgaW5zdGFuY2VvZiBBcnJheSkpIHtcclxuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBhcmd1bWVudCBtdXN0IGJlIGFycmF5Jyk7XHJcbiAgICB9XHJcbiAgICBpZih0eXBlb2YgbWFjcm9OYW1lICE9PSAnc3RyaW5nJykge1xyXG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1NlY29uZCBhcmd1bWVudCBtdXN0IGJlIHN0cmluZycpO1xyXG4gICAgfVxyXG4gICAgaWYoIWlzTmFOKG1hY3JvTmFtZVttYWNyb05hbWUubGVuZ3RoIC0gMV0pKSB7XHJcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWFjcm8gbmFtZSBjYW5ub3QgaGF2ZSBudW1iZXIgYXQgdGhlIGVuZCcpO1xyXG4gICAgfVxyXG4gIH0gZWxzZSB7XHJcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgYXJndW1lbnRzJyk7XHJcbiAgfVxyXG5cclxuICBjb25zdCByZXN1bHQgPSB0aGlzLl91dGlscy5jb252ZXJ0VGFibGVPYmplY3QodGFibGUsIHRoaXMuX3BhcmFtZXRlclRocmVzaG9sZCk7XHJcblxyXG4gIGNvbnN0IHRhYmxlQXJyYXkgPSBbXTtcclxuICB0YWJsZUFycmF5LnB1c2goSlNPTi5zdHJpbmdpZnkocmVzdWx0LnNwZWMpKTtcclxuICBmb3IgKGxldCBudW1iZXJPZlRhYmxlcyA9IDA7IG51bWJlck9mVGFibGVzIDwgcmVzdWx0LmRhdGEubGVuZ3RoOyBudW1iZXJPZlRhYmxlcysrKSB7XHJcbiAgICBjb25zdCBvdXRTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShyZXN1bHQuZGF0YVtudW1iZXJPZlRhYmxlc10pO1xyXG4gICAgdGFibGVBcnJheS5wdXNoKG91dFN0cmluZyk7XHJcbiAgfVxyXG4gIHRoaXMuX3RhYmxlc1ttYWNyb05hbWVdID0gdGFibGVBcnJheTtcclxufTtcclxuXHJcblRhYmxlcy5wcm90b3R5cGUuX3V0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBUYWJsZXM7XHJcbiIsImNvbnN0IGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XHJcbmNvbnN0IGxvZ3MgPSByZXF1aXJlKCcuLi9sb2dzLmpzJyk7XHJcblxyXG4vKlxyXG4qIENvbnZlcnQgdGFibGUgb2JqZWN0IHRvIFNhcyByZWFkYWJsZSBvYmplY3RcclxuKlxyXG4qIEBwYXJhbSB7b2JqZWN0fSBpbk9iamVjdCAtIE9iamVjdCB0byBjb252ZXJ0XHJcbipcclxuKi9cclxubW9kdWxlLmV4cG9ydHMuY29udmVydFRhYmxlT2JqZWN0ID0gZnVuY3Rpb24oaW5PYmplY3QsIGNodW5rVGhyZXNob2xkKSB7XHJcbiAgY29uc3Qgc2VsZiAgICAgICAgICAgID0gdGhpcztcclxuXHJcbiAgaWYoY2h1bmtUaHJlc2hvbGQgPiAzMDAwMCkge1xyXG4gICAgY29uc29sZS53YXJuKCdZb3Ugc2hvdWxkIG5vdCBzZXQgdGhyZXNob2xkIGxhcmdlciB0aGFuIDMwa2IgYmVjYXVzZSBvZiB0aGUgU0FTIGxpbWl0YXRpb25zJyk7XHJcbiAgfVxyXG5cclxuICAvLyBmaXJzdCBjaGVjayB0aGF0IHRoZSBvYmplY3QgaXMgYW4gYXJyYXlcclxuICBpZiAodHlwZW9mIChpbk9iamVjdCkgIT09ICdvYmplY3QnKSB7XHJcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RoZSBwYXJhbWV0ZXIgcGFzc2VkIHRvIGNoZWNrQW5kR2V0VHlwZU9iamVjdCBpcyBub3QgYW4gb2JqZWN0Jyk7XHJcbiAgfVxyXG5cclxuICBjb25zdCBhcnJheUxlbmd0aCA9IGluT2JqZWN0Lmxlbmd0aDtcclxuICBpZiAodHlwZW9mIChhcnJheUxlbmd0aCkgIT09ICdudW1iZXInKSB7XHJcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RoZSBwYXJhbWV0ZXIgcGFzc2VkIHRvIGNoZWNrQW5kR2V0VHlwZU9iamVjdCBkb2VzIG5vdCBoYXZlIGEgdmFsaWQgbGVuZ3RoIGFuZCBpcyBtb3N0IGxpa2VseSBub3QgYW4gYXJyYXknKTtcclxuICB9XHJcblxyXG4gIGNvbnN0IGV4aXN0aW5nQ29scyA9IHt9OyAvLyB0aGlzIGlzIGp1c3QgdG8gbWFrZSBsb29rdXAgZWFzaWVyIHJhdGhlciB0aGFuIHRyYXZlcnNpbmcgYXJyYXkgZWFjaCB0aW1lLiBXaWxsIHRyYW5zZm9ybSBhZnRlclxyXG5cclxuICAvLyBmdW5jdGlvbiBjaGVja0FuZFNldEFycmF5IC0gdGhpcyB3aWxsIGNoZWNrIGFuIGluT2JqZWN0IGN1cnJlbnQga2V5IGFnYWluc3QgdGhlIGV4aXN0aW5nIHR5cGVBcnJheSBhbmQgZWl0aGVyIHJldHVybiAtMSBpZiB0aGVyZVxyXG4gIC8vIGlzIGEgdHlwZSBtaXNtYXRjaCBvciBhZGQgYW4gZWxlbWVudCBhbmQgdXBkYXRlL2luY3JlbWVudCB0aGUgbGVuZ3RoIGlmIG5lZWRlZFxyXG5cclxuICBmdW5jdGlvbiBjaGVja0FuZEluY3JlbWVudChjb2xTcGVjKSB7XHJcbiAgICBpZiAodHlwZW9mIChleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXSkgPT09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdICAgICAgICAgICA9IHt9O1xyXG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xOYW1lICAgPSBjb2xTcGVjLmNvbE5hbWU7XHJcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbFR5cGUgICA9IGNvbFNwZWMuY29sVHlwZTtcclxuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoID0gY29sU3BlYy5jb2xMZW5ndGggPiAwID8gY29sU3BlYy5jb2xMZW5ndGggOiAxO1xyXG4gICAgICByZXR1cm4gMDsgLy8gYWxsIG9rXHJcbiAgICB9XHJcbiAgICAvLyBjaGVjayB0eXBlIG1hdGNoXHJcbiAgICBpZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sVHlwZSAhPT0gY29sU3BlYy5jb2xUeXBlKSB7XHJcbiAgICAgIHJldHVybiAtMTsgLy8gdGhlcmUgaXMgYSBmdWRnZSBpbiB0aGUgdHlwaW5nXHJcbiAgICB9XHJcbiAgICBpZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoIDwgY29sU3BlYy5jb2xMZW5ndGgpIHtcclxuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoID0gY29sU3BlYy5jb2xMZW5ndGggPiAwID8gY29sU3BlYy5jb2xMZW5ndGggOiAxOyAvLyBpbmNyZW1lbnQgdGhlIG1heCBsZW5ndGggb2YgdGhpcyBjb2x1bW5cclxuICAgICAgcmV0dXJuIDA7XHJcbiAgICB9XHJcbiAgfVxyXG4gIGxldCBjaHVua0FycmF5Q291bnQgICAgICAgICA9IDA7IC8vIHRoaXMgaXMgZm9yIGtlZXBpbmcgdGFicyBvbiBob3cgbG9uZyB0aGUgY3VycmVudCBhcnJheSBzdHJpbmcgd291bGQgYmVcclxuICBjb25zdCB0YXJnZXRBcnJheSAgICAgICAgICAgPSBbXTsgLy8gdGhpcyBpcyB0aGUgYXJyYXkgb2YgdGFyZ2V0IGFycmF5c1xyXG4gIGxldCBjdXJyZW50VGFyZ2V0ICAgICAgICAgICA9IDA7XHJcbiAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0gID0gW107XHJcbiAgbGV0IGogICAgICAgICAgICAgICAgICAgICAgID0gMDtcclxuICBmb3IgKGxldCBpID0gMDsgaSA8IGluT2JqZWN0Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXSA9IHt9O1xyXG4gICAgbGV0IGNodW5rUm93Q291bnQgICAgICAgICAgICAgPSAwO1xyXG5cclxuICAgIGZvciAobGV0IGtleSBpbiBpbk9iamVjdFtpXSkge1xyXG4gICAgICBjb25zdCB0aGlzU3BlYyAgPSB7fTtcclxuICAgICAgY29uc3QgdGhpc1ZhbHVlID0gaW5PYmplY3RbaV1ba2V5XTtcclxuXHJcbiAgICAgIC8vc2tpcCB1bmRlZmluZWQgdmFsdWVzXHJcbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHRoaXNWYWx1ZSA9PT0gbnVsbCkge1xyXG4gICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvL3Rocm93IGFuIGVycm9yIGlmIHRoZXJlJ3MgTmFOIHZhbHVlXHJcbiAgICAgIGlmKHR5cGVvZiB0aGlzVmFsdWUgPT09ICdudW1iZXInICYmIGlzTmFOKHRoaXNWYWx1ZSkpIHtcclxuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnTmFOIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZih0aGlzVmFsdWUgPT09IC1JbmZpbml0eSB8fCB0aGlzVmFsdWUgPT09IEluZmluaXR5KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgdGhpc1ZhbHVlLnRvU3RyaW5nKCkgKyAnIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBpZih0aGlzVmFsdWUgPT09IHRydWUgfHwgdGhpc1ZhbHVlID09PSBmYWxzZSkge1xyXG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdCb29sZWFuIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBnZXQgdHlwZS4uLiBpZiBpdCBpcyBhbiBvYmplY3QgdGhlbiBjb252ZXJ0IGl0IHRvIGpzb24gYW5kIHN0b3JlIGFzIGEgc3RyaW5nXHJcbiAgICAgIGNvbnN0IHRoaXNUeXBlICA9IHR5cGVvZiAodGhpc1ZhbHVlKTtcclxuXHJcbiAgICAgIGlmICh0aGlzVHlwZSA9PT0gJ251bWJlcicpIHsgLy8gc3RyYWlnaHRmb3J3YXJkIG51bWJlclxyXG4gICAgICAgIGlmKHRoaXNWYWx1ZSA8IE51bWJlci5NSU5fU0FGRV9JTlRFR0VSIHx8IHRoaXNWYWx1ZSA+IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB7XHJcbiAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdPYmplY3RbJyArIGkgKyAnXS4nICsga2V5ICsgJyAtIFRoaXMgdmFsdWUgZXhjZWVkcyBleHBlY3RlZCBudW1lcmljIHByZWNpc2lvbi4nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICAgICAgICAgICAgICAgICAgPSBrZXk7XHJcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICAgICAgICAgICAgICAgICAgPSAnbnVtJztcclxuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggICAgICAgICAgICAgICAgICA9IDg7XHJcbiAgICAgICAgdGhpc1NwZWMuZW5jb2RlZExlbmd0aCAgICAgICAgICAgICAgPSB0aGlzVmFsdWUudG9TdHJpbmcoKS5sZW5ndGg7XHJcbiAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSAgPSB0aGlzVmFsdWU7XHJcbiAgICAgIH0gZWxzZSBpZiAodGhpc1R5cGUgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICA9IGtleTtcclxuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgID0gJ3N0cmluZyc7XHJcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICA9IHRoaXNWYWx1ZS5sZW5ndGg7XHJcblxyXG4gICAgICAgIGlmICh0aGlzVmFsdWUgPT09IFwiXCIpIHtcclxuICAgICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gPSBcIiBcIjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSA9IGVuY29kZVVSSUNvbXBvbmVudCh0aGlzVmFsdWUpLnJlcGxhY2UoLycvZywgJyUyNycpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XS5sZW5ndGg7XHJcbiAgICAgIH0gZWxzZSBpZih0aGlzVmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XHJcbiAgICAgIFx0Y29uc29sZS5sb2coXCJFUlJPUiBWQUxVRSBcIiwgdGhpc1ZhbHVlKVxyXG4gICAgICBcdGNvbnNvbGUubG9nKFwiVFlQRU9GIFZBTFVFIFwiLCB0eXBlb2YgdGhpc1ZhbHVlKVxyXG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdEYXRlIHR5cGUgbm90IHN1cHBvcnRlZC4gUGxlYXNlIHVzZSBoNTRzLnRvU2FzRGF0ZVRpbWUgZnVuY3Rpb24gdG8gY29udmVydCBpdCcpO1xyXG4gICAgICB9IGVsc2UgaWYgKHRoaXNUeXBlID09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICAgICAgICAgICAgICAgICAgPSBrZXk7XHJcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICAgICAgICAgICAgICAgICAgPSAnanNvbic7XHJcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICAgICAgICAgICAgICAgICAgPSBKU09OLnN0cmluZ2lmeSh0aGlzVmFsdWUpLmxlbmd0aDtcclxuICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldICA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzVmFsdWUpKS5yZXBsYWNlKC8nL2csICclMjcnKTtcclxuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoICAgICAgICAgICAgICA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0ubGVuZ3RoO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjaHVua1Jvd0NvdW50ID0gY2h1bmtSb3dDb3VudCArIDYgKyBrZXkubGVuZ3RoICsgdGhpc1NwZWMuZW5jb2RlZExlbmd0aDtcclxuXHJcbiAgICAgIGlmIChjaGVja0FuZEluY3JlbWVudCh0aGlzU3BlYykgPT0gLTEpIHtcclxuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnVGhlcmUgaXMgYSB0eXBlIG1pc21hdGNoIGluIHRoZSBhcnJheSBiZXR3ZWVuIHZhbHVlcyAoY29sdW1ucykgb2YgdGhlIHNhbWUgbmFtZS4nKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vcmVtb3ZlIGxhc3QgYWRkZWQgcm93IGlmIGl0J3MgZW1wdHlcclxuICAgIGlmKE9iamVjdC5rZXlzKHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdKS5sZW5ndGggPT09IDApIHtcclxuICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0uc3BsaWNlKGosIDEpO1xyXG4gICAgICBjb250aW51ZTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoY2h1bmtSb3dDb3VudCA+IGNodW5rVGhyZXNob2xkKSB7XHJcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnUm93ICcgKyBqICsgJyBleGNlZWRzIHNpemUgbGltaXQgb2YgMzJrYicpO1xyXG4gICAgfSBlbHNlIGlmKGNodW5rQXJyYXlDb3VudCArIGNodW5rUm93Q291bnQgPiBjaHVua1RocmVzaG9sZCkge1xyXG4gICAgICAvL2NyZWF0ZSBuZXcgYXJyYXkgaWYgdGhpcyBvbmUgaXMgZnVsbCBhbmQgbW92ZSB0aGUgbGFzdCBpdGVtIHRvIHRoZSBuZXcgYXJyYXlcclxuICAgICAgY29uc3QgbGFzdFJvdyA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdLnBvcCgpOyAvLyBnZXQgcmlkIG9mIHRoYXQgbGFzdCByb3dcclxuICAgICAgY3VycmVudFRhcmdldCsrOyAvLyBtb3ZlIG9udG8gdGhlIG5leHQgYXJyYXlcclxuICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0gID0gW2xhc3RSb3ddOyAvLyBtYWtlIGl0IGFuIGFycmF5XHJcbiAgICAgIGogICAgICAgICAgICAgICAgICAgICAgICAgICA9IDA7IC8vIGluaXRpYWxpc2UgbmV3IHJvdyBjb3VudGVyIGZvciBuZXcgYXJyYXkgLSBpdCB3aWxsIGJlIGluY3JlbWVudGVkIGF0IHRoZSBlbmQgb2YgdGhlIGZ1bmN0aW9uXHJcbiAgICAgIGNodW5rQXJyYXlDb3VudCAgICAgICAgICAgICA9IGNodW5rUm93Q291bnQ7IC8vIHRoaXMgaXMgdGhlIG5ldyBjaHVuayBtYXggc2l6ZVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY2h1bmtBcnJheUNvdW50ID0gY2h1bmtBcnJheUNvdW50ICsgY2h1bmtSb3dDb3VudDtcclxuICAgIH1cclxuICAgIGorKztcclxuICB9XHJcblxyXG4gIC8vIHJlZm9ybWF0IGV4aXN0aW5nQ29scyBpbnRvIGFuIGFycmF5IHNvIHNhcyBjYW4gcGFyc2UgaXQ7XHJcbiAgY29uc3Qgc3BlY0FycmF5ID0gW107XHJcbiAgZm9yIChsZXQgayBpbiBleGlzdGluZ0NvbHMpIHtcclxuICAgIHNwZWNBcnJheS5wdXNoKGV4aXN0aW5nQ29sc1trXSk7XHJcbiAgfVxyXG4gIHJldHVybiB7XHJcbiAgICBzcGVjOiAgICAgICBzcGVjQXJyYXksXHJcbiAgICBkYXRhOiAgICAgICB0YXJnZXRBcnJheSxcclxuICAgIGpzb25MZW5ndGg6IGNodW5rQXJyYXlDb3VudFxyXG4gIH07IC8vIHRoZSBzcGVjIHdpbGwgYmUgdGhlIG1hY3JvWzBdLCB3aXRoIHRoZSBkYXRhIHNwbGl0IGludG8gYXJyYXlzIG9mIG1hY3JvWzEtbl1cclxuICAvLyBtZWFucyBpbiB0ZXJtcyBvZiBkb2pvIHhociBvYmplY3QgYXQgbGVhc3QgdGhleSBuZWVkIHRvIGdvIGludG8gdGhlIHNhbWUgYXJyYXlcclxufTtcclxuXHJcbi8qXHJcbiogQ29udmVydCBqYXZhc2NyaXB0IGRhdGUgdG8gc2FzIHRpbWVcclxuKlxyXG4qIEBwYXJhbSB7b2JqZWN0fSBqc0RhdGUgLSBqYXZhc2NyaXB0IERhdGUgb2JqZWN0XHJcbipcclxuKi9cclxubW9kdWxlLmV4cG9ydHMudG9TYXNEYXRlVGltZSA9IGZ1bmN0aW9uIChqc0RhdGUpIHtcclxuICBjb25zdCBiYXNlZGF0ZSA9IG5ldyBEYXRlKFwiSmFudWFyeSAxLCAxOTYwIDAwOjAwOjAwXCIpO1xyXG4gIGNvbnN0IGN1cnJkYXRlID0ganNEYXRlO1xyXG5cclxuICAvLyBvZmZzZXRzIGZvciBVVEMgYW5kIHRpbWV6b25lcyBhbmQgQlNUXHJcbiAgY29uc3QgYmFzZU9mZnNldCA9IGJhc2VkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcclxuICBjb25zdCBjdXJyT2Zmc2V0ID0gY3VycmRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xyXG5cclxuICAvLyBjb252ZXJ0IGN1cnJkYXRlIHRvIGEgc2FzIGRhdGV0aW1lXHJcbiAgY29uc3Qgb2Zmc2V0U2VjcyAgICA9IChjdXJyT2Zmc2V0IC0gYmFzZU9mZnNldCkgKiA2MDsgLy8gb2Zmc2V0RGlmZiBpcyBpbiBtaW51dGVzIHRvIHN0YXJ0IHdpdGhcclxuICBjb25zdCBiYXNlRGF0ZVNlY3MgID0gYmFzZWRhdGUuZ2V0VGltZSgpIC8gMTAwMDsgLy8gZ2V0IHJpZCBvZiBtc1xyXG4gIGNvbnN0IGN1cnJkYXRlU2VjcyAgPSBjdXJyZGF0ZS5nZXRUaW1lKCkgLyAxMDAwOyAvLyBnZXQgcmlkIG9mIG1zXHJcbiAgY29uc3Qgc2FzRGF0ZXRpbWUgICA9IE1hdGgucm91bmQoY3VycmRhdGVTZWNzIC0gYmFzZURhdGVTZWNzIC0gb2Zmc2V0U2Vjcyk7IC8vIGFkanVzdFxyXG5cclxuICByZXR1cm4gc2FzRGF0ZXRpbWU7XHJcbn07XHJcbiJdfQ==
