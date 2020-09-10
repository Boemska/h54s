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
h54s.version = '2.2.0';


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

if (window.NodeList && !NodeList.prototype.forEach) {
   NodeList.prototype.forEach = Array.prototype.forEach;
}
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
    patch: function(url, data, multipartFormData, headers) {
      let payload = data;
      if(typeof data === 'object') {
        if(multipartFormData) {
          payload = createMultipartFormDataPayload(data);
        }
      }
      return xhr('PATCH', url, payload, multipartFormData, headers);
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
		if (res.status === 449 || (res.status === 403 && (res.responseText.includes('_csrf') || res.getResponseHeader('X-Forbidden-Reason') === 'CSRF') && (_csrf = res.getResponseHeader(res.getResponseHeader('X-CSRF-HEADER'))))) {
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

/**
 Updates file Metadata 
 * @param {String} fileName - Name of the file being updated
 * @param {String} lastModified - the last-modified header string that matches that of file being updated
 * @param {Object | Blob} dataObj - objects containing the fields that are being changed
 * @param {Object} options - Options object for managedRequest
 */
module.exports.updateFileMetadata = function (itemUri, dataObj, lastModified, options) {
  let headers = {
    'Content-Type':'application/vnd.sas.file+json',
		'If-Unmodified-Since': lastModified
  }
  const isBlob = dataObj instanceof Blob
  const useMultipartFormData = !isBlob // set useMultipartFormData to true if dataObj is not Blob
  
  const optionsObj = Object.assign({}, options, {
    params: dataObj,
    headers,
    useMultipartFormData
  })

  return this.managedRequest('patch', itemUri, optionsObj);
}

/**
 * Updates folder info
 * @param {String} folderUri - uri of the folder that is being changed
 * @param {String} lastModified - the last-modified header string that matches that of the folder being updated
 * @param {Object | Blob} dataObj - object thats is either the whole folder or partial data
 * @param {Object} options - Options object for managedRequest
 */
module.exports.updateFolderMetadata = function (folderUri, dataObj, lastModified, options) {

  /**
    @constant {Boolean} partialData - indicates wether dataObj containts all the data that needs to be send to the server
    or partial data which contatins only the fields that need to be updated, in which case a call needs to be made to the server for 
    the rest of the data before the update can be done
   */
  const {partialData} = options;

  const headers = {
    'Content-Type': "application/vnd.sas.content.folder+json",
    'If-Unmodified-Since': lastModified,
  }

  if (partialData) {

    const _callback = (err, res) => {
      if (res) {

        const folder = Object.assign({}, res.body, dataObj);

        let forBlob = JSON.stringify(folder);
        let data = new Blob([forBlob], {type: "octet/stream"});

        const optionsObj = Object.assign({}, options, {
          params: data,
          headers,
          useMultipartFormData : false,
        })

        return this.managedRequest('put', folderUri, optionsObj);
      }
      
      return options.callback(err);
    }
    const getOptionsObj = Object.assign({}, options, {
      headers: {'Content-Type': "application/vnd.sas.content.folder+json"},
      callback: _callback
    })

    return this.managedRequest('get', folderUri, getOptionsObj);
  }
  else {
    if ( !(dataObj instanceof Blob)) {
      let forBlob = JSON.stringify(dataObj);
      dataObj = new Blob([forBlob], {type: "octet/stream"});
    }

    const optionsObj = Object.assign({}, options, {
      params: dataObj,
      headers,
      useMultipartFormData : false,
    })
    return this.managedRequest('put', folderUri, optionsObj);
  }
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

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvZmlsZXMvaW5kZXguanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9pbmRleC5qcyIsInNyYy9tZXRob2RzL3V0aWxzLmpzIiwic3JjL3Nhc0RhdGEuanMiLCJzcmMvdGFibGVzL2luZGV4LmpzIiwic3JjL3RhYmxlcy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbDhCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOVNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDelFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvKlxuKiBoNTRzIGVycm9yIGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gRXJyb3IgdHlwZVxuKkBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlIC0gRXJyb3IgbWVzc2FnZVxuKkBwYXJhbSB7c3RyaW5nfSBzdGF0dXMgLSBFcnJvciBzdGF0dXMgcmV0dXJuZWQgZnJvbSBTQVNcbipcbiovXG5mdW5jdGlvbiBoNTRzRXJyb3IodHlwZSwgbWVzc2FnZSwgc3RhdHVzKSB7XG4gIGlmKEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKSB7XG4gICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcyk7XG4gIH1cbiAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgdGhpcy50eXBlICAgID0gdHlwZTtcbiAgdGhpcy5zdGF0dXMgID0gc3RhdHVzO1xufVxuXG5oNTRzRXJyb3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShFcnJvci5wcm90b3R5cGUsIHtcbiAgY29uc3RydWN0b3I6IHtcbiAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICB2YWx1ZTogaDU0c0Vycm9yXG4gIH0sXG4gIG5hbWU6IHtcbiAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICB2YWx1ZTogJ2g1NHNFcnJvcidcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gaDU0c0Vycm9yO1xuIiwiY29uc3QgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcblxuLyoqXG4qIGg1NHMgU0FTIEZpbGVzIG9iamVjdCBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge2ZpbGV9IGZpbGUgLSBGaWxlIGFkZGVkIHdoZW4gb2JqZWN0IGlzIGNyZWF0ZWRcbipAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gbWFjcm8gbmFtZVxuKlxuKi9cbmZ1bmN0aW9uIEZpbGVzKGZpbGUsIG1hY3JvTmFtZSkge1xuICB0aGlzLl9maWxlcyA9IHt9O1xuXG4gIEZpbGVzLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCBmaWxlLCBtYWNyb05hbWUpO1xufVxuXG4vKipcbiogQWRkIGZpbGUgdG8gZmlsZXMgb2JqZWN0XG4qIEBwYXJhbSB7ZmlsZX0gZmlsZSAtIEluc3RhbmNlIG9mIEphdmFTY3JpcHQgRmlsZSBvYmplY3RcbiogQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIFNhcyBtYWNybyBuYW1lXG4qXG4qL1xuRmlsZXMucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKGZpbGUsIG1hY3JvTmFtZSkge1xuICBpZihmaWxlICYmIG1hY3JvTmFtZSkge1xuICAgIGlmKCEoZmlsZSBpbnN0YW5jZW9mIEZpbGUgfHwgZmlsZSBpbnN0YW5jZW9mIEJsb2IpKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgaW5zdGFuY2Ugb2YgRmlsZSBvYmplY3QnKTtcbiAgICB9XG4gICAgaWYodHlwZW9mIG1hY3JvTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XG4gICAgfVxuICAgIGlmKCFpc05hTihtYWNyb05hbWVbbWFjcm9OYW1lLmxlbmd0aCAtIDFdKSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNYWNybyBuYW1lIGNhbm5vdCBoYXZlIG51bWJlciBhdCB0aGUgZW5kJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBhcmd1bWVudHMnKTtcbiAgfVxuXG4gIHRoaXMuX2ZpbGVzW21hY3JvTmFtZV0gPSBbXG4gICAgJ0ZJTEUnLFxuICAgIGZpbGVcbiAgXTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRmlsZXM7XG4iLCJjb25zdCBoNTRzRXJyb3IgPSByZXF1aXJlKCcuL2Vycm9yLmpzJyk7XG5cbmNvbnN0IHNhc1ZlcnNpb25NYXAgPSB7XG5cdHY5OiB7XG4gICAgdXJsOiAnL1NBU1N0b3JlZFByb2Nlc3MvZG8nLFxuICAgIGxvZ2luVXJsOiAnL1NBU0xvZ29uL2xvZ2luJyxcblx0XHRsb2dvdXRVcmw6ICcvU0FTU3RvcmVkUHJvY2Vzcy9kbz9fYWN0aW9uPWxvZ29mZicsXG4gICAgUkVTVEF1dGhMb2dpblVybDogJy9TQVNMb2dvbi92MS90aWNrZXRzJ1xuXHR9LFxuXHR2aXlhOiB7XG5cdFx0dXJsOiAnL1NBU0pvYkV4ZWN1dGlvbi8nLFxuICAgIGxvZ2luVXJsOiAnL1NBU0xvZ29uL2xvZ2luLmRvJyxcblx0XHRsb2dvdXRVcmw6ICcvU0FTTG9nb24vbG9nb3V0LmRvPycsXG4gICAgUkVTVEF1dGhMb2dpblVybDogJydcblx0fVxufVxuXG4vKipcbipcbiogQGNvbnN0cnVjdG9yXG4qIEBwYXJhbSB7T2JqZWN0fSBjb25maWcgLSBDb25maWd1cmF0aW9uIG9iamVjdCBmb3IgdGhlIEg1NFMgU0FTIEFkYXB0ZXJcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5zYXNWZXJzaW9uIC0gVmVyc2lvbiBvZiBTQVMsIGVpdGhlciAndjknIG9yICd2aXlhJ1xuKiBAcGFyYW0ge0Jvb2xlYW59IGNvbmZpZy5kZWJ1ZyAtIFdoZXRoZXIgZGVidWcgbW9kZSBpcyBlbmFibGVkLCBzZXRzIF9kZWJ1Zz0xMzFcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5tZXRhZGF0YVJvb3QgLSBCYXNlIHBhdGggb2YgYWxsIHByb2plY3Qgc2VydmljZXMgdG8gYmUgcHJlcGVuZGVkIHRvIF9wcm9ncmFtIHBhdGhcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy51cmwgLSBVUkkgb2YgdGhlIGpvYiBleGVjdXRvciAtIFNQV0Egb3IgSkVTXG4qIEBwYXJhbSB7U3RyaW5nfSBjb25maWcubG9naW5VcmwgLSBVUkkgb2YgdGhlIFNBU0xvZ29uIHdlYiBsb2dpbiBwYXRoIC0gb3ZlcnJpZGRlbiBieSBmb3JtIGFjdGlvblxuKiBAcGFyYW0ge1N0cmluZ30gY29uZmlnLmxvZ291dFVybCAtIFVSSSBvZiB0aGUgbG9nb3V0IGFjdGlvblxuKiBAcGFyYW0ge1N0cmluZ30gY29uZmlnLlJFU1RhdXRoIC0gQm9vbGVhbiB0byB0b2dnbGUgdXNlIG9mIFJFU1QgYXV0aGVudGljYXRpb24gaW4gU0FTIHY5XG4qIEBwYXJhbSB7U3RyaW5nfSBjb25maWcuUkVTVGF1dGhMb2dpblVybCAtIEFkZHJlc3Mgb2YgU0FTTG9nb24gdGlja2V0cyBlbmRwb2ludCBmb3IgUkVTVCBhdXRoXG4qIEBwYXJhbSB7Qm9vbGVhbn0gY29uZmlnLnJldHJ5QWZ0ZXJMb2dpbiAtIFdoZXRoZXIgdG8gcmVzdW1lIHJlcXVlc3RzIHdoaWNoIHdlcmUgcGFya2VkIHdpdGggbG9naW4gcmVkaXJlY3QgYWZ0ZXIgYSBzdWNjZXNzZnVsIHJlLWxvZ2luXG4qIEBwYXJhbSB7TnVtYmVyfSBjb25maWcubWF4WGhyUmV0cmllcyAtIElmIGEgcHJvZ3JhbSBjYWxsIGZhaWxzLCBhdHRlbXB0IHRvIGNhbGwgaXQgYWdhaW4gTiB0aW1lcyB1bnRpbCBpdCBzdWNjZWVkc1xuKiBAcGFyYW0ge051bWJlcn0gY29uZmlnLmFqYXhUaW1lb3V0IC0gTnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byB3YWl0IGZvciBhIHJlc3BvbnNlIGJlZm9yZSBjbG9zaW5nIHRoZSByZXF1ZXN0XG4qIEBwYXJhbSB7Qm9vbGVhbn0gY29uZmlnLnVzZU11bHRpcGFydEZvcm1EYXRhIC0gV2hldGhlciB0byB1c2UgbXVsdGlwYXJ0IGZvciBQT1NUIC0gZm9yIGxlZ2FjeSBiYWNrZW5kIHN1cHBvcnRcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5jc3JmIC0gQ1NSRiB0b2tlbiBmb3IgSkVTXG4qIEBcbipcbiovXG5jb25zdCBoNTRzID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihjb25maWcpIHtcbiAgLy8gRGVmYXVsdCBjb25maWcgdmFsdWVzLCBvdmVycmlkZGVuIGJ5IGFueXRoaW5nIGluIHRoZSBjb25maWcgb2JqZWN0XG5cdHRoaXMuc2FzVmVyc2lvbiAgICAgICAgICAgPSAoY29uZmlnICYmIGNvbmZpZy5zYXNWZXJzaW9uKSB8fCAndjknIC8vdXNlIHY5IGFzIGRlZmF1bHQ9XG4gIHRoaXMuZGVidWcgICAgICAgICAgICAgICAgPSAoY29uZmlnICYmIGNvbmZpZy5kZWJ1ZykgfHwgZmFsc2U7XG4gIHRoaXMubWV0YWRhdGFSb290XHRcdFx0XHRcdD0gKGNvbmZpZyAmJiBjb25maWcubWV0YWRhdGFSb290KSB8fCAnJztcbiAgdGhpcy51cmwgICAgICAgICAgICAgICAgICA9IHNhc1ZlcnNpb25NYXBbdGhpcy5zYXNWZXJzaW9uXS51cmw7XG4gIHRoaXMubG9naW5VcmwgICAgICAgICAgICAgPSBzYXNWZXJzaW9uTWFwW3RoaXMuc2FzVmVyc2lvbl0ubG9naW5Vcmw7XG4gIHRoaXMubG9nb3V0VXJsICAgICAgICAgICAgPSBzYXNWZXJzaW9uTWFwW3RoaXMuc2FzVmVyc2lvbl0ubG9nb3V0VXJsO1xuICB0aGlzLlJFU1RhdXRoICAgICAgICAgICAgID0gZmFsc2U7XG4gIHRoaXMuUkVTVGF1dGhMb2dpblVybCAgICAgPSBzYXNWZXJzaW9uTWFwW3RoaXMuc2FzVmVyc2lvbl0uUkVTVEF1dGhMb2dpblVybDtcbiAgdGhpcy5yZXRyeUFmdGVyTG9naW4gICAgICA9IHRydWU7XG4gIHRoaXMubWF4WGhyUmV0cmllcyAgICAgICAgPSA1O1xuICB0aGlzLmFqYXhUaW1lb3V0ICAgICAgICAgID0gKGNvbmZpZyAmJiBjb25maWcuYWpheFRpbWVvdXQpIHx8IDMwMDAwMDtcbiAgdGhpcy51c2VNdWx0aXBhcnRGb3JtRGF0YSA9IChjb25maWcgJiYgY29uZmlnLnVzZU11bHRpcGFydEZvcm1EYXRhKSB8fCB0cnVlO1xuICB0aGlzLmNzcmYgICAgICAgICAgICAgICAgID0gJydcbiAgdGhpcy5pc1ZpeWFcdFx0XHRcdFx0XHRcdFx0PSB0aGlzLnNhc1ZlcnNpb24gPT09ICd2aXlhJztcblxuICAvLyBJbml0aWFsaXNpbmcgY2FsbGJhY2sgc3RhY2tzIGZvciB3aGVuIGF1dGhlbnRpY2F0aW9uIGlzIHBhdXNlZFxuICB0aGlzLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcyA9IFtdO1xuICB0aGlzLl9wZW5kaW5nQ2FsbHMgPSBbXTtcbiAgdGhpcy5fY3VzdG9tUGVuZGluZ0NhbGxzID0gW107XG4gIHRoaXMuX2Rpc2FibGVDYWxscyA9IGZhbHNlXG4gIHRoaXMuX2FqYXggPSByZXF1aXJlKCcuL21ldGhvZHMvYWpheC5qcycpKCk7XG5cbiAgX3NldENvbmZpZy5jYWxsKHRoaXMsIGNvbmZpZyk7XG5cbiAgLy8gSWYgdGhpcyBpbnN0YW5jZSB3YXMgZGVwbG95ZWQgd2l0aCBhIHN0YW5kYWxvbmUgY29uZmlnIGV4dGVybmFsIHRvIHRoZSBidWlsZCB1c2UgdGhhdFxuICBpZihjb25maWcgJiYgY29uZmlnLmlzUmVtb3RlQ29uZmlnKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICB0aGlzLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xuXG4gICAgLy8gJ2g1NHNDb25maWcuanNvbicgaXMgZm9yIHRoZSB0ZXN0aW5nIHdpdGgga2FybWFcbiAgICAvL3JlcGxhY2VkIGJ5IGd1bHAgaW4gZGV2IGJ1aWxkIChkZWZpbmVkIGluIGd1bHBmaWxlIHVuZGVyIHByb3hpZXMpXG4gICAgdGhpcy5fYWpheC5nZXQoJ2g1NHNDb25maWcuanNvbicpLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgICBjb25zdCByZW1vdGVDb25maWcgPSBKU09OLnBhcnNlKHJlcy5yZXNwb25zZVRleHQpXG5cblx0XHRcdC8vIFNhdmUgbG9jYWwgY29uZmlnIGJlZm9yZSB1cGRhdGluZyBpdCB3aXRoIHJlbW90ZSBjb25maWdcblx0XHRcdGNvbnN0IGxvY2FsQ29uZmlnID0gT2JqZWN0LmFzc2lnbih7fSwgY29uZmlnKVxuXHRcdFx0Y29uc3Qgb2xkTWV0YWRhdGFSb290ID0gbG9jYWxDb25maWcubWV0YWRhdGFSb290O1xuXG4gICAgICBmb3IobGV0IGtleSBpbiByZW1vdGVDb25maWcpIHtcbiAgICAgICAgaWYocmVtb3RlQ29uZmlnLmhhc093blByb3BlcnR5KGtleSkgJiYga2V5ICE9PSAnaXNSZW1vdGVDb25maWcnKSB7XG4gICAgICAgICAgY29uZmlnW2tleV0gPSByZW1vdGVDb25maWdba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBfc2V0Q29uZmlnLmNhbGwoc2VsZiwgY29uZmlnKTtcblxuICAgICAgLy8gRXhlY3V0ZSBjYWxsYmFja3Mgd2hlbiBvdmVycmlkZXMgZnJvbSByZW1vdGUgY29uZmlnIGFyZSBhcHBsaWVkXG4gICAgICBmb3IobGV0IGkgPSAwLCBuID0gc2VsZi5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGZuID0gc2VsZi5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3NbaV07XG4gICAgICAgIGZuKCk7XG4gICAgICB9XG5cbiAgICAgIC8vIEV4ZWN1dGUgc2FzIGNhbGxzIGRpc2FibGVkIHdoaWxlIHdhaXRpbmcgZm9yIHRoZSBjb25maWdcbiAgICAgIHNlbGYuX2Rpc2FibGVDYWxscyA9IGZhbHNlO1xuICAgICAgd2hpbGUoc2VsZi5fcGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgcGVuZGluZ0NhbGwgPSBzZWxmLl9wZW5kaW5nQ2FsbHMuc2hpZnQoKTtcblx0XHRcdFx0Y29uc3Qgc2FzUHJvZ3JhbSA9IHBlbmRpbmdDYWxsLm9wdGlvbnMuc2FzUHJvZ3JhbTtcblx0XHRcdFx0Y29uc3QgY2FsbGJhY2tQZW5kaW5nID0gcGVuZGluZ0NhbGwub3B0aW9ucy5jYWxsYmFjaztcblx0XHRcdFx0Y29uc3QgcGFyYW1zID0gcGVuZGluZ0NhbGwucGFyYW1zO1xuXHRcdFx0XHQvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblxuICAgICAgICAvLyBVcGRhdGUgcHJvZ3JhbSBwYXRoIHdpdGggbWV0YWRhdGFSb290IGlmIGl0J3Mgbm90IHNldFxuICAgICAgICBpZihzZWxmLm1ldGFkYXRhUm9vdCAmJiBwYXJhbXMuX3Byb2dyYW0uaW5kZXhPZihzZWxmLm1ldGFkYXRhUm9vdCkgPT09IC0xKSB7XG4gICAgICAgICAgcGFyYW1zLl9wcm9ncmFtID0gc2VsZi5tZXRhZGF0YVJvb3QucmVwbGFjZSgvXFwvPyQvLCAnLycpICsgcGFyYW1zLl9wcm9ncmFtLnJlcGxhY2Uob2xkTWV0YWRhdGFSb290LCAnJykucmVwbGFjZSgvXlxcLy8sICcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG4gICAgICAgIHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblxuICAgICAgICBzZWxmLmNhbGwoc2FzUHJvZ3JhbSwgbnVsbCwgY2FsbGJhY2tQZW5kaW5nLCBwYXJhbXMpO1xuICAgICAgfVxuXG4gICAgICAvLyBFeGVjdXRlIGN1c3RvbSBjYWxscyB0aGF0IHdlIG1hZGUgd2hpbGUgd2FpdGluZiBmb3IgdGhlIGNvbmZpZ1xuICAgICAgIHdoaWxlKHNlbGYuX2N1c3RvbVBlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG4gICAgICBcdGNvbnN0IHBlbmRpbmdDYWxsID0gc2VsZi5fY3VzdG9tUGVuZGluZ0NhbGxzLnNoaWZ0KClcblx0XHRcdFx0Y29uc3QgY2FsbE1ldGhvZCA9IHBlbmRpbmdDYWxsLmNhbGxNZXRob2Rcblx0XHRcdFx0Y29uc3QgX3VybCA9IHBlbmRpbmdDYWxsLl91cmxcblx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHBlbmRpbmdDYWxsLm9wdGlvbnM7XG4gICAgICAgIC8vL3VwZGF0ZSBwcm9ncmFtIHdpdGggbWV0YWRhdGFSb290IGlmIGl0J3Mgbm90IHNldFxuICAgICAgICBpZihzZWxmLm1ldGFkYXRhUm9vdCAmJiBvcHRpb25zLnBhcmFtcyAmJiBvcHRpb25zLnBhcmFtcy5fcHJvZ3JhbS5pbmRleE9mKHNlbGYubWV0YWRhdGFSb290KSA9PT0gLTEpIHtcbiAgICAgICAgICBvcHRpb25zLnBhcmFtcy5fcHJvZ3JhbSA9IHNlbGYubWV0YWRhdGFSb290LnJlcGxhY2UoL1xcLz8kLywgJy8nKSArIG9wdGlvbnMucGFyYW1zLl9wcm9ncmFtLnJlcGxhY2Uob2xkTWV0YWRhdGFSb290LCAnJykucmVwbGFjZSgvXlxcLy8sICcnKTtcbiAgICAgICAgfVxuICAgICAgICAvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IGFsc28gbWF5IGhhdmUgY2hhbmdlZCBmcm9tIHJlbW90ZUNvbmZpZ1xuXHRcdFx0XHRpZiAob3B0aW9ucy5wYXJhbXMpIHtcblx0XHRcdFx0XHRvcHRpb25zLnBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWxmLm1hbmFnZWRSZXF1ZXN0KGNhbGxNZXRob2QsIF91cmwsIG9wdGlvbnMpO1xuICAgICAgfVxuICAgIH0pLmVycm9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FqYXhFcnJvcicsICdSZW1vdGUgY29uZmlnIGZpbGUgY2Fubm90IGJlIGxvYWRlZC4gSHR0cCBzdGF0dXMgY29kZTogJyArIGVyci5zdGF0dXMpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gcHJpdmF0ZSBmdW5jdGlvbiB0byBzZXQgaDU0cyBpbnN0YW5jZSBwcm9wZXJ0aWVzXG4gIGZ1bmN0aW9uIF9zZXRDb25maWcoY29uZmlnKSB7XG4gICAgaWYoIWNvbmZpZykge1xuICAgICAgdGhpcy5fYWpheC5zZXRUaW1lb3V0KHRoaXMuYWpheFRpbWVvdXQpO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZih0eXBlb2YgY29uZmlnICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBwYXJhbWV0ZXIgc2hvdWxkIGJlIGNvbmZpZyBvYmplY3QnKTtcbiAgICB9XG5cbiAgICAvL21lcmdlIGNvbmZpZyBvYmplY3QgZnJvbSBwYXJhbWV0ZXIgd2l0aCB0aGlzXG4gICAgZm9yKGxldCBrZXkgaW4gY29uZmlnKSB7XG4gICAgICBpZihjb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICBpZigoa2V5ID09PSAndXJsJyB8fCBrZXkgPT09ICdsb2dpblVybCcpICYmIGNvbmZpZ1trZXldLmNoYXJBdCgwKSAhPT0gJy8nKSB7XG4gICAgICAgICAgY29uZmlnW2tleV0gPSAnLycgKyBjb25maWdba2V5XTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzW2tleV0gPSBjb25maWdba2V5XTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL2lmIHNlcnZlciBpcyByZW1vdGUgdXNlIHRoZSBmdWxsIHNlcnZlciB1cmxcbiAgICAvL05PVEU6IFRoaXMgcmVxdWlyZXMgQ09SUyBhbmQgaXMgaGVyZSBmb3IgbGVnYWN5IHN1cHBvcnRcbiAgICBpZihjb25maWcuaG9zdFVybCkge1xuICAgICAgaWYoY29uZmlnLmhvc3RVcmwuY2hhckF0KGNvbmZpZy5ob3N0VXJsLmxlbmd0aCAtIDEpID09PSAnLycpIHtcbiAgICAgICAgY29uZmlnLmhvc3RVcmwgPSBjb25maWcuaG9zdFVybC5zbGljZSgwLCAtMSk7XG4gICAgICB9XG4gICAgICB0aGlzLmhvc3RVcmwgPSBjb25maWcuaG9zdFVybDtcbiAgICAgIGlmICghdGhpcy51cmwuaW5jbHVkZXModGhpcy5ob3N0VXJsKSkge1xuXHRcdFx0XHR0aGlzLnVybCA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy51cmw7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMubG9naW5VcmwuaW5jbHVkZXModGhpcy5ob3N0VXJsKSkge1xuXHRcdFx0XHR0aGlzLmxvZ2luVXJsID0gY29uZmlnLmhvc3RVcmwgKyB0aGlzLmxvZ2luVXJsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLlJFU1RhdXRoTG9naW5VcmwuaW5jbHVkZXModGhpcy5ob3N0VXJsKSkge1xuXHRcdFx0XHR0aGlzLlJFU1RhdXRoTG9naW5VcmwgPSBjb25maWcuaG9zdFVybCArIHRoaXMuUkVTVGF1dGhMb2dpblVybDtcblx0XHRcdH1cbiAgICB9XG5cbiAgICB0aGlzLl9hamF4LnNldFRpbWVvdXQodGhpcy5hamF4VGltZW91dCk7XG4gIH1cbn07XG5cbi8vIHJlcGxhY2VkIGJ5IGd1bHAgd2l0aCByZWFsIHZlcnNpb24gYXQgYnVpbGQgdGltZVxuaDU0cy52ZXJzaW9uID0gJ19fdmVyc2lvbl9fJztcblxuXG5oNTRzLnByb3RvdHlwZSA9IHJlcXVpcmUoJy4vbWV0aG9kcycpO1xuXG5oNTRzLlRhYmxlcyA9IHJlcXVpcmUoJy4vdGFibGVzJyk7XG5oNTRzLkZpbGVzID0gcmVxdWlyZSgnLi9maWxlcycpO1xuaDU0cy5TYXNEYXRhID0gcmVxdWlyZSgnLi9zYXNEYXRhLmpzJyk7XG5cbmg1NHMuZnJvbVNhc0RhdGVUaW1lID0gcmVxdWlyZSgnLi9tZXRob2RzL3V0aWxzLmpzJykuZnJvbVNhc0RhdGVUaW1lO1xuaDU0cy50b1Nhc0RhdGVUaW1lID0gcmVxdWlyZSgnLi90YWJsZXMvdXRpbHMuanMnKS50b1Nhc0RhdGVUaW1lO1xuXG4vL3NlbGYgaW52b2tlZCBmdW5jdGlvbiBtb2R1bGVcbnJlcXVpcmUoJy4vaWVfcG9seWZpbGxzLmpzJyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIU9iamVjdC5jcmVhdGUpIHtcbiAgICBPYmplY3QuY3JlYXRlID0gZnVuY3Rpb24ocHJvdG8sIHByb3BzKSB7XG4gICAgICBpZiAodHlwZW9mIHByb3BzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIHRocm93IFwiVGhlIG11bHRpcGxlLWFyZ3VtZW50IHZlcnNpb24gb2YgT2JqZWN0LmNyZWF0ZSBpcyBub3QgcHJvdmlkZWQgYnkgdGhpcyBicm93c2VyIGFuZCBjYW5ub3QgYmUgc2hpbW1lZC5cIjtcbiAgICAgIH1cbiAgICAgIGZ1bmN0aW9uIGN0b3IoKSB7IH1cbiAgICAgIGN0b3IucHJvdG90eXBlID0gcHJvdG87XG4gICAgICByZXR1cm4gbmV3IGN0b3IoKTtcbiAgICB9O1xuICB9XG5cblxuICAvLyBGcm9tIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL09iamVjdC9rZXlzXG4gIGlmICghT2JqZWN0LmtleXMpIHtcbiAgICBPYmplY3Qua2V5cyA9IChmdW5jdGlvbiAoKSB7XG4gICAgICAndXNlIHN0cmljdCc7XG4gICAgICB2YXIgaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LFxuICAgICAgICAgIGhhc0RvbnRFbnVtQnVnID0gISh7dG9TdHJpbmc6IG51bGx9KS5wcm9wZXJ0eUlzRW51bWVyYWJsZSgndG9TdHJpbmcnKSxcbiAgICAgICAgICBkb250RW51bXMgPSBbXG4gICAgICAgICAgICAndG9TdHJpbmcnLFxuICAgICAgICAgICAgJ3RvTG9jYWxlU3RyaW5nJyxcbiAgICAgICAgICAgICd2YWx1ZU9mJyxcbiAgICAgICAgICAgICdoYXNPd25Qcm9wZXJ0eScsXG4gICAgICAgICAgICAnaXNQcm90b3R5cGVPZicsXG4gICAgICAgICAgICAncHJvcGVydHlJc0VudW1lcmFibGUnLFxuICAgICAgICAgICAgJ2NvbnN0cnVjdG9yJ1xuICAgICAgICAgIF0sXG4gICAgICAgICAgZG9udEVudW1zTGVuZ3RoID0gZG9udEVudW1zLmxlbmd0aDtcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChvYmopIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnICYmICh0eXBlb2Ygb2JqICE9PSAnZnVuY3Rpb24nIHx8IG9iaiA9PT0gbnVsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdPYmplY3Qua2V5cyBjYWxsZWQgb24gbm9uLW9iamVjdCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdLCBwcm9wLCBpO1xuXG4gICAgICAgIGZvciAocHJvcCBpbiBvYmopIHtcbiAgICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApKSB7XG4gICAgICAgICAgICByZXN1bHQucHVzaChwcm9wKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaGFzRG9udEVudW1CdWcpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZG9udEVudW1zTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgZG9udEVudW1zW2ldKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChkb250RW51bXNbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfTtcbiAgICB9KCkpO1xuICB9XG5cbiAgLy8gRnJvbSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9BcnJheS9sYXN0SW5kZXhPZlxuICBpZiAoIUFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZikge1xuICAgIEFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZiA9IGZ1bmN0aW9uKHNlYXJjaEVsZW1lbnQgLyosIGZyb21JbmRleCovKSB7XG4gICAgICAndXNlIHN0cmljdCc7XG5cbiAgICAgIGlmICh0aGlzID09PSB2b2lkIDAgfHwgdGhpcyA9PT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCk7XG4gICAgICB9XG5cbiAgICAgIHZhciBuLCBrLFxuICAgICAgICB0ID0gT2JqZWN0KHRoaXMpLFxuICAgICAgICBsZW4gPSB0Lmxlbmd0aCA+Pj4gMDtcbiAgICAgIGlmIChsZW4gPT09IDApIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfVxuXG4gICAgICBuID0gbGVuIC0gMTtcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBuID0gTnVtYmVyKGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGlmIChuICE9IG4pIHtcbiAgICAgICAgICBuID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChuICE9PSAwICYmIG4gIT0gKDEgLyAwKSAmJiBuICE9IC0oMSAvIDApKSB7XG4gICAgICAgICAgbiA9IChuID4gMCB8fCAtMSkgKiBNYXRoLmZsb29yKE1hdGguYWJzKG4pKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGsgPSBuID49IDAgPyBNYXRoLm1pbihuLCBsZW4gLSAxKSA6IGxlbiAtIE1hdGguYWJzKG4pOyBrID49IDA7IGstLSkge1xuICAgICAgICBpZiAoayBpbiB0ICYmIHRba10gPT09IHNlYXJjaEVsZW1lbnQpIHtcbiAgICAgICAgICByZXR1cm4gaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG4gIH1cbn0oKTtcblxuaWYgKHdpbmRvdy5Ob2RlTGlzdCAmJiAhTm9kZUxpc3QucHJvdG90eXBlLmZvckVhY2gpIHtcbiAgIE5vZGVMaXN0LnByb3RvdHlwZS5mb3JFYWNoID0gQXJyYXkucHJvdG90eXBlLmZvckVhY2g7XG59IiwiY29uc3QgbG9ncyA9IHtcbiAgYXBwbGljYXRpb25Mb2dzOiBbXSxcbiAgZGVidWdEYXRhOiBbXSxcbiAgc2FzRXJyb3JzOiBbXSxcbiAgZmFpbGVkUmVxdWVzdHM6IFtdXG59O1xuXG5jb25zdCBsaW1pdHMgPSB7XG4gIGFwcGxpY2F0aW9uTG9nczogMTAwLFxuICBkZWJ1Z0RhdGE6IDIwLFxuICBmYWlsZWRSZXF1ZXN0czogMjAsXG4gIHNhc0Vycm9yczogMTAwXG59O1xuXG5tb2R1bGUuZXhwb3J0cy5nZXQgPSB7XG4gIGdldFNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3Muc2FzRXJyb3JzO1xuICB9LFxuICBnZXRBcHBsaWNhdGlvbkxvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmFwcGxpY2F0aW9uTG9ncztcbiAgfSxcbiAgZ2V0RGVidWdEYXRhOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5kZWJ1Z0RhdGE7XG4gIH0sXG4gIGdldEZhaWxlZFJlcXVlc3RzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5mYWlsZWRSZXF1ZXN0cztcbiAgfSxcbiAgZ2V0QWxsTG9nczogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICBzYXNFcnJvcnM6IGxvZ3Muc2FzRXJyb3JzLFxuICAgICAgYXBwbGljYXRpb25Mb2dzOiBsb2dzLmFwcGxpY2F0aW9uTG9ncyxcbiAgICAgIGRlYnVnRGF0YTogbG9ncy5kZWJ1Z0RhdGEsXG4gICAgICBmYWlsZWRSZXF1ZXN0czogbG9ncy5mYWlsZWRSZXF1ZXN0c1xuICAgIH1cbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMuY2xlYXIgPSB7XG4gIGNsZWFyQXBwbGljYXRpb25Mb2dzOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5zcGxpY2UoMCwgbG9ncy5hcHBsaWNhdGlvbkxvZ3MubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJEZWJ1Z0RhdGE6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNwbGljZSgwLCBsb2dzLmRlYnVnRGF0YS5sZW5ndGgpO1xuICB9LFxuICBjbGVhclNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5zYXNFcnJvcnMuc3BsaWNlKDAsIGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyRmFpbGVkUmVxdWVzdHM6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZmFpbGVkUmVxdWVzdHMuc3BsaWNlKDAsIGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJBbGxMb2dzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNsZWFyQXBwbGljYXRpb25Mb2dzKCk7XG4gICAgdGhpcy5jbGVhckRlYnVnRGF0YSgpO1xuICAgIHRoaXMuY2xlYXJTYXNFcnJvcnMoKTtcbiAgICB0aGlzLmNsZWFyRmFpbGVkUmVxdWVzdHMoKTtcbiAgfVxufTtcblxuLyoqXG4qICBBZGRzIGFwcGxpY2F0aW9uIGxvZ3MgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSAtIE1lc3NhZ2UgdG8gYWRkIHRvIGFwcGxpY2F0aW9uTG9nc1xuKiBAcGFyYW0ge1N0cmluZ30gc2FzUHJvZ3JhbSAtIEhlYWRlciAtIHdoaWNoIHJlcXVlc3QgZGlkIG1lc3NhZ2UgY29tZSBmcm9tXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkQXBwbGljYXRpb25Mb2cgPSBmdW5jdGlvbihtZXNzYWdlLCBzYXNQcm9ncmFtKSB7XG4gIGlmKG1lc3NhZ2UgPT09ICdibGFuaycpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgbG9nID0ge1xuICAgIG1lc3NhZ2U6ICAgIG1lc3NhZ2UsXG4gICAgdGltZTogICAgICAgbmV3IERhdGUoKSxcbiAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtXG4gIH07XG4gIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnB1c2gobG9nKTtcblxuICBpZihsb2dzLmFwcGxpY2F0aW9uTG9ncy5sZW5ndGggPiBsaW1pdHMuYXBwbGljYXRpb25Mb2dzKSB7XG4gICAgbG9ncy5hcHBsaWNhdGlvbkxvZ3Muc2hpZnQoKTtcbiAgfVxufTtcblxuLyoqXG4qIEFkZHMgZGVidWcgZGF0YSB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7U3RyaW5nfSBodG1sRGF0YSAtIEZ1bGwgaHRtbCBsb2cgZnJvbSBleGVjdXRvclxuKiBAcGFyYW0ge1N0cmluZ30gZGVidWdUZXh0IC0gRGVidWcgdGV4dCB0aGF0IGNhbWUgYWZ0ZXIgZGF0YSBvdXRwdXRcbiogQHBhcmFtIHtTdHJpbmd9IHNhc1Byb2dyYW0gLSBXaGljaCBwcm9ncmFtIHJlcXVlc3QgZGlkIG1lc3NhZ2UgY29tZSBmcm9tXG4qIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMgLSBXZWIgYXBwIHBhcmFtcyB0aGF0IHdlcmUgcmVjZWl2ZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGREZWJ1Z0RhdGEgPSBmdW5jdGlvbihodG1sRGF0YSwgZGVidWdUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgbG9ncy5kZWJ1Z0RhdGEucHVzaCh7XG4gICAgZGVidWdIdG1sOiAgaHRtbERhdGEsXG4gICAgZGVidWdUZXh0OiAgZGVidWdUZXh0LFxuICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgcGFyYW1zOiAgICAgcGFyYW1zLFxuICAgIHRpbWU6ICAgICAgIG5ldyBEYXRlKClcbiAgfSk7XG5cbiAgaWYobG9ncy5kZWJ1Z0RhdGEubGVuZ3RoID4gbGltaXRzLmRlYnVnRGF0YSkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNoaWZ0KCk7XG4gIH1cbn07XG5cbi8qKlxuKiBBZGRzIGZhaWxlZCByZXF1ZXN0cyB0byBhbiBhcnJheSBvZiBmYWlsZWQgcmVxdWVzdCBsb2dzXG4qXG4qIEBwYXJhbSB7U3RyaW5nfSByZXNwb25zZVRleHQgLSBGdWxsIGh0bWwgb3V0cHV0IGZyb20gZXhlY3V0b3JcbiogQHBhcmFtIHtTdHJpbmd9IGRlYnVnVGV4dCAtIERlYnVnIHRleHQgdGhhdCBjYW1lIGFmdGVyIGRhdGEgb3V0cHV0XG4qIEBwYXJhbSB7U3RyaW5nfSBzYXNQcm9ncmFtIC0gV2hpY2ggcHJvZ3JhbSByZXF1ZXN0IGRpZCBtZXNzYWdlIGNvbWUgZnJvbVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEZhaWxlZFJlcXVlc3QgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSkge1xuICBsb2dzLmZhaWxlZFJlcXVlc3RzLnB1c2goe1xuICAgIHJlc3BvbnNlSHRtbDogcmVzcG9uc2VUZXh0LFxuICAgIHJlc3BvbnNlVGV4dDogZGVidWdUZXh0LFxuICAgIHNhc1Byb2dyYW06ICAgc2FzUHJvZ3JhbSxcbiAgICB0aW1lOiAgICAgICAgIG5ldyBEYXRlKClcbiAgfSk7XG5cbiAgLy9tYXggMjAgZmFpbGVkIHJlcXVlc3RzXG4gIGlmKGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoID4gbGltaXRzLmZhaWxlZFJlcXVlc3RzKSB7XG4gICAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5zaGlmdCgpO1xuICB9XG59O1xuXG4vKipcbiogQWRkcyBTQVMgZXJyb3JzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtBcnJheX0gZXJyb3JzIC0gQXJyYXkgb2YgZXJyb3JzIHRvIGNvbmNhdCB0byBtYWluIGxvZ1xuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZFNhc0Vycm9ycyA9IGZ1bmN0aW9uKGVycm9ycykge1xuICBsb2dzLnNhc0Vycm9ycyA9IGxvZ3Muc2FzRXJyb3JzLmNvbmNhdChlcnJvcnMpO1xuXG4gIHdoaWxlKGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCA+IGxpbWl0cy5zYXNFcnJvcnMpIHtcbiAgICBsb2dzLnNhc0Vycm9ycy5zaGlmdCgpO1xuICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG4gIGxldCB0aW1lb3V0ID0gMzAwMDA7XG4gIGxldCB0aW1lb3V0SGFuZGxlO1xuXG4gIGNvbnN0IHhociA9IGZ1bmN0aW9uICh0eXBlLCB1cmwsIGRhdGEsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzID0ge30pIHtcbiAgICBjb25zdCBtZXRob2RzID0ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24gKCkge1xuICAgICAgfSxcbiAgICAgIGVycm9yOiBmdW5jdGlvbiAoKSB7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IFhIUiA9IFhNTEh0dHBSZXF1ZXN0O1xuICAgIGNvbnN0IHJlcXVlc3QgPSBuZXcgWEhSKCdNU1hNTDIuWE1MSFRUUC4zLjAnKTtcblxuICAgIHJlcXVlc3Qub3Blbih0eXBlLCB1cmwsIHRydWUpO1xuXG4gICAgLy9tdWx0aXBhcnQvZm9ybS1kYXRhIGlzIHNldCBhdXRvbWF0aWNhbGx5IHNvIG5vIG5lZWQgZm9yIGVsc2UgYmxvY2tcbiAgICAvLyBDb250ZW50LVR5cGUgaGVhZGVyIGhhcyB0byBiZSBleHBsaWNpdGx5IHNldCB1cFxuICAgIGlmICghbXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICAgIGlmIChoZWFkZXJzWydDb250ZW50LVR5cGUnXSkge1xuICAgICAgICByZXF1ZXN0LnNldFJlcXVlc3RIZWFkZXIoJ0NvbnRlbnQtVHlwZScsIGhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyk7XG4gICAgICB9XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKGhlYWRlcnMpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgIT09ICdDb250ZW50LVR5cGUnKSB7XG4gICAgICAgIHJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcihrZXksIGhlYWRlcnNba2V5XSlcbiAgICAgIH1cbiAgICB9KVxuICAgIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHJlcXVlc3QucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dEhhbmRsZSk7XG4gICAgICAgIGlmIChyZXF1ZXN0LnN0YXR1cyA+PSAyMDAgJiYgcmVxdWVzdC5zdGF0dXMgPCAzMDApIHtcbiAgICAgICAgICBtZXRob2RzLnN1Y2Nlc3MuY2FsbChtZXRob2RzLCByZXF1ZXN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtZXRob2RzLmVycm9yLmNhbGwobWV0aG9kcywgcmVxdWVzdCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgaWYgKHRpbWVvdXQgPiAwKSB7XG4gICAgICB0aW1lb3V0SGFuZGxlID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJlcXVlc3QuYWJvcnQoKTtcbiAgICAgIH0sIHRpbWVvdXQpO1xuICAgIH1cblxuICAgIHJlcXVlc3Quc2VuZChkYXRhKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgbWV0aG9kcy5zdWNjZXNzID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfSxcbiAgICAgIGVycm9yOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgbWV0aG9kcy5lcnJvciA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cbiAgICB9O1xuICB9O1xuXG4gIGNvbnN0IHNlcmlhbGl6ZSA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICBjb25zdCBzdHIgPSBbXTtcbiAgICBmb3IgKGxldCBwIGluIG9iaikge1xuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICBpZiAob2JqW3BdIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXVtpXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF0pKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc3RyLmpvaW4oXCImXCIpO1xuICB9O1xuXG4gIGNvbnN0IGNyZWF0ZU11bHRpcGFydEZvcm1EYXRhUGF5bG9hZCA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICBsZXQgZGF0YSA9IG5ldyBGb3JtRGF0YSgpO1xuICAgIGZvciAobGV0IHAgaW4gb2JqKSB7XG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XG4gICAgICAgIGlmIChvYmpbcF0gaW5zdGFuY2VvZiBBcnJheSAmJiBwICE9PSAnZmlsZScpIHtcbiAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXVtpXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHAgPT09ICdmaWxlJykge1xuICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXVswXSwgb2JqW3BdWzFdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkYXRhLmFwcGVuZChwLCBvYmpbcF0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9O1xuXG4gIHJldHVybiB7XG4gICAgZ2V0OiBmdW5jdGlvbiAodXJsLCBkYXRhLCBtdWx0aXBhcnRGb3JtRGF0YSwgaGVhZGVycykge1xuICAgICAgbGV0IGRhdGFTdHI7XG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGRhdGFTdHIgPSBzZXJpYWxpemUoZGF0YSk7XG4gICAgICB9XG4gICAgICBjb25zdCB1cmxXaXRoUGFyYW1zID0gZGF0YVN0ciA/ICh1cmwgKyAnPycgKyBkYXRhU3RyKSA6IHVybDtcbiAgICAgIHJldHVybiB4aHIoJ0dFVCcsIHVybFdpdGhQYXJhbXMsIG51bGwsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKTtcbiAgICB9LFxuXHRcdHBvc3Q6IGZ1bmN0aW9uKHVybCwgZGF0YSwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMpIHtcbiAgICAgIGxldCBwYXlsb2FkID0gZGF0YTtcbiAgICAgIGlmKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZihtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgICAgICAgIHBheWxvYWQgPSBjcmVhdGVNdWx0aXBhcnRGb3JtRGF0YVBheWxvYWQoZGF0YSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGF5bG9hZCA9IHNlcmlhbGl6ZShkYXRhKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHhocignUE9TVCcsIHVybCwgcGF5bG9hZCwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMpO1xuICAgIH0sXG4gICAgcHV0OiBmdW5jdGlvbih1cmwsIGRhdGEsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKSB7XG4gICAgICBsZXQgcGF5bG9hZCA9IGRhdGE7XG4gICAgICBpZih0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYobXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICAgICAgICBwYXlsb2FkID0gY3JlYXRlTXVsdGlwYXJ0Rm9ybURhdGFQYXlsb2FkKGRhdGEpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4geGhyKCdQVVQnLCB1cmwsIHBheWxvYWQsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKTtcbiAgICB9LFxuXHRcdGRlbGV0ZTogZnVuY3Rpb24odXJsLCBwYXlsb2FkLCBtdWx0aXBhcnRGb3JtRGF0YSwgaGVhZGVycykge1xuICAgIFx0cmV0dXJuIHhocignREVMRVRFJywgdXJsLCBwYXlsb2FkLCBudWxsLCBoZWFkZXJzKTtcbiAgICB9LFxuICAgIHBhdGNoOiBmdW5jdGlvbih1cmwsIGRhdGEsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKSB7XG4gICAgICBsZXQgcGF5bG9hZCA9IGRhdGE7XG4gICAgICBpZih0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYobXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICAgICAgICBwYXlsb2FkID0gY3JlYXRlTXVsdGlwYXJ0Rm9ybURhdGFQYXlsb2FkKGRhdGEpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4geGhyKCdQQVRDSCcsIHVybCwgcGF5bG9hZCwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMpO1xuICAgIH0sXG4gICAgc2V0VGltZW91dDogZnVuY3Rpb24gKHQpIHtcbiAgICAgIHRpbWVvdXQgPSB0O1xuICAgIH0sXG4gICAgc2VyaWFsaXplXG4gIH07XG59O1xuIiwiY29uc3QgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcbmNvbnN0IGxvZ3MgPSByZXF1aXJlKCcuLi9sb2dzLmpzJyk7XG5jb25zdCBUYWJsZXMgPSByZXF1aXJlKCcuLi90YWJsZXMnKTtcbmNvbnN0IFNhc0RhdGEgPSByZXF1aXJlKCcuLi9zYXNEYXRhLmpzJyk7XG5jb25zdCBGaWxlcyA9IHJlcXVpcmUoJy4uL2ZpbGVzJyk7XG5cbi8qKlxuKiBDYWxsIFNhcyBwcm9ncmFtXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gUGF0aCBvZiB0aGUgc2FzIHByb2dyYW1cbiogQHBhcmFtIHtPYmplY3R9IGRhdGFPYmogLSBJbnN0YW5jZSBvZiBUYWJsZXMgb2JqZWN0IHdpdGggZGF0YSBhZGRlZFxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIC0gb2JqZWN0IGNvbnRhaW5pbmcgYWRkaXRpb25hbCBwcm9ncmFtIHBhcmFtZXRlcnNcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5jYWxsID0gZnVuY3Rpb24gKHNhc1Byb2dyYW0sIGRhdGFPYmosIGNhbGxiYWNrLCBwYXJhbXMpIHtcblx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdGxldCByZXRyeUNvdW50ID0gMDtcblx0Y29uc3QgZGJnID0gdGhpcy5kZWJ1Z1xuXHRjb25zdCBjc3JmID0gdGhpcy5jc3JmO1xuXG5cdGlmICghY2FsbGJhY2sgfHwgdHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdZb3UgbXVzdCBwcm92aWRlIGEgY2FsbGJhY2snKTtcblx0fVxuXHRpZiAoIXNhc1Byb2dyYW0pIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgU2FzIHByb2dyYW0gZmlsZSBwYXRoJyk7XG5cdH1cblx0aWYgKHR5cGVvZiBzYXNQcm9ncmFtICE9PSAnc3RyaW5nJykge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgcGFyYW1ldGVyIHNob3VsZCBiZSBzdHJpbmcnKTtcblx0fVxuXHRpZiAodGhpcy51c2VNdWx0aXBhcnRGb3JtRGF0YSA9PT0gZmFsc2UgJiYgIShkYXRhT2JqIGluc3RhbmNlb2YgVGFibGVzKSkge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnQ2Fubm90IHNlbmQgZmlsZXMgdXNpbmcgYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkLiBQbGVhc2UgdXNlIFRhYmxlcyBvciBkZWZhdWx0IHZhbHVlIGZvciB1c2VNdWx0aXBhcnRGb3JtRGF0YScpO1xuXHR9XG5cblx0aWYgKCFwYXJhbXMpIHtcblx0XHRwYXJhbXMgPSB7XG5cdFx0XHRfcHJvZ3JhbTogdGhpcy5fdXRpbHMuZ2V0RnVsbFByb2dyYW1QYXRoKHRoaXMubWV0YWRhdGFSb290LCBzYXNQcm9ncmFtKSxcblx0XHRcdF9kZWJ1ZzogdGhpcy5kZWJ1ZyA/IDEzMSA6IDAsXG5cdFx0XHRfc2VydmljZTogJ2RlZmF1bHQnLFxuXHRcdFx0X2NzcmY6IGNzcmZcblx0XHR9O1xuXHR9IGVsc2Uge1xuXHRcdHBhcmFtcyA9IE9iamVjdC5hc3NpZ24oe30sIHBhcmFtcywge19jc3JmOiBjc3JmfSlcblx0fVxuXG5cdGlmIChkYXRhT2JqKSB7XG5cdFx0bGV0IGtleSwgZGF0YVByb3ZpZGVyO1xuXHRcdGlmIChkYXRhT2JqIGluc3RhbmNlb2YgVGFibGVzKSB7XG5cdFx0XHRkYXRhUHJvdmlkZXIgPSBkYXRhT2JqLl90YWJsZXM7XG5cdFx0fSBlbHNlIGlmIChkYXRhT2JqIGluc3RhbmNlb2YgRmlsZXMgfHwgZGF0YU9iaiBpbnN0YW5jZW9mIFNhc0RhdGEpIHtcblx0XHRcdGRhdGFQcm92aWRlciA9IGRhdGFPYmouX2ZpbGVzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zb2xlLmxvZyhuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1dyb25nIHR5cGUgb2YgdGFibGVzIG9iamVjdCcpKVxuXHRcdH1cblx0XHRmb3IgKGtleSBpbiBkYXRhUHJvdmlkZXIpIHtcblx0XHRcdGlmIChkYXRhUHJvdmlkZXIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHRcdFx0XHRwYXJhbXNba2V5XSA9IGRhdGFQcm92aWRlcltrZXldO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmICh0aGlzLl9kaXNhYmxlQ2FsbHMpIHtcblx0XHR0aGlzLl9wZW5kaW5nQ2FsbHMucHVzaCh7XG5cdFx0XHRwYXJhbXMsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHNhc1Byb2dyYW0sXG5cdFx0XHRcdGRhdGFPYmosXG5cdFx0XHRcdGNhbGxiYWNrXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0dGhpcy5fYWpheC5wb3N0KHRoaXMudXJsLCBwYXJhbXMsIHRoaXMudXNlTXVsdGlwYXJ0Rm9ybURhdGEpLnN1Y2Nlc3MoYXN5bmMgZnVuY3Rpb24gKHJlcykge1xuXHRcdGlmIChzZWxmLl91dGlscy5uZWVkVG9Mb2dpbi5jYWxsKHNlbGYsIHJlcykpIHtcblx0XHRcdC8vcmVtZW1iZXIgdGhlIGNhbGwgZm9yIGxhdHRlciB1c2Vcblx0XHRcdHNlbGYuX3BlbmRpbmdDYWxscy5wdXNoKHtcblx0XHRcdFx0cGFyYW1zLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0c2FzUHJvZ3JhbSxcblx0XHRcdFx0XHRkYXRhT2JqLFxuXHRcdFx0XHRcdGNhbGxiYWNrXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvL3RoZXJlJ3Mgbm8gbmVlZCB0byBjb250aW51ZSBpZiBwcmV2aW91cyBjYWxsIHJldHVybmVkIGxvZ2luIGVycm9yXG5cdFx0XHRpZiAoc2VsZi5fZGlzYWJsZUNhbGxzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlbGYuX2Rpc2FibGVDYWxscyA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ25vdExvZ2dlZGluRXJyb3InLCAnWW91IGFyZSBub3QgbG9nZ2VkIGluJykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgcmVzT2JqLCB1bmVzY2FwZWRSZXNPYmosIGVycjtcblx0XHRcdGxldCBkb25lID0gZmFsc2U7XG5cblx0XHRcdGlmICghZGJnKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmVzT2JqID0gc2VsZi5fdXRpbHMucGFyc2VSZXMocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKTtcblx0XHRcdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKHJlc09iai5sb2dtZXNzYWdlLCBzYXNQcm9ncmFtKTtcblxuXHRcdFx0XHRcdGlmIChkYXRhT2JqIGluc3RhbmNlb2YgVGFibGVzKSB7XG5cdFx0XHRcdFx0XHR1bmVzY2FwZWRSZXNPYmogPSBzZWxmLl91dGlscy51bmVzY2FwZVZhbHVlcyhyZXNPYmopO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR1bmVzY2FwZWRSZXNPYmogPSByZXNPYmo7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHJlc09iai5zdGF0dXMgIT09ICdzdWNjZXNzJykge1xuXHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigncHJvZ3JhbUVycm9yJywgcmVzT2JqLmVycm9ybWVzc2FnZSwgcmVzT2JqLnN0YXR1cyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZG9uZSA9IHRydWU7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB7XG5cdFx0XHRcdFx0XHRpZiAocmV0cnlDb3VudCA8IHNlbGYubWF4WGhyUmV0cmllcykge1xuXHRcdFx0XHRcdFx0XHRkb25lID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdHNlbGYuX2FqYXgucG9zdChzZWxmLnVybCwgcGFyYW1zLCBzZWxmLnVzZU11bHRpcGFydEZvcm1EYXRhKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XG5cdFx0XHRcdFx0XHRcdHJldHJ5Q291bnQrKztcblx0XHRcdFx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhcIlJldHJ5aW5nICNcIiArIHJldHJ5Q291bnQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c2VsZi5fdXRpbHMucGFyc2VFcnJvclJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRcdFx0XHRzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpO1xuXHRcdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcblx0XHRcdFx0XHRcdHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0XHRcdHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRcdFx0ZXJyID0gZTtcblx0XHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdFx0XHRzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Vua25vd25FcnJvcicsIGUubWVzc2FnZSk7XG5cdFx0XHRcdFx0XHRlcnIuc3RhY2sgPSBlLnN0YWNrO1xuXHRcdFx0XHRcdFx0ZG9uZSA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdGlmIChkb25lKSB7XG5cdFx0XHRcdFx0XHRjYWxsYmFjayhlcnIsIHVuZXNjYXBlZFJlc09iaik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJlc09iaiA9IGF3YWl0IHNlbGYuX3V0aWxzLnBhcnNlRGVidWdSZXMocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zLCBzZWxmLmhvc3RVcmwsIHNlbGYuaXNWaXlhKTtcblx0XHRcdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKHJlc09iai5sb2dtZXNzYWdlLCBzYXNQcm9ncmFtKTtcblxuXHRcdFx0XHRcdGlmIChkYXRhT2JqIGluc3RhbmNlb2YgVGFibGVzKSB7XG5cdFx0XHRcdFx0XHR1bmVzY2FwZWRSZXNPYmogPSBzZWxmLl91dGlscy51bmVzY2FwZVZhbHVlcyhyZXNPYmopO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR1bmVzY2FwZWRSZXNPYmogPSByZXNPYmo7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHJlc09iai5zdGF0dXMgIT09ICdzdWNjZXNzJykge1xuXHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigncHJvZ3JhbUVycm9yJywgcmVzT2JqLmVycm9ybWVzc2FnZSwgcmVzT2JqLnN0YXR1cyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZG9uZSA9IHRydWU7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB7XG5cdFx0XHRcdFx0XHRlcnIgPSBuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgZS5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZSBpbnN0YW5jZW9mIGg1NHNFcnJvcikge1xuXHRcdFx0XHRcdFx0aWYgKGUudHlwZSA9PT0gJ3BhcnNlRXJyb3InICYmIHJldHJ5Q291bnQgPCAxKSB7XG5cdFx0XHRcdFx0XHRcdGRvbmUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0c2VsZi5fYWpheC5wb3N0KHNlbGYudXJsLCBwYXJhbXMsIHNlbGYudXNlTXVsdGlwYXJ0Rm9ybURhdGEpLnN1Y2Nlc3ModGhpcy5zdWNjZXNzKS5lcnJvcih0aGlzLmVycm9yKTtcblx0XHRcdFx0XHRcdFx0cmV0cnlDb3VudCsrO1xuXHRcdFx0XHRcdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKFwiUmV0cnlpbmcgI1wiICsgcmV0cnlDb3VudCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIGg1NHNFcnJvcikge1xuXHRcdFx0XHRcdFx0XHRcdGVyciA9IGU7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRlcnIgPSBuZXcgaDU0c0Vycm9yKCd1bmtub3duRXJyb3InLCBlLm1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0ZXJyLnN0YWNrID0gZS5zdGFjaztcblx0XHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRcdFx0Y2FsbGJhY2soZXJyLCB1bmVzY2FwZWRSZXNPYmopO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSkuZXJyb3IoZnVuY3Rpb24gKHJlcykge1xuXHRcdGxldCBfY3NyZlxuXHRcdGlmIChyZXMuc3RhdHVzID09PSA0NDkgfHwgKHJlcy5zdGF0dXMgPT09IDQwMyAmJiAocmVzLnJlc3BvbnNlVGV4dC5pbmNsdWRlcygnX2NzcmYnKSB8fCByZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ1gtRm9yYmlkZGVuLVJlYXNvbicpID09PSAnQ1NSRicpICYmIChfY3NyZiA9IHJlcy5nZXRSZXNwb25zZUhlYWRlcihyZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ1gtQ1NSRi1IRUFERVInKSkpKSkge1xuXHRcdFx0cGFyYW1zWydfY3NyZiddID0gX2NzcmY7XG5cdFx0XHRzZWxmLmNzcmYgPSBfY3NyZlxuXHRcdFx0aWYgKHJldHJ5Q291bnQgPCBzZWxmLm1heFhoclJldHJpZXMpIHtcblx0XHRcdFx0c2VsZi5fYWpheC5wb3N0KHNlbGYudXJsLCBwYXJhbXMsIHRydWUpLnN1Y2Nlc3ModGhpcy5zdWNjZXNzKS5lcnJvcih0aGlzLmVycm9yKTtcblx0XHRcdFx0cmV0cnlDb3VudCsrO1xuXHRcdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKFwiUmV0cnlpbmcgI1wiICsgcmV0cnlDb3VudCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdHNlbGYuX3V0aWxzLmFkZEZhaWxlZFJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJykpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdSZXF1ZXN0IGZhaWxlZCB3aXRoIHN0YXR1czogJyArIHJlcy5zdGF0dXMsIHNhc1Byb2dyYW0pO1xuXHRcdFx0Ly8gaWYgcmVxdWVzdCBoYXMgZXJyb3IgdGV4dCBlbHNlIGNhbGxiYWNrXG5cdFx0XHRjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdodHRwRXJyb3InLCByZXMuc3RhdHVzVGV4dCkpO1xuXHRcdH1cblx0fSk7XG59O1xuXG4vKipcbiogTG9naW4gbWV0aG9kXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSB1c2VyIC0gTG9naW4gdXNlcm5hbWVcbiogQHBhcmFtIHtzdHJpbmd9IHBhc3MgLSBMb2dpbiBwYXNzd29yZFxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKiBPUlxuKlxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmxvZ2luID0gZnVuY3Rpb24gKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG5cdGlmICghdXNlciB8fCAhcGFzcykge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnQ3JlZGVudGlhbHMgbm90IHNldCcpO1xuXHR9XG5cdGlmICh0eXBlb2YgdXNlciAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIHBhc3MgIT09ICdzdHJpbmcnKSB7XG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdVc2VyIGFuZCBwYXNzIHBhcmFtZXRlcnMgbXVzdCBiZSBzdHJpbmdzJyk7XG5cdH1cblx0Ly9OT1RFOiBjYWxsYmFjayBvcHRpb25hbD9cblx0aWYgKCFjYWxsYmFjayB8fCB0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgY2FsbGJhY2snKTtcblx0fVxuXG5cdGlmICghdGhpcy5SRVNUYXV0aCkge1xuXHRcdGhhbmRsZVNhc0xvZ29uLmNhbGwodGhpcywgdXNlciwgcGFzcywgY2FsbGJhY2spO1xuXHR9IGVsc2Uge1xuXHRcdGhhbmRsZVJlc3RMb2dvbi5jYWxsKHRoaXMsIHVzZXIsIHBhc3MsIGNhbGxiYWNrKTtcblx0fVxufTtcblxuLyoqXG4qIE1hbmFnZWRSZXF1ZXN0IG1ldGhvZFxuKlxuKiBAcGFyYW0ge3N0cmluZ30gY2FsbE1ldGhvZCAtIGdldCwgcG9zdCxcbiogQHBhcmFtIHtzdHJpbmd9IF91cmwgLSBVUkwgdG8gbWFrZSByZXF1ZXN0IHRvXG4qIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIC0gY2FsbGJhY2sgZnVuY3Rpb24gYXMgY2FsbGJhY2sgcGFyYW10ZXIgaW4gb3B0aW9ucyBvYmplY3QgaXMgcmVxdWlyZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5tYW5hZ2VkUmVxdWVzdCA9IGZ1bmN0aW9uIChjYWxsTWV0aG9kID0gJ2dldCcsIF91cmwsIG9wdGlvbnMgPSB7XG5cdGNhbGxiYWNrOiAoKSA9PiBjb25zb2xlLmxvZygnTWlzc2luZyBjYWxsYmFjayBmdW5jdGlvbicpXG59KSB7XG5cdGNvbnN0IHNlbGYgPSB0aGlzO1xuXHRjb25zdCBjc3JmID0gdGhpcy5jc3JmO1xuXHRsZXQgcmV0cnlDb3VudCA9IDA7XG5cdGNvbnN0IHt1c2VNdWx0aXBhcnRGb3JtRGF0YSwgc2FzUHJvZ3JhbSwgZGF0YU9iaiwgcGFyYW1zLCBjYWxsYmFjaywgaGVhZGVyc30gPSBvcHRpb25zXG5cblx0aWYgKHNhc1Byb2dyYW0pIHtcblx0XHRyZXR1cm4gc2VsZi5jYWxsKHNhc1Byb2dyYW0sIGRhdGFPYmosIGNhbGxiYWNrLCBwYXJhbXMpXG5cdH1cblxuXHRsZXQgdXJsID0gX3VybFxuXHRpZiAoIV91cmwuc3RhcnRzV2l0aCgnaHR0cCcpKSB7XG5cdFx0dXJsID0gc2VsZi5ob3N0VXJsICsgX3VybFxuXHR9XG5cblx0Y29uc3QgX2hlYWRlcnMgPSBPYmplY3QuYXNzaWduKHt9LCBoZWFkZXJzLCB7XG5cdFx0J1gtQ1NSRi1UT0tFTic6IGNzcmZcblx0fSlcblx0Y29uc3QgX29wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7XG5cdFx0aGVhZGVyczogX2hlYWRlcnNcblx0fSlcblxuXHRpZiAodGhpcy5fZGlzYWJsZUNhbGxzKSB7XG5cdFx0dGhpcy5fY3VzdG9tUGVuZGluZ0NhbGxzLnB1c2goe1xuXHRcdFx0Y2FsbE1ldGhvZCxcblx0XHRcdF91cmwsXG5cdFx0XHRvcHRpb25zOiBfb3B0aW9uc1xuXHRcdH0pO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHNlbGYuX2FqYXhbY2FsbE1ldGhvZF0odXJsLCBwYXJhbXMsIHVzZU11bHRpcGFydEZvcm1EYXRhLCBfaGVhZGVycykuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XG5cdFx0aWYgKHNlbGYuX3V0aWxzLm5lZWRUb0xvZ2luLmNhbGwoc2VsZiwgcmVzKSkge1xuXHRcdFx0Ly9yZW1lbWJlciB0aGUgY2FsbCBmb3IgbGF0dGVyIHVzZVxuXHRcdFx0c2VsZi5fY3VzdG9tUGVuZGluZ0NhbGxzLnB1c2goe1xuXHRcdFx0XHRjYWxsTWV0aG9kLFxuXHRcdFx0XHRfdXJsLFxuXHRcdFx0XHRvcHRpb25zOiBfb3B0aW9uc1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vdGhlcmUncyBubyBuZWVkIHRvIGNvbnRpbnVlIGlmIHByZXZpb3VzIGNhbGwgcmV0dXJuZWQgbG9naW4gZXJyb3Jcblx0XHRcdGlmIChzZWxmLl9kaXNhYmxlQ2FsbHMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2VsZi5fZGlzYWJsZUNhbGxzID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y2FsbGJhY2sobmV3IGg1NHNFcnJvcignbm90TG9nZ2VkaW5FcnJvcicsICdZb3UgYXJlIG5vdCBsb2dnZWQgaW4nKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCByZXNPYmosIGVycjtcblx0XHRcdGxldCBkb25lID0gZmFsc2U7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGFyciA9IHJlcy5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKS5zcGxpdCgnXFxyXFxuJyk7XG5cdFx0XHRcdGNvbnN0IHJlc0hlYWRlcnMgPSBhcnIucmVkdWNlKGZ1bmN0aW9uIChhY2MsIGN1cnJlbnQsIGkpIHtcblx0XHRcdFx0XHRsZXQgcGFydHMgPSBjdXJyZW50LnNwbGl0KCc6ICcpO1xuXHRcdFx0XHRcdGFjY1twYXJ0c1swXV0gPSBwYXJ0c1sxXTtcblx0XHRcdFx0XHRyZXR1cm4gYWNjO1xuXHRcdFx0XHR9LCB7fSk7XG5cdFx0XHRcdGxldCBib2R5ID0gcmVzLnJlc3BvbnNlVGV4dFxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGJvZHkgPSBKU09OLnBhcnNlKGJvZHkpXG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRjb25zb2xlLmxvZygncmVzcG9uc2UgaXMgbm90IEpTT04gc3RyaW5nJylcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRyZXNPYmogPSBPYmplY3QuYXNzaWduKHt9LCB7XG5cdFx0XHRcdFx0XHRoZWFkZXJzOiByZXNIZWFkZXJzLFxuXHRcdFx0XHRcdFx0c3RhdHVzOiByZXMuc3RhdHVzLFxuXHRcdFx0XHRcdFx0c3RhdHVzVGV4dDogcmVzLnN0YXR1c1RleHQsXG5cdFx0XHRcdFx0XHRib2R5XG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRlcnIgPSBuZXcgaDU0c0Vycm9yKCd1bmtub3duRXJyb3InLCBlLm1lc3NhZ2UpO1xuXHRcdFx0XHRlcnIuc3RhY2sgPSBlLnN0YWNrO1xuXHRcdFx0XHRkb25lID0gdHJ1ZTtcblxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aWYgKGRvbmUpIHtcblx0XHRcdFx0XHRjYWxsYmFjayhlcnIsIHJlc09iailcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSkuZXJyb3IoZnVuY3Rpb24gKHJlcykge1xuXHRcdGxldCBfY3NyZlxuXHRcdGlmIChyZXMuc3RhdHVzID09IDQ0OSB8fCAocmVzLnN0YXR1cyA9PSA0MDMgJiYgKHJlcy5yZXNwb25zZVRleHQuaW5jbHVkZXMoJ19jc3JmJykgfHwgcmVzLmdldFJlc3BvbnNlSGVhZGVyKCdYLUZvcmJpZGRlbi1SZWFzb24nKSA9PT0gJ0NTUkYnKSAmJiAoX2NzcmYgPSByZXMuZ2V0UmVzcG9uc2VIZWFkZXIocmVzLmdldFJlc3BvbnNlSGVhZGVyKCdYLUNTUkYtSEVBREVSJykpKSkpIHtcblx0XHRcdHNlbGYuY3NyZiA9IF9jc3JmXG5cdFx0XHRjb25zdCBfaGVhZGVycyA9IE9iamVjdC5hc3NpZ24oe30sIGhlYWRlcnMsIHtbcmVzLmdldFJlc3BvbnNlSGVhZGVyKCdYLUNTUkYtSEVBREVSJyldOiBfY3NyZn0pXG5cdFx0XHRpZiAocmV0cnlDb3VudCA8IHNlbGYubWF4WGhyUmV0cmllcykge1xuXHRcdFx0XHRzZWxmLl9hamF4W2NhbGxNZXRob2RdKHVybCwgcGFyYW1zLCB1c2VNdWx0aXBhcnRGb3JtRGF0YSwgX2hlYWRlcnMpLnN1Y2Nlc3ModGhpcy5zdWNjZXNzKS5lcnJvcih0aGlzLmVycm9yKTtcblx0XHRcdFx0cmV0cnlDb3VudCsrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2FsbGJhY2sobmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTWFuYWdlZCByZXF1ZXN0IGZhaWxlZCB3aXRoIHN0YXR1czogJyArIHJlcy5zdGF0dXMsIF91cmwpO1xuXHRcdFx0Ly8gaWYgcmVxdWVzdCBoYXMgZXJyb3IgdGV4dCBlbHNlIGNhbGxiYWNrXG5cdFx0XHRjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdodHRwRXJyb3InLCByZXMucmVzcG9uc2VUZXh0LCByZXMuc3RhdHVzKSk7XG5cdFx0fVxuXHR9KTtcbn1cblxuLyoqXG4gKiBMb2cgb24gdG8gU0FTIGlmIHdlIGFyZSBhc2tlZCB0b1xuICogQHBhcmFtIHtTdHJpbmd9IHVzZXIgLSBVc2VybmFtZSBvZiB1c2VyXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzcyAtIFBhc3N3b3JkIG9mIHVzZXJcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gd2hhdCB0byBkbyBhZnRlclxuICovXG5mdW5jdGlvbiBoYW5kbGVTYXNMb2dvbih1c2VyLCBwYXNzLCBjYWxsYmFjaykge1xuXHRjb25zdCBzZWxmID0gdGhpcztcblxuXHRjb25zdCBsb2dpblBhcmFtcyA9IHtcblx0XHRfc2VydmljZTogJ2RlZmF1bHQnLFxuXHRcdC8vZm9yIFNBUyA5LjQsXG5cdFx0dXNlcm5hbWU6IHVzZXIsXG5cdFx0cGFzc3dvcmQ6IHBhc3Ncblx0fTtcblxuXHRmb3IgKGxldCBrZXkgaW4gdGhpcy5fYWRpdGlvbmFsTG9naW5QYXJhbXMpIHtcblx0XHRsb2dpblBhcmFtc1trZXldID0gdGhpcy5fYWRpdGlvbmFsTG9naW5QYXJhbXNba2V5XTtcblx0fVxuXG5cdHRoaXMuX2xvZ2luQXR0ZW1wdHMgPSAwO1xuXG5cdHRoaXMuX2FqYXgucG9zdCh0aGlzLmxvZ2luVXJsLCBsb2dpblBhcmFtcylcblx0XHQuc3VjY2VzcyhoYW5kbGVTYXNMb2dvblN1Y2Nlc3MpXG5cdFx0LmVycm9yKGhhbmRsZVNhc0xvZ29uRXJyb3IpO1xuXG5cdGZ1bmN0aW9uIGhhbmRsZVNhc0xvZ29uRXJyb3IocmVzKSB7XG5cdFx0aWYgKHJlcy5zdGF0dXMgPT0gNDQ5KSB7XG5cdFx0XHRoYW5kbGVTYXNMb2dvblN1Y2Nlc3MocmVzKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuXHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHR9XG5cblx0ZnVuY3Rpb24gaGFuZGxlU2FzTG9nb25TdWNjZXNzKHJlcykge1xuXHRcdGlmICgrK3NlbGYuX2xvZ2luQXR0ZW1wdHMgPT09IDMpIHtcblx0XHRcdHJldHVybiBjYWxsYmFjaygtMik7XG5cdFx0fVxuXHRcdGlmIChzZWxmLl91dGlscy5uZWVkVG9Mb2dpbi5jYWxsKHNlbGYsIHJlcykpIHtcblx0XHRcdC8vd2UgYXJlIGdldHRpbmcgZm9ybSBhZ2FpbiBhZnRlciByZWRpcmVjdFxuXHRcdFx0Ly9hbmQgbmVlZCB0byBsb2dpbiBhZ2FpbiB1c2luZyB0aGUgbmV3IHVybFxuXHRcdFx0Ly9fbG9naW5DaGFuZ2VkIGlzIHNldCBpbiBuZWVkVG9Mb2dpbiBmdW5jdGlvblxuXHRcdFx0Ly9idXQgaWYgbG9naW4gdXJsIGlzIG5vdCBkaWZmZXJlbnQsIHdlIGFyZSBjaGVja2luZyBpZiB0aGVyZSBhcmUgYWRpdGlvbmFsIHBhcmFtZXRlcnNcblx0XHRcdGlmIChzZWxmLl9sb2dpbkNoYW5nZWQgfHwgKHNlbGYuX2lzTmV3TG9naW5QYWdlICYmICFzZWxmLl9hZGl0aW9uYWxMb2dpblBhcmFtcykpIHtcblx0XHRcdFx0ZGVsZXRlIHNlbGYuX2xvZ2luQ2hhbmdlZDtcblx0XHRcdFx0Y29uc3QgaW5wdXRzID0gcmVzLnJlc3BvbnNlVGV4dC5tYXRjaCgvPGlucHV0LipcImhpZGRlblwiW14+XSo+L2cpO1xuXHRcdFx0XHRpZiAoaW5wdXRzKSB7XG5cdFx0XHRcdFx0aW5wdXRzLmZvckVhY2goZnVuY3Rpb24gKGlucHV0U3RyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZU1hdGNoID0gaW5wdXRTdHIubWF0Y2goL25hbWU9XCIoW15cIl0qKVwiXFxzdmFsdWU9XCIoW15cIl0qKS8pO1xuXHRcdFx0XHRcdFx0bG9naW5QYXJhbXNbdmFsdWVNYXRjaFsxXV0gPSB2YWx1ZU1hdGNoWzJdO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlbGYuX2FqYXgucG9zdChzZWxmLmxvZ2luVXJsLCBsb2dpblBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdFx0Ly93ZSBuZWVkIHRoaXMgZ2V0IHJlcXVlc3QgYmVjYXVzZSBvZiB0aGUgc2FzIDkuNCBzZWN1cml0eSBjaGVja3Ncblx0XHRcdFx0XHRzZWxmLl9hamF4LmdldChzZWxmLnVybCkuc3VjY2VzcyhoYW5kbGVTYXNMb2dvblN1Y2Nlc3MpLmVycm9yKGhhbmRsZVNhc0xvZ29uRXJyb3IpO1xuXHRcdFx0XHR9KS5lcnJvcihoYW5kbGVTYXNMb2dvbkVycm9yKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHQvL2dldHRpbmcgZm9ybSBhZ2FpbiwgYnV0IGl0IHdhc24ndCBhIHJlZGlyZWN0XG5cdFx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ1dyb25nIHVzZXJuYW1lIG9yIHBhc3N3b3JkJyk7XG5cdFx0XHRcdGNhbGxiYWNrKC0xKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRzZWxmLl9kaXNhYmxlQ2FsbHMgPSBmYWxzZTtcblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHRcdFx0d2hpbGUgKHNlbGYuX3BlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdDYWxsID0gc2VsZi5fcGVuZGluZ0NhbGxzLnNoaWZ0KCk7XG5cdFx0XHRcdGNvbnN0IG1ldGhvZCA9IHBlbmRpbmdDYWxsLm1ldGhvZCB8fCBzZWxmLmNhbGwuYmluZChzZWxmKTtcblx0XHRcdFx0Y29uc3Qgc2FzUHJvZ3JhbSA9IHBlbmRpbmdDYWxsLm9wdGlvbnMuc2FzUHJvZ3JhbTtcblx0XHRcdFx0Y29uc3QgY2FsbGJhY2tQZW5kaW5nID0gcGVuZGluZ0NhbGwub3B0aW9ucy5jYWxsYmFjaztcblx0XHRcdFx0Y29uc3QgcGFyYW1zID0gcGVuZGluZ0NhbGwucGFyYW1zO1xuXHRcdFx0XHQvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblx0XHRcdFx0aWYgKHNlbGYucmV0cnlBZnRlckxvZ2luKSB7XG5cdFx0XHRcdFx0bWV0aG9kKHNhc1Byb2dyYW0sIG51bGwsIGNhbGxiYWNrUGVuZGluZywgcGFyYW1zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuLyoqXG4gKiBSRVNUIGxvZ29uIGZvciA5LjQgdjEgdGlja2V0IGJhc2VkIGF1dGhcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VyIC1cbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXNzXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFja1xuICovXG5mdW5jdGlvbiBoYW5kbGVSZXN0TG9nb24odXNlciwgcGFzcywgY2FsbGJhY2spIHtcblx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cblx0Y29uc3QgbG9naW5QYXJhbXMgPSB7XG5cdFx0dXNlcm5hbWU6IHVzZXIsXG5cdFx0cGFzc3dvcmQ6IHBhc3Ncblx0fTtcblxuXHR0aGlzLl9hamF4LnBvc3QodGhpcy5SRVNUYXV0aExvZ2luVXJsLCBsb2dpblBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSByZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ0xvY2F0aW9uJyk7XG5cblx0XHRzZWxmLl9hamF4LnBvc3QobG9jYXRpb24sIHtcblx0XHRcdHNlcnZpY2U6IHNlbGYudXJsXG5cdFx0fSkuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XG5cdFx0XHRpZiAoc2VsZi51cmwuaW5kZXhPZignPycpID09PSAtMSkge1xuXHRcdFx0XHRzZWxmLnVybCArPSAnP3RpY2tldD0nICsgcmVzLnJlc3BvbnNlVGV4dDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChzZWxmLnVybC5pbmRleE9mKCd0aWNrZXQnKSAhPT0gLTEpIHtcblx0XHRcdFx0XHRzZWxmLnVybCA9IHNlbGYudXJsLnJlcGxhY2UoL3RpY2tldD1bXiZdKy8sICd0aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNlbGYudXJsICs9ICcmdGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHRcdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0XHR9KTtcblx0fSkuZXJyb3IoZnVuY3Rpb24gKHJlcykge1xuXHRcdGlmIChyZXMucmVzcG9uc2VUZXh0ID09PSAnZXJyb3IuYXV0aGVudGljYXRpb24uY3JlZGVudGlhbHMuYmFkJykge1xuXHRcdFx0Y2FsbGJhY2soLTEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0fVxuXHR9KTtcbn1cblxuLyoqXG4qIExvZ291dCBtZXRob2RcbipcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBsb2dvdXQgaXMgZG9uZVxuKlxuKi9cblxubW9kdWxlLmV4cG9ydHMubG9nb3V0ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG5cdGNvbnN0IGJhc2VVcmwgPSB0aGlzLmhvc3RVcmwgfHwgJyc7XG5cdGNvbnN0IHVybCA9IGJhc2VVcmwgKyB0aGlzLmxvZ291dFVybDtcblxuXHR0aGlzLl9hamF4LmdldCh1cmwpLnN1Y2Nlc3MoZnVuY3Rpb24gKHJlcykge1xuXHRcdHRoaXMuX2Rpc2FibGVDYWxscyA9IHRydWVcblx0XHRjYWxsYmFjaygpO1xuXHR9KS5lcnJvcihmdW5jdGlvbiAocmVzKSB7XG5cdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9nb3V0IGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG5cdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdH0pO1xufTtcblxuLypcbiogRW50ZXIgZGVidWcgbW9kZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnNldERlYnVnTW9kZSA9IGZ1bmN0aW9uICgpIHtcblx0dGhpcy5kZWJ1ZyA9IHRydWU7XG59O1xuXG4vKlxuKiBFeGl0IGRlYnVnIG1vZGUgYW5kIGNsZWFyIGxvZ3NcbipcbiovXG5tb2R1bGUuZXhwb3J0cy51bnNldERlYnVnTW9kZSA9IGZ1bmN0aW9uICgpIHtcblx0dGhpcy5kZWJ1ZyA9IGZhbHNlO1xufTtcblxuZm9yIChsZXQga2V5IGluIGxvZ3MuZ2V0KSB7XG5cdGlmIChsb2dzLmdldC5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdFx0bW9kdWxlLmV4cG9ydHNba2V5XSA9IGxvZ3MuZ2V0W2tleV07XG5cdH1cbn1cblxuZm9yIChsZXQga2V5IGluIGxvZ3MuY2xlYXIpIHtcblx0aWYgKGxvZ3MuY2xlYXIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHRcdG1vZHVsZS5leHBvcnRzW2tleV0gPSBsb2dzLmNsZWFyW2tleV07XG5cdH1cbn1cblxuLypcbiogQWRkIGNhbGxiYWNrIGZ1bmN0aW9ucyBleGVjdXRlZCB3aGVuIHByb3BlcnRpZXMgYXJlIHVwZGF0ZWQgd2l0aCByZW1vdGUgY29uZmlnXG4qXG4qQGNhbGxiYWNrIC0gY2FsbGJhY2sgcHVzaGVkIHRvIGFycmF5XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMub25SZW1vdGVDb25maWdVcGRhdGUgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcblx0dGhpcy5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MucHVzaChjYWxsYmFjayk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5fdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG5cbi8qKlxuICogTG9naW4gY2FsbCB3aGljaCByZXR1cm5zIGEgcHJvbWlzZVxuICogQHBhcmFtIHtTdHJpbmd9IHVzZXIgLSBVc2VybmFtZVxuICogQHBhcmFtIHtTdHJpbmd9IHBhc3MgLSBQYXNzd29yZFxuICovXG5tb2R1bGUuZXhwb3J0cy5wcm9taXNlTG9naW4gPSBmdW5jdGlvbiAodXNlciwgcGFzcykge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGlmICghdXNlciB8fCAhcGFzcykge1xuXHRcdFx0cmVqZWN0KG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnQ3JlZGVudGlhbHMgbm90IHNldCcpKVxuXHRcdH1cblx0XHRpZiAodHlwZW9mIHVzZXIgIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBwYXNzICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmVqZWN0KG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVXNlciBhbmQgcGFzcyBwYXJhbWV0ZXJzIG11c3QgYmUgc3RyaW5ncycpKVxuXHRcdH1cblx0XHRpZiAoIXRoaXMuUkVTVGF1dGgpIHtcblx0XHRcdGN1c3RvbUhhbmRsZVNhc0xvZ29uLmNhbGwodGhpcywgdXNlciwgcGFzcywgcmVzb2x2ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGN1c3RvbUhhbmRsZVJlc3RMb2dvbi5jYWxsKHRoaXMsIHVzZXIsIHBhc3MsIHJlc29sdmUpO1xuXHRcdH1cblx0fSlcbn1cblxuLyoqXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHVzZXIgLSBVc2VybmFtZVxuICogQHBhcmFtIHtTdHJpbmd9IHBhc3MgLSBQYXNzd29yZFxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBmdW5jdGlvbiB0byBjYWxsIHdoZW4gc3VjY2Vzc2Z1bFxuICovXG5mdW5jdGlvbiBjdXN0b21IYW5kbGVTYXNMb2dvbih1c2VyLCBwYXNzLCBjYWxsYmFjaykge1xuXHRjb25zdCBzZWxmID0gdGhpcztcblx0bGV0IGxvZ2luUGFyYW1zID0ge1xuXHRcdF9zZXJ2aWNlOiAnZGVmYXVsdCcsXG5cdFx0Ly9mb3IgU0FTIDkuNCxcblx0XHR1c2VybmFtZTogdXNlcixcblx0XHRwYXNzd29yZDogcGFzc1xuXHR9O1xuXG5cdGZvciAobGV0IGtleSBpbiB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtcykge1xuXHRcdGxvZ2luUGFyYW1zW2tleV0gPSB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtc1trZXldO1xuXHR9XG5cblx0dGhpcy5fbG9naW5BdHRlbXB0cyA9IDA7XG5cdGxvZ2luUGFyYW1zID0gdGhpcy5fYWpheC5zZXJpYWxpemUobG9naW5QYXJhbXMpXG5cblx0dGhpcy5fYWpheC5wb3N0KHRoaXMubG9naW5VcmwsIGxvZ2luUGFyYW1zKVxuXHRcdC5zdWNjZXNzKGhhbmRsZVNhc0xvZ29uU3VjY2Vzcylcblx0XHQuZXJyb3IoaGFuZGxlU2FzTG9nb25FcnJvcik7XG5cblx0ZnVuY3Rpb24gaGFuZGxlU2FzTG9nb25FcnJvcihyZXMpIHtcblx0XHRpZiAocmVzLnN0YXR1cyA9PSA0NDkpIHtcblx0XHRcdGhhbmRsZVNhc0xvZ29uU3VjY2VzcyhyZXMpO1xuXHRcdFx0Ly8gcmVzb2x2ZShyZXMuc3RhdHVzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGhhbmRsZVNhc0xvZ29uU3VjY2VzcyhyZXMpIHtcblx0XHRpZiAoKytzZWxmLl9sb2dpbkF0dGVtcHRzID09PSAzKSB7XG5cdFx0XHRjYWxsYmFjaygtMik7XG5cdFx0fVxuXG5cdFx0aWYgKHNlbGYuX3V0aWxzLm5lZWRUb0xvZ2luLmNhbGwoc2VsZiwgcmVzKSkge1xuXHRcdFx0Ly93ZSBhcmUgZ2V0dGluZyBmb3JtIGFnYWluIGFmdGVyIHJlZGlyZWN0XG5cdFx0XHQvL2FuZCBuZWVkIHRvIGxvZ2luIGFnYWluIHVzaW5nIHRoZSBuZXcgdXJsXG5cdFx0XHQvL19sb2dpbkNoYW5nZWQgaXMgc2V0IGluIG5lZWRUb0xvZ2luIGZ1bmN0aW9uXG5cdFx0XHQvL2J1dCBpZiBsb2dpbiB1cmwgaXMgbm90IGRpZmZlcmVudCwgd2UgYXJlIGNoZWNraW5nIGlmIHRoZXJlIGFyZSBhZGl0aW9uYWwgcGFyYW1ldGVyc1xuXHRcdFx0aWYgKHNlbGYuX2xvZ2luQ2hhbmdlZCB8fCAoc2VsZi5faXNOZXdMb2dpblBhZ2UgJiYgIXNlbGYuX2FkaXRpb25hbExvZ2luUGFyYW1zKSkge1xuXHRcdFx0XHRkZWxldGUgc2VsZi5fbG9naW5DaGFuZ2VkO1xuXHRcdFx0XHRjb25zdCBpbnB1dHMgPSByZXMucmVzcG9uc2VUZXh0Lm1hdGNoKC88aW5wdXQuKlwiaGlkZGVuXCJbXj5dKj4vZyk7XG5cdFx0XHRcdGlmIChpbnB1dHMpIHtcblx0XHRcdFx0XHRpbnB1dHMuZm9yRWFjaChmdW5jdGlvbiAoaW5wdXRTdHIpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlTWF0Y2ggPSBpbnB1dFN0ci5tYXRjaCgvbmFtZT1cIihbXlwiXSopXCJcXHN2YWx1ZT1cIihbXlwiXSopLyk7XG5cdFx0XHRcdFx0XHRsb2dpblBhcmFtc1t2YWx1ZU1hdGNoWzFdXSA9IHZhbHVlTWF0Y2hbMl07XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2VsZi5fYWpheC5wb3N0KHNlbGYubG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0XHRoYW5kbGVTYXNMb2dvblN1Y2Nlc3MoKVxuXHRcdFx0XHR9KS5lcnJvcihoYW5kbGVTYXNMb2dvbkVycm9yKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHQvL2dldHRpbmcgZm9ybSBhZ2FpbiwgYnV0IGl0IHdhc24ndCBhIHJlZGlyZWN0XG5cdFx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ1dyb25nIHVzZXJuYW1lIG9yIHBhc3N3b3JkJyk7XG5cdFx0XHRcdGNhbGxiYWNrKC0xKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRzZWxmLl9kaXNhYmxlQ2FsbHMgPSBmYWxzZTtcblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHRcdFx0d2hpbGUgKHNlbGYuX2N1c3RvbVBlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdDYWxsID0gc2VsZi5fY3VzdG9tUGVuZGluZ0NhbGxzLnNoaWZ0KClcblx0XHRcdFx0Y29uc3QgbWV0aG9kID0gcGVuZGluZ0NhbGwubWV0aG9kIHx8IHNlbGYubWFuYWdlZFJlcXVlc3QuYmluZChzZWxmKTtcblx0XHRcdFx0Y29uc3QgY2FsbE1ldGhvZCA9IHBlbmRpbmdDYWxsLmNhbGxNZXRob2Rcblx0XHRcdFx0Y29uc3QgX3VybCA9IHBlbmRpbmdDYWxsLl91cmxcblx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHBlbmRpbmdDYWxsLm9wdGlvbnM7XG5cdFx0XHRcdC8vdXBkYXRlIGRlYnVnIGJlY2F1c2UgaXQgbWF5IGNoYW5nZSBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdFx0aWYgKG9wdGlvbnMucGFyYW1zKSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5wYXJhbXMuX2RlYnVnID0gc2VsZi5kZWJ1ZyA/IDEzMSA6IDA7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlbGYucmV0cnlBZnRlckxvZ2luKSB7XG5cdFx0XHRcdFx0bWV0aG9kKGNhbGxNZXRob2QsIF91cmwsIG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHdoaWxlIChzZWxmLl9wZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBwZW5kaW5nQ2FsbCA9IHNlbGYuX3BlbmRpbmdDYWxscy5zaGlmdCgpO1xuXHRcdFx0XHRjb25zdCBtZXRob2QgPSBwZW5kaW5nQ2FsbC5tZXRob2QgfHwgc2VsZi5jYWxsLmJpbmQoc2VsZik7XG5cdFx0XHRcdGNvbnN0IHNhc1Byb2dyYW0gPSBwZW5kaW5nQ2FsbC5vcHRpb25zLnNhc1Byb2dyYW07XG5cdFx0XHRcdGNvbnN0IGNhbGxiYWNrUGVuZGluZyA9IHBlbmRpbmdDYWxsLm9wdGlvbnMuY2FsbGJhY2s7XG5cdFx0XHRcdGNvbnN0IHBhcmFtcyA9IHBlbmRpbmdDYWxsLnBhcmFtcztcblx0XHRcdFx0Ly91cGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxuXHRcdFx0XHRwYXJhbXMuX2RlYnVnID0gc2VsZi5kZWJ1ZyA/IDEzMSA6IDA7XG5cdFx0XHRcdGlmIChzZWxmLnJldHJ5QWZ0ZXJMb2dpbikge1xuXHRcdFx0XHRcdG1ldGhvZChzYXNQcm9ncmFtLCBudWxsLCBjYWxsYmFja1BlbmRpbmcsIHBhcmFtcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH07XG59XG5cbi8qKlxuICogVG8gYmUgdXNlZCB3aXRoIGZ1dHVyZSBtYW5hZ2VkIG1ldGFkYXRhIGNhbGxzXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlciAtIFVzZXJuYW1lXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzcyAtIFBhc3N3b3JkXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIHdoYXQgdG8gY2FsbCBhZnRlclxuICogQHBhcmFtIHtTdHJpbmd9IGNhbGxiYWNrVXJsIC0gd2hlcmUgdG8gbmF2aWdhdGUgYWZ0ZXIgZ2V0dGluZyB0aWNrZXRcbiAqL1xuZnVuY3Rpb24gY3VzdG9tSGFuZGxlUmVzdExvZ29uKHVzZXIsIHBhc3MsIGNhbGxiYWNrLCBjYWxsYmFja1VybCkge1xuXHRjb25zdCBzZWxmID0gdGhpcztcblxuXHRjb25zdCBsb2dpblBhcmFtcyA9IHtcblx0XHR1c2VybmFtZTogdXNlcixcblx0XHRwYXNzd29yZDogcGFzc1xuXHR9O1xuXG5cdHRoaXMuX2FqYXgucG9zdCh0aGlzLlJFU1RhdXRoTG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHJlcy5nZXRSZXNwb25zZUhlYWRlcignTG9jYXRpb24nKTtcblxuXHRcdHNlbGYuX2FqYXgucG9zdChsb2NhdGlvbiwge1xuXHRcdFx0c2VydmljZTogY2FsbGJhY2tVcmxcblx0XHR9KS5zdWNjZXNzKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRcdGlmIChjYWxsYmFja1VybC5pbmRleE9mKCc/JykgPT09IC0xKSB7XG5cdFx0XHRcdGNhbGxiYWNrVXJsICs9ICc/dGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGNhbGxiYWNrVXJsLmluZGV4T2YoJ3RpY2tldCcpICE9PSAtMSkge1xuXHRcdFx0XHRcdGNhbGxiYWNrVXJsID0gY2FsbGJhY2tVcmwucmVwbGFjZSgvdGlja2V0PVteJl0rLywgJ3RpY2tldD0nICsgcmVzLnJlc3BvbnNlVGV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2FsbGJhY2tVcmwgKz0gJyZ0aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0fSkuZXJyb3IoZnVuY3Rpb24gKHJlcykge1xuXHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHRcdH0pO1xuXHR9KS5lcnJvcihmdW5jdGlvbiAocmVzKSB7XG5cdFx0aWYgKHJlcy5yZXNwb25zZVRleHQgPT09ICdlcnJvci5hdXRoZW50aWNhdGlvbi5jcmVkZW50aWFscy5iYWQnKSB7XG5cdFx0XHRjYWxsYmFjaygtMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0XHR9XG5cdH0pO1xufVxuXG5cbi8vIFV0aWxpbGl0eSBmdW5jdGlvbnMgZm9yIGhhbmRsaW5nIGZpbGVzIGFuZCBmb2xkZXJzIG9uIFZJWUFcbi8qKlxuICogUmV0dXJucyB0aGUgZGV0YWlscyBvZiBhIGZvbGRlciBmcm9tIGZvbGRlciBzZXJ2aWNlXG4gKiBAcGFyYW0ge1N0cmluZ30gZm9sZGVyTmFtZSAtIEZ1bGwgcGF0aCBvZiBmb2xkZXIgdG8gYmUgZm91bmRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XG4gKi9cbm1vZHVsZS5leHBvcnRzLmdldEZvbGRlckRldGFpbHMgPSBmdW5jdGlvbiAoZm9sZGVyTmFtZSwgb3B0aW9ucykge1xuXHQvLyBGaXJzdCBjYWxsIHRvIGdldCBmb2xkZXIncyBpZFxuXHRsZXQgdXJsID0gXCIvZm9sZGVycy9mb2xkZXJzL0BpdGVtP3BhdGg9XCIgKyBmb2xkZXJOYW1lXG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdnZXQnLCB1cmwsIG9wdGlvbnMpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIGRldGFpbHMgb2YgYSBmaWxlIGZyb20gZmlsZXMgc2VydmljZVxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVVcmkgLSBGdWxsIHBhdGggb2YgZmlsZSB0byBiZSBmb3VuZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3Q6IGNhY2hlQnVzdCBmb3JjZXMgYnJvd3NlciB0byBmZXRjaCBuZXcgZmlsZVxuICovXG5tb2R1bGUuZXhwb3J0cy5nZXRGaWxlRGV0YWlscyA9IGZ1bmN0aW9uIChmaWxlVXJpLCBvcHRpb25zKSB7XG5cdGNvbnN0IGNhY2hlQnVzdCA9IG9wdGlvbnMuY2FjaGVCdXN0XG5cdGlmIChjYWNoZUJ1c3QpIHtcblx0XHRmaWxlVXJpICs9ICc/Y2FjaGVCdXN0PScgKyBuZXcgRGF0ZSgpLmdldFRpbWUoKVxuXHR9XG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdnZXQnLCBmaWxlVXJpLCBvcHRpb25zKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBjb250ZW50cyBvZiBhIGZpbGUgZnJvbSBmaWxlcyBzZXJ2aWNlXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZVVyaSAtIEZ1bGwgcGF0aCBvZiBmaWxlIHRvIGJlIGRvd25sb2FkZWRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0OiBjYWNoZUJ1c3QgZm9yY2VzIGJyb3dzZXIgdG8gZmV0Y2ggbmV3IGZpbGVcbiAqL1xubW9kdWxlLmV4cG9ydHMuZ2V0RmlsZUNvbnRlbnQgPSBmdW5jdGlvbiAoZmlsZVVyaSwgb3B0aW9ucykge1xuXHRjb25zdCBjYWNoZUJ1c3QgPSBvcHRpb25zLmNhY2hlQnVzdFxuXHRsZXQgdXJpID0gZmlsZVVyaSArICcvY29udGVudCdcblx0aWYgKGNhY2hlQnVzdCkge1xuXHRcdHVyaSArPSAnP2NhY2hlQnVzdD0nICsgbmV3IERhdGUoKS5nZXRUaW1lKClcblx0fVxuXHRyZXR1cm4gdGhpcy5tYW5hZ2VkUmVxdWVzdCgnZ2V0JywgdXJpLCBvcHRpb25zKTtcbn1cblxuXG4vLyBVdGlsIGZ1bmN0aW9ucyBmb3Igd29ya2luZyB3aXRoIGZpbGVzIGFuZCBmb2xkZXJzXG4vKipcbiAqIFJldHVybnMgZGV0YWlscyBhYm91dCBmb2xkZXIgaXQgc2VsZiBhbmQgaXQncyBtZW1iZXJzIHdpdGggZGV0YWlsc1xuICogQHBhcmFtIHtTdHJpbmd9IGZvbGRlck5hbWUgLSBGdWxsIHBhdGggb2YgZm9sZGVyIHRvIGJlIGZvdW5kXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxuICovXG5tb2R1bGUuZXhwb3J0cy5nZXRGb2xkZXJDb250ZW50cyA9IGFzeW5jIGZ1bmN0aW9uIChmb2xkZXJOYW1lLCBvcHRpb25zKSB7XG5cdGNvbnN0IHNlbGYgPSB0aGlzXG5cdGNvbnN0IHtjYWxsYmFja30gPSBvcHRpb25zXG5cblx0Ly8gU2Vjb25kIGNhbGwgdG8gZ2V0IGZvbGRlcidzIG1lbWViZXJzXG5cdGNvbnN0IF9jYWxsYmFjayA9IChlcnIsIGRhdGEpID0+IHtcblx0XHQvLyBoYW5kbGUgZXJyb3Igb2YgdGhlIGZpcnN0IGNhbGxcblx0XHRpZihlcnIpIHtcblx0XHRcdGNhbGxiYWNrKGVyciwgZGF0YSlcblx0XHRcdHJldHVyblxuXHRcdH1cblx0XHRsZXQgaWQgPSBkYXRhLmJvZHkuaWRcblx0XHRsZXQgbWVtYmVyc1VybCA9ICcvZm9sZGVycy9mb2xkZXJzLycgKyBpZCArICcvbWVtYmVycycgKyAnLz9saW1pdD0xMDAwMDAwMCc7XG5cdFx0cmV0dXJuIHNlbGYubWFuYWdlZFJlcXVlc3QoJ2dldCcsIG1lbWJlcnNVcmwsIHtjYWxsYmFja30pXG5cdH1cblxuXHQvLyBGaXJzdCBjYWxsIHRvIGdldCBmb2xkZXIncyBpZFxuXHRsZXQgdXJsID0gXCIvZm9sZGVycy9mb2xkZXJzL0BpdGVtP3BhdGg9XCIgKyBmb2xkZXJOYW1lXG5cdGNvbnN0IG9wdGlvbnNPYmogPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7XG5cdFx0Y2FsbGJhY2s6IF9jYWxsYmFja1xuXHR9KVxuXHR0aGlzLm1hbmFnZWRSZXF1ZXN0KCdnZXQnLCB1cmwsIG9wdGlvbnNPYmopXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIGZvbGRlclxuICogQHBhcmFtIHtTdHJpbmd9IHBhcmVudFVyaSAtIFRoZSB1cmkgb2YgdGhlIGZvbGRlciB3aGVyZSB0aGUgbmV3IGNoaWxkIGlzIGJlaW5nIGNyZWF0ZWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBmb2xkZXJOYW1lIC0gRnVsbCBwYXRoIG9mIGZvbGRlciB0byBiZSBmb3VuZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcbiAqL1xubW9kdWxlLmV4cG9ydHMuY3JlYXRlTmV3Rm9sZGVyID0gZnVuY3Rpb24gKHBhcmVudFVyaSwgZm9sZGVyTmFtZSwgb3B0aW9ucykge1xuXHRjb25zdCBoZWFkZXJzID0ge1xuXHRcdCdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbiwgdGV4dC9qYXZhc2NyaXB0LCAqLyo7IHE9MC4wMScsXG5cdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0fVxuXG5cdGNvbnN0IHVybCA9ICcvZm9sZGVycy9mb2xkZXJzP3BhcmVudEZvbGRlclVyaT0nICsgcGFyZW50VXJpO1xuXHRjb25zdCBkYXRhID0ge1xuXHRcdCduYW1lJzogZm9sZGVyTmFtZSxcblx0XHQndHlwZSc6IFwiZm9sZGVyXCJcblx0fVxuXG5cdGNvbnN0IG9wdGlvbnNPYmogPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7XG5cdFx0cGFyYW1zOiBKU09OLnN0cmluZ2lmeShkYXRhKSxcblx0XHRoZWFkZXJzLFxuXHRcdHVzZU11bHRpcGFydEZvcm1EYXRhOiBmYWxzZVxuXHR9KVxuXG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdwb3N0JywgdXJsLCBvcHRpb25zT2JqKTtcbn1cblxuLyoqXG4gKiBEZWxldGVzIGEgZm9sZGVyXG4gKiBAcGFyYW0ge1N0cmluZ30gZm9sZGVySWQgLSBGdWxsIFVSSSBvZiBmb2xkZXIgdG8gYmUgZGVsZXRlZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcbiAqL1xubW9kdWxlLmV4cG9ydHMuZGVsZXRlRm9sZGVyQnlJZCA9IGZ1bmN0aW9uIChmb2xkZXJJZCwgb3B0aW9ucykge1xuXHRjb25zdCB1cmwgPSAnL2ZvbGRlcnMvZm9sZGVycy8nICsgZm9sZGVySWQ7XG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdkZWxldGUnLCB1cmwsIG9wdGlvbnMpXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBmaWxlXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZU5hbWUgLSBOYW1lIG9mIHRoZSBmaWxlIGJlaW5nIGNyZWF0ZWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlQmxvYiAtIENvbnRlbnQgb2YgdGhlIGZpbGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXJlbnRGT2xkZXJVcmkgLSBVUkkgb2YgdGhlIHBhcmVudCBmb2xkZXIgd2hlcmUgdGhlIGZpbGUgaXMgdG8gYmUgY3JlYXRlZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcbiAqL1xubW9kdWxlLmV4cG9ydHMuY3JlYXRlTmV3RmlsZSA9IGZ1bmN0aW9uIChmaWxlTmFtZSwgZmlsZUJsb2IsIHBhcmVudEZvbGRlclVyaSwgb3B0aW9ucykge1xuXHRsZXQgdXJsID0gXCIvZmlsZXMvZmlsZXMjbXVsdGlwYXJ0VXBsb2FkXCI7XG5cdGxldCBkYXRhT2JqID0ge1xuXHRcdGZpbGU6IFtmaWxlQmxvYiwgZmlsZU5hbWVdLFxuXHRcdHBhcmVudEZvbGRlclVyaVxuXHR9XG5cblx0Y29uc3Qgb3B0aW9uc09iaiA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcblx0XHRwYXJhbXM6IGRhdGFPYmosXG5cdFx0dXNlTXVsdGlwYXJ0Rm9ybURhdGE6IHRydWUsXG5cdH0pXG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdwb3N0JywgdXJsLCBvcHRpb25zT2JqKTtcbn1cblxuLyoqXG4gKiBHZW5lcmljIGRlbGV0ZSBmdW5jdGlvbiB0aGF0IGRlbGV0ZXMgYnkgVVJJXG4gKiBAcGFyYW0ge1N0cmluZ30gaXRlbVVyaSAtIE5hbWUgb2YgdGhlIGl0ZW0gYmVpbmcgZGVsZXRlZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcbiAqL1xubW9kdWxlLmV4cG9ydHMuZGVsZXRlSXRlbSA9IGZ1bmN0aW9uIChpdGVtVXJpLCBvcHRpb25zKSB7XG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdkZWxldGUnLCBpdGVtVXJpLCBvcHRpb25zKVxufVxuXG5cbi8qKlxuICogVXBkYXRlcyBjb250ZW50cyBvZiBhIGZpbGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlTmFtZSAtIE5hbWUgb2YgdGhlIGZpbGUgYmVpbmcgdXBkYXRlZFxuICogQHBhcmFtIHtPYmplY3QgfCBCbG9ifSBkYXRhT2JqIC0gTmV3IGNvbnRlbnQgb2YgdGhlIGZpbGUgKE9iamVjdCBtdXN0IGNvbnRhaW4gZmlsZSBrZXkpXG4gKiBPYmplY3QgZXhhbXBsZSB7XG4gKiAgIGZpbGU6IFs8YmxvYj4sIDxmaWxlTmFtZT5dXG4gKiB9XG4gKiBAcGFyYW0ge1N0cmluZ30gbGFzdE1vZGlmaWVkIC0gdGhlIGxhc3QtbW9kaWZpZWQgaGVhZGVyIHN0cmluZyB0aGF0IG1hdGNoZXMgdGhhdCBvZiBmaWxlIGJlaW5nIG92ZXJ3cml0dGVuXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxuICovXG5tb2R1bGUuZXhwb3J0cy51cGRhdGVGaWxlID0gZnVuY3Rpb24gKGl0ZW1VcmksIGRhdGFPYmosIGxhc3RNb2RpZmllZCwgb3B0aW9ucykge1xuXHRjb25zdCB1cmwgPSBpdGVtVXJpICsgJy9jb250ZW50J1xuXHRjb25zb2xlLmxvZygnVVJMJywgdXJsKVxuXHRsZXQgaGVhZGVycyA9IHtcblx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL3ZuZC5zYXMuZmlsZScsXG5cdFx0J0lmLVVubW9kaWZpZWQtU2luY2UnOiBsYXN0TW9kaWZpZWRcblx0fVxuXHRjb25zdCBpc0Jsb2IgPSBkYXRhT2JqIGluc3RhbmNlb2YgQmxvYlxuXHRjb25zdCB1c2VNdWx0aXBhcnRGb3JtRGF0YSA9ICFpc0Jsb2IgLy8gc2V0IHVzZU11bHRpcGFydEZvcm1EYXRhIHRvIHRydWUgaWYgZGF0YU9iaiBpcyBub3QgQmxvYlxuXG5cdGNvbnN0IG9wdGlvbnNPYmogPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7XG5cdFx0cGFyYW1zOiBkYXRhT2JqLFxuXHRcdGhlYWRlcnMsXG5cdFx0dXNlTXVsdGlwYXJ0Rm9ybURhdGFcblx0fSlcblx0cmV0dXJuIHRoaXMubWFuYWdlZFJlcXVlc3QoJ3B1dCcsIHVybCwgb3B0aW9uc09iaik7XG59XG5cbi8qKlxuIFVwZGF0ZXMgZmlsZSBNZXRhZGF0YSBcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlTmFtZSAtIE5hbWUgb2YgdGhlIGZpbGUgYmVpbmcgdXBkYXRlZFxuICogQHBhcmFtIHtTdHJpbmd9IGxhc3RNb2RpZmllZCAtIHRoZSBsYXN0LW1vZGlmaWVkIGhlYWRlciBzdHJpbmcgdGhhdCBtYXRjaGVzIHRoYXQgb2YgZmlsZSBiZWluZyB1cGRhdGVkXG4gKiBAcGFyYW0ge09iamVjdCB8IEJsb2J9IGRhdGFPYmogLSBvYmplY3RzIGNvbnRhaW5pbmcgdGhlIGZpZWxkcyB0aGF0IGFyZSBiZWluZyBjaGFuZ2VkXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxuICovXG5tb2R1bGUuZXhwb3J0cy51cGRhdGVGaWxlTWV0YWRhdGEgPSBmdW5jdGlvbiAoaXRlbVVyaSwgZGF0YU9iaiwgbGFzdE1vZGlmaWVkLCBvcHRpb25zKSB7XG4gIGxldCBoZWFkZXJzID0ge1xuICAgICdDb250ZW50LVR5cGUnOidhcHBsaWNhdGlvbi92bmQuc2FzLmZpbGUranNvbicsXG5cdFx0J0lmLVVubW9kaWZpZWQtU2luY2UnOiBsYXN0TW9kaWZpZWRcbiAgfVxuICBjb25zdCBpc0Jsb2IgPSBkYXRhT2JqIGluc3RhbmNlb2YgQmxvYlxuICBjb25zdCB1c2VNdWx0aXBhcnRGb3JtRGF0YSA9ICFpc0Jsb2IgLy8gc2V0IHVzZU11bHRpcGFydEZvcm1EYXRhIHRvIHRydWUgaWYgZGF0YU9iaiBpcyBub3QgQmxvYlxuICBcbiAgY29uc3Qgb3B0aW9uc09iaiA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcbiAgICBwYXJhbXM6IGRhdGFPYmosXG4gICAgaGVhZGVycyxcbiAgICB1c2VNdWx0aXBhcnRGb3JtRGF0YVxuICB9KVxuXG4gIHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdwYXRjaCcsIGl0ZW1VcmksIG9wdGlvbnNPYmopO1xufVxuXG4vKipcbiAqIFVwZGF0ZXMgZm9sZGVyIGluZm9cbiAqIEBwYXJhbSB7U3RyaW5nfSBmb2xkZXJVcmkgLSB1cmkgb2YgdGhlIGZvbGRlciB0aGF0IGlzIGJlaW5nIGNoYW5nZWRcbiAqIEBwYXJhbSB7U3RyaW5nfSBsYXN0TW9kaWZpZWQgLSB0aGUgbGFzdC1tb2RpZmllZCBoZWFkZXIgc3RyaW5nIHRoYXQgbWF0Y2hlcyB0aGF0IG9mIHRoZSBmb2xkZXIgYmVpbmcgdXBkYXRlZFxuICogQHBhcmFtIHtPYmplY3QgfCBCbG9ifSBkYXRhT2JqIC0gb2JqZWN0IHRoYXRzIGlzIGVpdGhlciB0aGUgd2hvbGUgZm9sZGVyIG9yIHBhcnRpYWwgZGF0YVxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcbiAqL1xubW9kdWxlLmV4cG9ydHMudXBkYXRlRm9sZGVyTWV0YWRhdGEgPSBmdW5jdGlvbiAoZm9sZGVyVXJpLCBkYXRhT2JqLCBsYXN0TW9kaWZpZWQsIG9wdGlvbnMpIHtcblxuICAvKipcbiAgICBAY29uc3RhbnQge0Jvb2xlYW59IHBhcnRpYWxEYXRhIC0gaW5kaWNhdGVzIHdldGhlciBkYXRhT2JqIGNvbnRhaW50cyBhbGwgdGhlIGRhdGEgdGhhdCBuZWVkcyB0byBiZSBzZW5kIHRvIHRoZSBzZXJ2ZXJcbiAgICBvciBwYXJ0aWFsIGRhdGEgd2hpY2ggY29udGF0aW5zIG9ubHkgdGhlIGZpZWxkcyB0aGF0IG5lZWQgdG8gYmUgdXBkYXRlZCwgaW4gd2hpY2ggY2FzZSBhIGNhbGwgbmVlZHMgdG8gYmUgbWFkZSB0byB0aGUgc2VydmVyIGZvciBcbiAgICB0aGUgcmVzdCBvZiB0aGUgZGF0YSBiZWZvcmUgdGhlIHVwZGF0ZSBjYW4gYmUgZG9uZVxuICAgKi9cbiAgY29uc3Qge3BhcnRpYWxEYXRhfSA9IG9wdGlvbnM7XG5cbiAgY29uc3QgaGVhZGVycyA9IHtcbiAgICAnQ29udGVudC1UeXBlJzogXCJhcHBsaWNhdGlvbi92bmQuc2FzLmNvbnRlbnQuZm9sZGVyK2pzb25cIixcbiAgICAnSWYtVW5tb2RpZmllZC1TaW5jZSc6IGxhc3RNb2RpZmllZCxcbiAgfVxuXG4gIGlmIChwYXJ0aWFsRGF0YSkge1xuXG4gICAgY29uc3QgX2NhbGxiYWNrID0gKGVyciwgcmVzKSA9PiB7XG4gICAgICBpZiAocmVzKSB7XG5cbiAgICAgICAgY29uc3QgZm9sZGVyID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzLmJvZHksIGRhdGFPYmopO1xuXG4gICAgICAgIGxldCBmb3JCbG9iID0gSlNPTi5zdHJpbmdpZnkoZm9sZGVyKTtcbiAgICAgICAgbGV0IGRhdGEgPSBuZXcgQmxvYihbZm9yQmxvYl0sIHt0eXBlOiBcIm9jdGV0L3N0cmVhbVwifSk7XG5cbiAgICAgICAgY29uc3Qgb3B0aW9uc09iaiA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcbiAgICAgICAgICBwYXJhbXM6IGRhdGEsXG4gICAgICAgICAgaGVhZGVycyxcbiAgICAgICAgICB1c2VNdWx0aXBhcnRGb3JtRGF0YSA6IGZhbHNlLFxuICAgICAgICB9KVxuXG4gICAgICAgIHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdwdXQnLCBmb2xkZXJVcmksIG9wdGlvbnNPYmopO1xuICAgICAgfVxuICAgICAgXG4gICAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhlcnIpO1xuICAgIH1cbiAgICBjb25zdCBnZXRPcHRpb25zT2JqID0gT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge1xuICAgICAgaGVhZGVyczogeydDb250ZW50LVR5cGUnOiBcImFwcGxpY2F0aW9uL3ZuZC5zYXMuY29udGVudC5mb2xkZXIranNvblwifSxcbiAgICAgIGNhbGxiYWNrOiBfY2FsbGJhY2tcbiAgICB9KVxuXG4gICAgcmV0dXJuIHRoaXMubWFuYWdlZFJlcXVlc3QoJ2dldCcsIGZvbGRlclVyaSwgZ2V0T3B0aW9uc09iaik7XG4gIH1cbiAgZWxzZSB7XG4gICAgaWYgKCAhKGRhdGFPYmogaW5zdGFuY2VvZiBCbG9iKSkge1xuICAgICAgbGV0IGZvckJsb2IgPSBKU09OLnN0cmluZ2lmeShkYXRhT2JqKTtcbiAgICAgIGRhdGFPYmogPSBuZXcgQmxvYihbZm9yQmxvYl0sIHt0eXBlOiBcIm9jdGV0L3N0cmVhbVwifSk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3B0aW9uc09iaiA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcbiAgICAgIHBhcmFtczogZGF0YU9iaixcbiAgICAgIGhlYWRlcnMsXG4gICAgICB1c2VNdWx0aXBhcnRGb3JtRGF0YSA6IGZhbHNlLFxuICAgIH0pXG4gICAgcmV0dXJuIHRoaXMubWFuYWdlZFJlcXVlc3QoJ3B1dCcsIGZvbGRlclVyaSwgb3B0aW9uc09iaik7XG4gIH1cbn0iLCJjb25zdCBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xuY29uc3QgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcblxuY29uc3QgcHJvZ3JhbU5vdEZvdW5kUGF0dCA9IC88dGl0bGU+KFN0b3JlZCBQcm9jZXNzIEVycm9yfFNBU1N0b3JlZFByb2Nlc3MpPFxcL3RpdGxlPltcXHNcXFNdKjxoMj4oU3RvcmVkIHByb2Nlc3Mgbm90IGZvdW5kOi4qfC4qbm90IGEgdmFsaWQgc3RvcmVkIHByb2Nlc3MgcGF0aC4pPFxcL2gyPi87XG5jb25zdCBiYWRKb2JEZWZpbml0aW9uID0gXCI8aDI+UGFyYW1ldGVyIEVycm9yIDxici8+VW5hYmxlIHRvIGdldCBqb2IgZGVmaW5pdGlvbi48L2gyPlwiO1xuXG5jb25zdCByZXNwb25zZVJlcGxhY2UgPSBmdW5jdGlvbihyZXMpIHtcbiAgcmV0dXJuIHJlc1xufTtcblxuLyoqXG4qIFBhcnNlIHJlc3BvbnNlIGZyb20gc2VydmVyXG4qXG4qIEBwYXJhbSB7b2JqZWN0fSByZXNwb25zZVRleHQgLSByZXNwb25zZSBodG1sIGZyb20gdGhlIHNlcnZlclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcbiogQHBhcmFtIHtvYmplY3R9IHBhcmFtcyAtIHBhcmFtcyBzZW50IHRvIHNhcyBwcm9ncmFtIHdpdGggYWRkVGFibGVcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZVJlcyA9IGZ1bmN0aW9uKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKSB7XG4gIGNvbnN0IG1hdGNoZXMgPSByZXNwb25zZVRleHQubWF0Y2gocHJvZ3JhbU5vdEZvdW5kUGF0dCk7XG4gIGlmKG1hdGNoZXMpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtTm90Rm91bmQnLCAnWW91IGhhdmUgbm90IGJlZW4gZ3JhbnRlZCBwZXJtaXNzaW9uIHRvIHBlcmZvcm0gdGhpcyBhY3Rpb24sIG9yIHRoZSBTVFAgaXMgbWlzc2luZy4nKTtcbiAgfVxuICAvL3JlbW92ZSBuZXcgbGluZXMgaW4ganNvbiByZXNwb25zZVxuICAvL3JlcGxhY2UgXFxcXChkKSB3aXRoIFxcKGQpIC0gU0FTIGpzb24gcGFyc2VyIGlzIGVzY2FwaW5nIGl0XG4gIHJldHVybiBKU09OLnBhcnNlKHJlc3BvbnNlUmVwbGFjZShyZXNwb25zZVRleHQpKTtcbn07XG5cbi8qKlxuKiBQYXJzZSByZXNwb25zZSBmcm9tIHNlcnZlciBpbiBkZWJ1ZyBtb2RlXG4qXG4qIEBwYXJhbSB7b2JqZWN0fSByZXNwb25zZVRleHQgLSByZXNwb25zZSBodG1sIGZyb20gdGhlIHNlcnZlclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcbiogQHBhcmFtIHtvYmplY3R9IHBhcmFtcyAtIHBhcmFtcyBzZW50IHRvIHNhcyBwcm9ncmFtIHdpdGggYWRkVGFibGVcbiogQHBhcmFtIHtzdHJpbmd9IGhvc3RVcmwgLSBzYW1lIGFzIGluIGg1NHMgY29uc3RydWN0b3JcbiogQHBhcmFtIHtib29sfSBpc1ZpeWEgLSBzYW1lIGFzIGluIGg1NHMgY29uc3RydWN0b3JcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZURlYnVnUmVzID0gZnVuY3Rpb24gKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zLCBob3N0VXJsLCBpc1ZpeWEpIHtcblx0Y29uc3Qgc2VsZiA9IHRoaXNcblx0bGV0IG1hdGNoZXMgPSByZXNwb25zZVRleHQubWF0Y2gocHJvZ3JhbU5vdEZvdW5kUGF0dCk7XG5cdGlmIChtYXRjaGVzKSB7XG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcigncHJvZ3JhbU5vdEZvdW5kJywgJ1NhcyBwcm9ncmFtIGNvbXBsZXRlZCB3aXRoIGVycm9ycycpO1xuXHR9XG5cblx0aWYgKGlzVml5YSkge1xuXHRcdGNvbnN0IG1hdGNoZXNXcm9uZ0pvYiA9IHJlc3BvbnNlVGV4dC5tYXRjaChiYWRKb2JEZWZpbml0aW9uKTtcblx0XHRpZiAobWF0Y2hlc1dyb25nSm9iKSB7XG5cdFx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtTm90Rm91bmQnLCAnU2FzIHByb2dyYW0gY29tcGxldGVkIHdpdGggZXJyb3JzLiBVbmFibGUgdG8gZ2V0IGpvYiBkZWZpbml0aW9uLicpO1xuXHRcdH1cblx0fVxuXG5cdC8vZmluZCBqc29uXG5cdGxldCBwYXR0ID0gaXNWaXlhID8gL14oLj88aWZyYW1lLipzcmM9XCIpKFteXCJdKykoLippZnJhbWU+KS9tIDogL14oLj8tLWg1NHMtZGF0YS1zdGFydC0tKShbXFxTXFxzXSo/KSgtLWg1NHMtZGF0YS1lbmQtLSkvbTtcblx0bWF0Y2hlcyA9IHJlc3BvbnNlVGV4dC5tYXRjaChwYXR0KTtcblxuXHRjb25zdCBwYWdlID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UocGF0dCwgJycpO1xuXHRjb25zdCBodG1sQm9keVBhdHQgPSAvPGJvZHkuKj4oW1xcc1xcU10qKTxcXC9ib2R5Pi87XG5cdGNvbnN0IGJvZHlNYXRjaGVzID0gcGFnZS5tYXRjaChodG1sQm9keVBhdHQpO1xuXHQvL3JlbW92ZSBodG1sIHRhZ3Ncblx0bGV0IGRlYnVnVGV4dCA9IGJvZHlNYXRjaGVzWzFdLnJlcGxhY2UoLzxbXj5dKj4vZywgJycpO1xuXHRkZWJ1Z1RleHQgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhkZWJ1Z1RleHQpO1xuXG5cdGxvZ3MuYWRkRGVidWdEYXRhKGJvZHlNYXRjaGVzWzFdLCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0sIHBhcmFtcyk7XG5cbiAgaWYgKGlzVml5YSAmJiB0aGlzLnBhcnNlRXJyb3JSZXNwb25zZShyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pKSB7XG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcignc2FzRXJyb3InLCAnU2FzIHByb2dyYW0gY29tcGxldGVkIHdpdGggZXJyb3JzJyk7XG5cdH1cblx0aWYgKCFtYXRjaGVzKSB7XG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpO1xuXHR9XG5cblxuXHRjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuXHRcdGxldCBqc29uT2JqXG5cdFx0aWYgKGlzVml5YSkge1xuXHRcdFx0Y29uc3QgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cdFx0XHRjb25zdCBiYXNlVXJsID0gaG9zdFVybCB8fCBcIlwiO1xuXHRcdFx0eGhyLm9wZW4oXCJHRVRcIiwgYmFzZVVybCArIG1hdGNoZXNbMl0pO1xuXHRcdFx0eGhyLm9ubG9hZCA9IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0aWYgKHRoaXMuc3RhdHVzID49IDIwMCAmJiB0aGlzLnN0YXR1cyA8IDMwMCkge1xuXHRcdFx0XHRcdHJlc29sdmUoSlNPTi5wYXJzZSh4aHIucmVzcG9uc2VUZXh0LnJlcGxhY2UoLyhcXHJcXG58XFxyfFxcbikvZywgJycpKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVqZWN0KG5ldyBoNTRzRXJyb3IoJ2ZldGNoRXJyb3InLCB4aHIuc3RhdHVzVGV4dCwgdGhpcy5zdGF0dXMpKVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0eGhyLm9uZXJyb3IgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHJlamVjdChuZXcgaDU0c0Vycm9yKCdmZXRjaEVycm9yJywgeGhyLnN0YXR1c1RleHQpKVxuXHRcdFx0fTtcblx0XHRcdHhoci5zZW5kKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGpzb25PYmogPSBKU09OLnBhcnNlKHJlc3BvbnNlUmVwbGFjZShtYXRjaGVzWzJdKSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHJlamVjdChuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJykpXG5cdFx0XHR9XG5cblx0XHRcdGlmIChqc29uT2JqICYmIGpzb25PYmouaDU0c0Fib3J0KSB7XG5cdFx0XHRcdHJlc29sdmUoanNvbk9iaik7XG5cdFx0XHR9IGVsc2UgaWYgKHNlbGYucGFyc2VFcnJvclJlc3BvbnNlKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSkpIHtcblx0XHRcdFx0cmVqZWN0KG5ldyBoNTRzRXJyb3IoJ3Nhc0Vycm9yJywgJ1NhcyBwcm9ncmFtIGNvbXBsZXRlZCB3aXRoIGVycm9ycycpKVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzb2x2ZShqc29uT2JqKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJldHVybiBwcm9taXNlO1xufTtcblxuLyoqXG4qIEFkZCBmYWlsZWQgcmVzcG9uc2UgdG8gbG9ncyAtIHVzZWQgb25seSBpZiBkZWJ1Zz1mYWxzZVxuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSBwYXRoXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkRmFpbGVkUmVzcG9uc2UgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pIHtcbiAgY29uc3QgcGF0dCAgICAgID0gLzxzY3JpcHQoW1xcc1xcU10qKVxcL2Zvcm0+LztcbiAgY29uc3QgcGF0dDIgICAgID0gL2Rpc3BsYXlcXHM/Olxccz9ub25lOz9cXHM/LztcbiAgLy9yZW1vdmUgc2NyaXB0IHdpdGggZm9ybSBmb3IgdG9nZ2xpbmcgdGhlIGxvZ3MgYW5kIFwiZGlzcGxheTpub25lXCIgZnJvbSBzdHlsZVxuICByZXNwb25zZVRleHQgID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UocGF0dCwgJycpLnJlcGxhY2UocGF0dDIsICcnKTtcbiAgbGV0IGRlYnVnVGV4dCA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKC88W14+XSo+L2csICcnKTtcbiAgZGVidWdUZXh0ID0gdGhpcy5kZWNvZGVIVE1MRW50aXRpZXMoZGVidWdUZXh0KTtcblxuICBsb2dzLmFkZEZhaWxlZFJlcXVlc3QocmVzcG9uc2VUZXh0LCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0pO1xufTtcblxuLyoqXG4qIFVuZXNjYXBlIGFsbCBzdHJpbmcgdmFsdWVzIGluIHJldHVybmVkIG9iamVjdFxuKlxuKiBAcGFyYW0ge29iamVjdH0gb2JqXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMudW5lc2NhcGVWYWx1ZXMgPSBmdW5jdGlvbihvYmopIHtcbiAgZm9yIChsZXQga2V5IGluIG9iaikge1xuICAgIGlmICh0eXBlb2Ygb2JqW2tleV0gPT09ICdzdHJpbmcnKSB7XG4gICAgICBvYmpba2V5XSA9IGRlY29kZVVSSUNvbXBvbmVudChvYmpba2V5XSk7XG4gICAgfSBlbHNlIGlmKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgICB0aGlzLnVuZXNjYXBlVmFsdWVzKG9ialtrZXldKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG9iajtcbn07XG5cbi8qKlxuKiBQYXJzZSBlcnJvciByZXNwb25zZSBmcm9tIHNlcnZlciBhbmQgc2F2ZSBlcnJvcnMgaW4gbWVtb3J5XG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSB3aGljaCByZXR1cm5lZCB0aGUgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZUVycm9yUmVzcG9uc2UgPSBmdW5jdGlvbihyZXMsIHNhc1Byb2dyYW0pIHtcbiAgLy9jYXB0dXJlICdFUlJPUjogW3RleHRdLicgb3IgJ0VSUk9SIHh4IFt0ZXh0XS4nXG4gIGNvbnN0IHBhdHQgICAgPSAvXkVSUk9SKDpcXHN8XFxzXFxkXFxkKSguKlxcLnwuKlxcbi4qXFwuKS9nbTtcbiAgbGV0IGVycm9ycyAgPSByZXMucmVwbGFjZSgvKDwoW14+XSspPikvaWcsICcnKS5tYXRjaChwYXR0KTtcbiAgaWYoIWVycm9ycykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGxldCBlcnJNZXNzYWdlO1xuICBmb3IobGV0IGkgPSAwLCBuID0gZXJyb3JzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgIGVyck1lc3NhZ2UgID0gZXJyb3JzW2ldLnJlcGxhY2UoLzxbXj5dKj4vZywgJycpLnJlcGxhY2UoLyhcXG58XFxzezIsfSkvZywgJyAnKTtcbiAgICBlcnJNZXNzYWdlICA9IHRoaXMuZGVjb2RlSFRNTEVudGl0aWVzKGVyck1lc3NhZ2UpO1xuICAgIGVycm9yc1tpXSAgID0ge1xuICAgICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbSxcbiAgICAgIG1lc3NhZ2U6ICAgIGVyck1lc3NhZ2UsXG4gICAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpXG4gICAgfTtcbiAgfVxuXG4gIGxvZ3MuYWRkU2FzRXJyb3JzKGVycm9ycyk7XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vKipcbiogRGVjb2RlIEhUTUwgZW50aXRpZXMgLSBvbGQgdXRpbGl0eSBmdW5jdGlvblxuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuZGVjb2RlSFRNTEVudGl0aWVzID0gZnVuY3Rpb24gKGh0bWwpIHtcbiAgY29uc3QgdGVtcEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gIGxldCBzdHJcdD0gaHRtbC5yZXBsYWNlKC8mKCMoPzp4WzAtOWEtZl0rfFxcZCspfFthLXpdKyk7L2dpLFxuICAgIGZ1bmN0aW9uIChzdHIpIHtcbiAgICAgIHRlbXBFbGVtZW50LmlubmVySFRNTCA9IHN0cjtcbiAgICAgIHN0ciA9IHRlbXBFbGVtZW50LnRleHRDb250ZW50IHx8IHRlbXBFbGVtZW50LmlubmVyVGV4dDtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICApO1xuICByZXR1cm4gc3RyO1xufTtcblxuLyoqXG4qIENvbnZlcnQgc2FzIHRpbWUgdG8gamF2YXNjcmlwdCBkYXRlXG4qXG4qIEBwYXJhbSB7bnVtYmVyfSBzYXNEYXRlIC0gc2FzIFRhdGUgb2JqZWN0XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuZnJvbVNhc0RhdGVUaW1lID0gZnVuY3Rpb24gKHNhc0RhdGUpIHtcbiAgY29uc3QgYmFzZWRhdGUgPSBuZXcgRGF0ZShcIkphbnVhcnkgMSwgMTk2MCAwMDowMDowMFwiKTtcbiAgY29uc3QgY3VycmRhdGUgPSBzYXNEYXRlO1xuXG4gIC8vIG9mZnNldHMgZm9yIFVUQyBhbmQgdGltZXpvbmVzIGFuZCBCU1RcbiAgY29uc3QgYmFzZU9mZnNldCA9IGJhc2VkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcblxuICAvLyBjb252ZXJ0IHNhcyBkYXRldGltZSB0byBhIGN1cnJlbnQgdmFsaWQgamF2YXNjcmlwdCBkYXRlXG4gIGNvbnN0IGJhc2VkYXRlTXMgID0gYmFzZWRhdGUuZ2V0VGltZSgpOyAvLyBpbiBtc1xuICBjb25zdCBjdXJyZGF0ZU1zICA9IGN1cnJkYXRlICogMTAwMDsgLy8gdG8gbXNcbiAgY29uc3Qgc2FzRGF0ZXRpbWUgPSBjdXJyZGF0ZU1zICsgYmFzZWRhdGVNcztcbiAgY29uc3QganNEYXRlICAgICAgPSBuZXcgRGF0ZSgpO1xuICBqc0RhdGUuc2V0VGltZShzYXNEYXRldGltZSk7IC8vIGZpcnN0IHRpbWUgdG8gZ2V0IG9mZnNldCBCU1QgZGF5bGlnaHQgc2F2aW5ncyBldGNcbiAgY29uc3QgY3Vyck9mZnNldCAgPSBqc0RhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gYWRqdXN0IGZvciBvZmZzZXQgaW4gbWludXRlc1xuICBjb25zdCBvZmZzZXRWYXIgICA9IChiYXNlT2Zmc2V0IC0gY3Vyck9mZnNldCkgKiA2MCAqIDEwMDA7IC8vIGRpZmZlcmVuY2UgaW4gbWlsbGlzZWNvbmRzXG4gIGNvbnN0IG9mZnNldFRpbWUgID0gc2FzRGF0ZXRpbWUgLSBvZmZzZXRWYXI7IC8vIGZpbmRpbmcgQlNUIGFuZCBkYXlsaWdodCBzYXZpbmdzXG4gIGpzRGF0ZS5zZXRUaW1lKG9mZnNldFRpbWUpOyAvLyB1cGRhdGUgd2l0aCBvZmZzZXRcbiAgcmV0dXJuIGpzRGF0ZTtcbn07XG5cbi8qKlxuICogQ2hlY2tzIHdoZXRoZXIgcmVzcG9uc2Ugb2JqZWN0IGlzIGEgbG9naW4gcmVkaXJlY3RcbiAqIEBwYXJhbSB7T2JqZWN0fSByZXNwb25zZU9iaiB4aHIgcmVzcG9uc2UgdG8gYmUgY2hlY2tlZCBmb3IgbG9nb24gcmVkaXJlY3RcbiAqL1xubW9kdWxlLmV4cG9ydHMubmVlZFRvTG9naW4gPSBmdW5jdGlvbihyZXNwb25zZU9iaikge1xuXHRjb25zdCBpc1NBU0xvZ29uID0gcmVzcG9uc2VPYmoucmVzcG9uc2VVUkwgJiYgcmVzcG9uc2VPYmoucmVzcG9uc2VVUkwuaW5jbHVkZXMoJ1NBU0xvZ29uJylcblx0aWYgKGlzU0FTTG9nb24gPT09IGZhbHNlKSB7XG5cdFx0cmV0dXJuIGZhbHNlXG5cdH1cblxuICBjb25zdCBwYXR0ID0gLzxmb3JtLithY3Rpb249XCIoLipMb2dvblteXCJdKikuKj4vO1xuICBjb25zdCBtYXRjaGVzID0gcGF0dC5leGVjKHJlc3BvbnNlT2JqLnJlc3BvbnNlVGV4dCk7XG4gIGxldCBuZXdMb2dpblVybDtcblxuICBpZighbWF0Y2hlcykge1xuICAgIC8vdGhlcmUncyBubyBmb3JtLCB3ZSBhcmUgaW4uIGhvb3JheSFcbiAgICByZXR1cm4gZmFsc2U7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgYWN0aW9uVXJsID0gbWF0Y2hlc1sxXS5yZXBsYWNlKC9cXD8uKi8sICcnKTtcbiAgICBpZihhY3Rpb25VcmwuY2hhckF0KDApID09PSAnLycpIHtcbiAgICAgIG5ld0xvZ2luVXJsID0gdGhpcy5ob3N0VXJsID8gdGhpcy5ob3N0VXJsICsgYWN0aW9uVXJsIDogYWN0aW9uVXJsO1xuICAgICAgaWYobmV3TG9naW5VcmwgIT09IHRoaXMubG9naW5VcmwpIHtcbiAgICAgICAgdGhpcy5fbG9naW5DaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5sb2dpblVybCA9IG5ld0xvZ2luVXJsO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvL3JlbGF0aXZlIHBhdGhcblxuICAgICAgY29uc3QgbGFzdEluZE9mU2xhc2ggPSByZXNwb25zZU9iai5yZXNwb25zZVVSTC5sYXN0SW5kZXhPZignLycpICsgMTtcbiAgICAgIC8vcmVtb3ZlIGV2ZXJ5dGhpbmcgYWZ0ZXIgdGhlIGxhc3Qgc2xhc2gsIGFuZCBldmVyeXRoaW5nIHVudGlsIHRoZSBmaXJzdFxuICAgICAgY29uc3QgcmVsYXRpdmVMb2dpblVybCA9IHJlc3BvbnNlT2JqLnJlc3BvbnNlVVJMLnN1YnN0cigwLCBsYXN0SW5kT2ZTbGFzaCkucmVwbGFjZSgvLipcXC97Mn1bXlxcL10qLywgJycpICsgYWN0aW9uVXJsO1xuICAgICAgbmV3TG9naW5VcmwgPSB0aGlzLmhvc3RVcmwgPyB0aGlzLmhvc3RVcmwgKyByZWxhdGl2ZUxvZ2luVXJsIDogcmVsYXRpdmVMb2dpblVybDtcbiAgICAgIGlmKG5ld0xvZ2luVXJsICE9PSB0aGlzLmxvZ2luVXJsKSB7XG4gICAgICAgIHRoaXMuX2xvZ2luQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIHRoaXMubG9naW5VcmwgPSBuZXdMb2dpblVybDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL3NhdmUgcGFyYW1ldGVycyBmcm9tIGhpZGRlbiBmb3JtIGZpZWxkc1xuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBET01QYXJzZXIoKTtcbiAgICBjb25zdCBkb2MgPSBwYXJzZXIucGFyc2VGcm9tU3RyaW5nKHJlc3BvbnNlT2JqLnJlc3BvbnNlVGV4dCxcInRleHQvaHRtbFwiKTtcbiAgICBjb25zdCByZXMgPSBkb2MucXVlcnlTZWxlY3RvckFsbChcImlucHV0W3R5cGU9J2hpZGRlbiddXCIpO1xuICAgIGNvbnN0IGhpZGRlbkZvcm1QYXJhbXMgPSB7fTtcbiAgICBpZihyZXMpIHtcbiAgICAgIC8vaXQncyBuZXcgbG9naW4gcGFnZSBpZiB3ZSBoYXZlIHRoZXNlIGFkZGl0aW9uYWwgcGFyYW1ldGVyc1xuICAgICAgdGhpcy5faXNOZXdMb2dpblBhZ2UgPSB0cnVlO1xuICAgICAgcmVzLmZvckVhY2goZnVuY3Rpb24obm9kZSkge1xuICAgICAgICBoaWRkZW5Gb3JtUGFyYW1zW25vZGUubmFtZV0gPSBub2RlLnZhbHVlO1xuICAgICAgfSk7XG4gICAgICB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtcyA9IGhpZGRlbkZvcm1QYXJhbXM7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG59O1xuXG4vKipcbiogR2V0IGZ1bGwgcHJvZ3JhbSBwYXRoIGZyb20gbWV0YWRhdGEgcm9vdCBhbmQgcmVsYXRpdmUgcGF0aFxuKlxuKiBAcGFyYW0ge3N0cmluZ30gbWV0YWRhdGFSb290IC0gTWV0YWRhdGEgcm9vdCAocGF0aCB3aGVyZSBhbGwgcHJvZ3JhbXMgZm9yIHRoZSBwcm9qZWN0IGFyZSBsb2NhdGVkKVxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbVBhdGggLSBTYXMgcHJvZ3JhbSBwYXRoXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuZ2V0RnVsbFByb2dyYW1QYXRoID0gZnVuY3Rpb24obWV0YWRhdGFSb290LCBzYXNQcm9ncmFtUGF0aCkge1xuICByZXR1cm4gbWV0YWRhdGFSb290ID8gbWV0YWRhdGFSb290LnJlcGxhY2UoL1xcLz8kLywgJy8nKSArIHNhc1Byb2dyYW1QYXRoLnJlcGxhY2UoL15cXC8vLCAnJykgOiBzYXNQcm9ncmFtUGF0aDtcbn07XG5cbi8vIFJldHVybnMgb2JqZWN0IHdoZXJlIHRhYmxlIHJvd3MgYXJlIGdyb3VwcGVkIGJ5IGtleVxubW9kdWxlLmV4cG9ydHMuZ2V0T2JqT2ZUYWJsZSA9IGZ1bmN0aW9uICh0YWJsZSwga2V5LCB2YWx1ZSA9IG51bGwpIHtcblx0Y29uc3Qgb2JqID0ge31cblx0dGFibGUuZm9yRWFjaChyb3cgPT4ge1xuXHRcdG9ialtyb3dba2V5XV0gPSB2YWx1ZSA/IHJvd1t2YWx1ZV0gOiByb3dcblx0fSlcblx0cmV0dXJuIG9ialxufVxuXG4vLyBSZXR1cm5zIHNlbGYgdXJpIG91dCBvZiBsaW5rcyBhcnJheVxubW9kdWxlLmV4cG9ydHMuZ2V0U2VsZlVyaSA9IGZ1bmN0aW9uIChsaW5rcykge1xuXHRyZXR1cm4gbGlua3Ncblx0XHQuZmlsdGVyKGUgPT4gZS5yZWwgPT09ICdzZWxmJylcblx0XHQubWFwKGUgPT4gZS51cmkpXG5cdFx0LnNoaWZ0KCk7XG59XG4iLCJjb25zdCBoNTRzRXJyb3IgPSByZXF1aXJlKCcuL2Vycm9yLmpzJyk7XG5jb25zdCBsb2dzICAgICAgPSByZXF1aXJlKCcuL2xvZ3MuanMnKTtcbmNvbnN0IFRhYmxlcyAgICA9IHJlcXVpcmUoJy4vdGFibGVzJyk7XG5jb25zdCBGaWxlcyAgICAgPSByZXF1aXJlKCcuL2ZpbGVzJyk7XG5jb25zdCB0b1Nhc0RhdGVUaW1lID0gcmVxdWlyZSgnLi90YWJsZXMvdXRpbHMuanMnKS50b1Nhc0RhdGVUaW1lO1xuXG4vKipcbiAqIENoZWNrcyB3aGV0aGVyIGEgZ2l2ZW4gdGFibGUgbmFtZSBpcyBhIHZhbGlkIFNBUyBtYWNybyBuYW1lXG4gKiBAcGFyYW0ge1N0cmluZ30gbWFjcm9OYW1lIFRoZSBTQVMgbWFjcm8gbmFtZSB0byBiZSBnaXZlbiB0byB0aGlzIHRhYmxlXG4gKi9cbmZ1bmN0aW9uIHZhbGlkYXRlTWFjcm8obWFjcm9OYW1lKSB7XG4gIGlmKG1hY3JvTmFtZS5sZW5ndGggPiAzMikge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgbmFtZSB0b28gbG9uZy4gTWF4aW11bSBpcyAzMiBjaGFyYWN0ZXJzJyk7XG4gIH1cblxuICBjb25zdCBjaGFyQ29kZUF0MCA9IG1hY3JvTmFtZS5jaGFyQ29kZUF0KDApO1xuICAvLyB2YWxpZGF0ZSBpdCBzdGFydHMgd2l0aCBBLVosIGEteiwgb3IgX1xuICBpZigoY2hhckNvZGVBdDAgPCA2NSB8fCBjaGFyQ29kZUF0MCA+IDkwKSAmJiAoY2hhckNvZGVBdDAgPCA5NyB8fCBjaGFyQ29kZUF0MCA+IDEyMikgJiYgbWFjcm9OYW1lWzBdICE9PSAnXycpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIG5hbWUgc3RhcnRpbmcgd2l0aCBudW1iZXIgb3Igc3BlY2lhbCBjaGFyYWN0ZXJzJyk7XG4gIH1cblxuICBmb3IobGV0IGkgPSAwOyBpIDwgbWFjcm9OYW1lLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgY2hhckNvZGUgPSBtYWNyb05hbWUuY2hhckNvZGVBdChpKTtcblxuICAgIGlmKChjaGFyQ29kZSA8IDQ4IHx8IGNoYXJDb2RlID4gNTcpICYmXG4gICAgICAoY2hhckNvZGUgPCA2NSB8fCBjaGFyQ29kZSA+IDkwKSAmJlxuICAgICAgKGNoYXJDb2RlIDwgOTcgfHwgY2hhckNvZGUgPiAxMjIpICYmXG4gICAgICBtYWNyb05hbWVbaV0gIT09ICdfJylcbiAgICB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIG5hbWUgaGFzIHVuc3VwcG9ydGVkIGNoYXJhY3RlcnMnKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4qIGg1NHMgU0FTIGRhdGEgb2JqZWN0IGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKiBAcGFyYW0ge2FycmF5fGZpbGV9IGRhdGEgLSBUYWJsZSBvciBmaWxlIGFkZGVkIHdoZW4gb2JqZWN0IGlzIGNyZWF0ZWRcbiogQHBhcmFtIHtTdHJpbmd9IG1hY3JvTmFtZSBUaGUgU0FTIG1hY3JvIG5hbWUgdG8gYmUgZ2l2ZW4gdG8gdGhpcyB0YWJsZVxuKiBAcGFyYW0ge251bWJlcn0gcGFyYW1ldGVyVGhyZXNob2xkIC0gc2l6ZSBvZiBkYXRhIG9iamVjdHMgc2VudCB0byBTQVMgKGxlZ2FjeSlcbipcbiovXG5mdW5jdGlvbiBTYXNEYXRhKGRhdGEsIG1hY3JvTmFtZSwgc3BlY3MpIHtcbiAgaWYoZGF0YSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgdGhpcy5fZmlsZXMgPSB7fTtcbiAgICB0aGlzLmFkZFRhYmxlKGRhdGEsIG1hY3JvTmFtZSwgc3BlY3MpO1xuICB9IGVsc2UgaWYoZGF0YSBpbnN0YW5jZW9mIEZpbGUgfHwgZGF0YSBpbnN0YW5jZW9mIEJsb2IpIHtcbiAgICBGaWxlcy5jYWxsKHRoaXMsIGRhdGEsIG1hY3JvTmFtZSk7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdEYXRhIGFyZ3VtZW50IHdyb25nIHR5cGUgb3IgbWlzc2luZycpO1xuICB9XG59XG5cbi8qKlxuKiBBZGQgdGFibGUgdG8gdGFibGVzIG9iamVjdFxuKiBAcGFyYW0ge2FycmF5fSB0YWJsZSAtIEFycmF5IG9mIHRhYmxlIG9iamVjdHNcbiogQHBhcmFtIHtTdHJpbmd9IG1hY3JvTmFtZSBUaGUgU0FTIG1hY3JvIG5hbWUgdG8gYmUgZ2l2ZW4gdG8gdGhpcyB0YWJsZVxuKlxuKi9cblNhc0RhdGEucHJvdG90eXBlLmFkZFRhYmxlID0gZnVuY3Rpb24odGFibGUsIG1hY3JvTmFtZSwgc3BlY3MpIHtcbiAgY29uc3QgaXNTcGVjc1Byb3ZpZGVkID0gISFzcGVjcztcbiAgaWYodGFibGUgJiYgbWFjcm9OYW1lKSB7XG4gICAgaWYoISh0YWJsZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBhcmd1bWVudCBtdXN0IGJlIGFycmF5Jyk7XG4gICAgfVxuICAgIGlmKHR5cGVvZiBtYWNyb05hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1NlY29uZCBhcmd1bWVudCBtdXN0IGJlIHN0cmluZycpO1xuICAgIH1cblxuICAgIHZhbGlkYXRlTWFjcm8obWFjcm9OYW1lKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgYXJndW1lbnRzJyk7XG4gIH1cblxuICBpZiAodHlwZW9mIHRhYmxlICE9PSAnb2JqZWN0JyB8fCAhKHRhYmxlIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUYWJsZSBhcmd1bWVudCBpcyBub3QgYW4gYXJyYXknKTtcbiAgfVxuXG4gIGxldCBrZXk7XG4gIGlmKHNwZWNzKSB7XG4gICAgaWYoc3BlY3MuY29uc3RydWN0b3IgIT09IE9iamVjdCkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdTcGVjcyBkYXRhIHR5cGUgd3JvbmcuIE9iamVjdCBleHBlY3RlZC4nKTtcbiAgICB9XG4gICAgZm9yKGtleSBpbiB0YWJsZVswXSkge1xuICAgICAgaWYoIXNwZWNzW2tleV0pIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGNvbHVtbnMgaW4gc3BlY3MgZGF0YS4nKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yKGtleSBpbiBzcGVjcykge1xuICAgICAgaWYoc3BlY3Nba2V5XS5jb25zdHJ1Y3RvciAhPT0gT2JqZWN0KSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnV3JvbmcgY29sdW1uIGRlc2NyaXB0b3IgaW4gc3BlY3MgZGF0YS4nKTtcbiAgICAgIH1cbiAgICAgIGlmKCFzcGVjc1trZXldLmNvbFR5cGUgfHwgIXNwZWNzW2tleV0uY29sTGVuZ3RoKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBjb2x1bW5zIGluIHNwZWNzIGRlc2NyaXB0b3IuJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgbGV0IGksIGosIC8vY291bnRlcnMgdXNlZCBsYXR0ZXIgaW4gY29kZVxuICAgICAgcm93LCB2YWwsIHR5cGUsXG4gICAgICBzcGVjS2V5cyA9IFtdO1xuXHRjb25zdCBzcGVjaWFsQ2hhcnMgPSBbJ1wiJywgJ1xcXFwnLCAnLycsICdcXG4nLCAnXFx0JywgJ1xcZicsICdcXHInLCAnXFxiJ107XG5cbiAgaWYoIXNwZWNzKSB7XG4gICAgc3BlY3MgPSB7fTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCB0YWJsZS5sZW5ndGg7IGkrKykge1xuICAgICAgcm93ID0gdGFibGVbaV07XG5cbiAgICAgIGlmKHR5cGVvZiByb3cgIT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgaXRlbSBpcyBub3QgYW4gb2JqZWN0Jyk7XG4gICAgICB9XG5cbiAgICAgIGZvcihrZXkgaW4gcm93KSB7XG4gICAgICAgIGlmKHJvdy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgdmFsICA9IHJvd1trZXldO1xuICAgICAgICAgIHR5cGUgPSB0eXBlb2YgdmFsO1xuXG4gICAgICAgICAgaWYoc3BlY3Nba2V5XSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBzcGVjS2V5cy5wdXNoKGtleSk7XG4gICAgICAgICAgICBzcGVjc1trZXldID0ge307XG5cbiAgICAgICAgICAgIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICBpZih2YWwgPCBOdW1iZXIuTUlOX1NBRkVfSU5URUdFUiB8fCB2YWwgPiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikge1xuICAgICAgICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ09iamVjdFsnICsgaSArICddLicgKyBrZXkgKyAnIC0gVGhpcyB2YWx1ZSBleGNlZWRzIGV4cGVjdGVkIG51bWVyaWMgcHJlY2lzaW9uLicpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sVHlwZSAgID0gJ251bSc7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gODtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycgJiYgISh2YWwgaW5zdGFuY2VvZiBEYXRlKSkgeyAvLyBzdHJhaWdodGZvcndhcmQgc3RyaW5nXG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sVHlwZSAgICA9ICdzdHJpbmcnO1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCAgPSB2YWwubGVuZ3RoO1xuICAgICAgICAgICAgfSBlbHNlIGlmKHZhbCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgPSAnZGF0ZSc7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gODtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgPSAnanNvbic7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gSlNPTi5zdHJpbmdpZnkodmFsKS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHNwZWNLZXlzID0gT2JqZWN0LmtleXMoc3BlY3MpO1xuICB9XG5cbiAgbGV0IHNhc0NzdiA9ICcnO1xuXG4gIC8vIHdlIG5lZWQgdHdvIGxvb3BzIC0gdGhlIGZpcnN0IG9uZSBpcyBjcmVhdGluZyBzcGVjcyBhbmQgdmFsaWRhdGluZ1xuICBmb3IgKGkgPSAwOyBpIDwgdGFibGUubGVuZ3RoOyBpKyspIHtcbiAgICByb3cgPSB0YWJsZVtpXTtcbiAgICBmb3IoaiA9IDA7IGogPCBzcGVjS2V5cy5sZW5ndGg7IGorKykge1xuICAgICAga2V5ID0gc3BlY0tleXNbal07XG4gICAgICBpZihyb3cuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICB2YWwgID0gcm93W2tleV07XG4gICAgICAgIHR5cGUgPSB0eXBlb2YgdmFsO1xuXG4gICAgICAgIGlmKHR5cGUgPT09ICdudW1iZXInICYmIGlzTmFOKHZhbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnTmFOIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmKHZhbCA9PT0gLUluZmluaXR5IHx8IHZhbCA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCB2YWwudG9TdHJpbmcoKSArICcgdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYodmFsID09PSB0cnVlIHx8IHZhbCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnQm9vbGVhbiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBpZih0eXBlID09PSAnc3RyaW5nJyAmJiB2YWwuaW5kZXhPZignXFxyXFxuJykgIT09IC0xKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ05ldyBsaW5lIGNoYXJhY3RlciBpcyBub3Qgc3VwcG9ydGVkJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjb252ZXJ0IG51bGwgdG8gJy4nIGZvciBudW1iZXJzIGFuZCB0byAnJyBmb3Igc3RyaW5nc1xuICAgICAgICBpZih2YWwgPT09IG51bGwpIHtcbiAgICAgICAgICBpZihzcGVjc1trZXldLmNvbFR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB2YWwgPSAnJztcbiAgICAgICAgICAgIHR5cGUgPSAnc3RyaW5nJztcbiAgICAgICAgICB9IGVsc2UgaWYoc3BlY3Nba2V5XS5jb2xUeXBlID09PSAnbnVtJykge1xuICAgICAgICAgICAgdmFsID0gJy4nO1xuICAgICAgICAgICAgdHlwZSA9ICdudW1iZXInO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnQ2Fubm90IGNvbnZlcnQgbnVsbCB2YWx1ZScpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG5cbiAgICAgICAgaWYgKCh0eXBlID09PSAnbnVtYmVyJyAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdudW0nICYmIHZhbCAhPT0gJy4nKSB8fFxuICAgICAgICAgICgodHlwZSA9PT0gJ3N0cmluZycgJiYgISh2YWwgaW5zdGFuY2VvZiBEYXRlKSAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdzdHJpbmcnKSAmJlxuICAgICAgICAgICh0eXBlID09PSAnc3RyaW5nJyAmJiBzcGVjc1trZXldLmNvbFR5cGUgPT0gJ251bScgJiYgdmFsICE9PSAnLicpKSB8fFxuICAgICAgICAgICh2YWwgaW5zdGFuY2VvZiBEYXRlICYmIHNwZWNzW2tleV0uY29sVHlwZSAhPT0gJ2RhdGUnKSB8fFxuICAgICAgICAgICgodHlwZSA9PT0gJ29iamVjdCcgJiYgdmFsLmNvbnN0cnVjdG9yICE9PSBEYXRlKSAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdqc29uJykpXG4gICAgICAgIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnVGhlcmUgaXMgYSBzcGVjcyB0eXBlIG1pc21hdGNoIGluIHRoZSBhcnJheSBiZXR3ZWVuIHZhbHVlcyAoY29sdW1ucykgb2YgdGhlIHNhbWUgbmFtZS4nICtcbiAgICAgICAgICAgICcgdHlwZS9jb2xUeXBlL3ZhbCA9ICcgKyB0eXBlICsnLycgKyBzcGVjc1trZXldLmNvbFR5cGUgKyAnLycgKyB2YWwgKTtcbiAgICAgICAgfSBlbHNlIGlmKCFpc1NwZWNzUHJvdmlkZWQgJiYgdHlwZSA9PT0gJ3N0cmluZycgJiYgc3BlY3Nba2V5XS5jb2xMZW5ndGggPCB2YWwubGVuZ3RoKSB7XG4gICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSB2YWwubGVuZ3RoO1xuICAgICAgICB9IGVsc2UgaWYoKHR5cGUgPT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sTGVuZ3RoIDwgdmFsLmxlbmd0aCkgfHwgKHR5cGUgIT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sTGVuZ3RoICE9PSA4KSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdUaGVyZSBpcyBhIHNwZWNzIGxlbmd0aCBtaXNtYXRjaCBpbiB0aGUgYXJyYXkgYmV0d2VlbiB2YWx1ZXMgKGNvbHVtbnMpIG9mIHRoZSBzYW1lIG5hbWUuJyArXG4gICAgICAgICAgICAnIHR5cGUvY29sVHlwZS92YWwgPSAnICsgdHlwZSArJy8nICsgc3BlY3Nba2V5XS5jb2xUeXBlICsgJy8nICsgdmFsICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmFsIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAgIHZhbCA9IHRvU2FzRGF0ZVRpbWUodmFsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHN3aXRjaChzcGVjc1trZXldLmNvbFR5cGUpIHtcbiAgICAgICAgICBjYXNlICdudW0nOlxuICAgICAgICAgIGNhc2UgJ2RhdGUnOlxuICAgICAgICAgICAgc2FzQ3N2ICs9IHZhbDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICAgICAgICBzYXNDc3YgKz0gJ1wiJyArIHZhbC5yZXBsYWNlKC9cIi9nLCAnXCJcIicpICsgJ1wiJztcbiAgICAgICAgICAgIGxldCBjb2xMZW5ndGggPSB2YWwubGVuZ3RoO1xuICAgICAgICAgICAgZm9yKGxldCBrID0gMDsgayA8IHZhbC5sZW5ndGg7IGsrKykge1xuICAgICAgICAgICAgICBpZihzcGVjaWFsQ2hhcnMuaW5kZXhPZih2YWxba10pICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGNvbExlbmd0aCsrO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxldCBjb2RlID0gdmFsLmNoYXJDb2RlQXQoayk7XG4gICAgICAgICAgICAgICAgaWYoY29kZSA+IDB4ZmZmZikge1xuICAgICAgICAgICAgICAgICAgY29sTGVuZ3RoICs9IDM7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmKGNvZGUgPiAweDdmZikge1xuICAgICAgICAgICAgICAgICAgY29sTGVuZ3RoICs9IDI7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmKGNvZGUgPiAweDdmKSB7XG4gICAgICAgICAgICAgICAgICBjb2xMZW5ndGggKz0gMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHVzZSBtYXhpbXVtIHZhbHVlIGJldHdlZW4gbWF4IHByZXZpb3VzLCBjdXJyZW50IHZhbHVlIGFuZCAxIChmaXJzdCB0d28gY2FuIGJlIDAgd2ljaCBpcyBub3Qgc3VwcG9ydGVkKVxuICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSBNYXRoLm1heChzcGVjc1trZXldLmNvbExlbmd0aCwgY29sTGVuZ3RoLCAxKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICAgICAgICBzYXNDc3YgKz0gJ1wiJyArIEpTT04uc3RyaW5naWZ5KHZhbCkucmVwbGFjZSgvXCIvZywgJ1wiXCInKSArICdcIic7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gZG8gbm90IGluc2VydCBpZiBpdCdzIHRoZSBsYXN0IGNvbHVtblxuICAgICAgaWYoaiA8IHNwZWNLZXlzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgc2FzQ3N2ICs9ICcsJztcbiAgICAgIH1cbiAgICB9XG4gICAgaWYoaSA8IHRhYmxlLmxlbmd0aCAtIDEpIHtcbiAgICAgIHNhc0NzdiArPSAnXFxyXFxuJztcbiAgICB9XG4gIH1cblxuICAvL2NvbnZlcnQgc3BlY3MgdG8gY3N2IHdpdGggcGlwZXNcbiAgY29uc3Qgc3BlY1N0cmluZyA9IHNwZWNLZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICByZXR1cm4ga2V5ICsgJywnICsgc3BlY3Nba2V5XS5jb2xUeXBlICsgJywnICsgc3BlY3Nba2V5XS5jb2xMZW5ndGg7XG4gIH0pLmpvaW4oJ3wnKTtcblxuICB0aGlzLl9maWxlc1ttYWNyb05hbWVdID0gW1xuICAgIHNwZWNTdHJpbmcsXG4gICAgbmV3IEJsb2IoW3Nhc0Nzdl0sIHt0eXBlOiAndGV4dC9jc3Y7Y2hhcnNldD1VVEYtOCd9KVxuICBdO1xufTtcblxuLyoqXG4gKiBBZGQgZmlsZSBhcyBhIHZlcmJhdGltIGJsb2IgZmlsZSB1cGxhb2RcbiAqIEBwYXJhbSB7QmxvYn0gZmlsZSAtIHRoZSBibG9iIHRoYXQgd2lsbCBiZSB1cGxvYWRlZCBhcyBmaWxlXG4gKiBAcGFyYW0ge1N0cmluZ30gbWFjcm9OYW1lIC0gdGhlIFNBUyB3ZWJpbiBuYW1lIGdpdmVuIHRvIHRoaXMgZmlsZVxuICovXG5TYXNEYXRhLnByb3RvdHlwZS5hZGRGaWxlICA9IGZ1bmN0aW9uKGZpbGUsIG1hY3JvTmFtZSkge1xuICBGaWxlcy5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgZmlsZSwgbWFjcm9OYW1lKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU2FzRGF0YTtcbiIsImNvbnN0IGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5cbi8qXG4qIGg1NHMgdGFibGVzIG9iamVjdCBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge2FycmF5fSB0YWJsZSAtIFRhYmxlIGFkZGVkIHdoZW4gb2JqZWN0IGlzIGNyZWF0ZWRcbipAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gbWFjcm8gbmFtZVxuKkBwYXJhbSB7bnVtYmVyfSBwYXJhbWV0ZXJUaHJlc2hvbGQgLSBzaXplIG9mIGRhdGEgb2JqZWN0cyBzZW50IHRvIFNBU1xuKlxuKi9cbmZ1bmN0aW9uIFRhYmxlcyh0YWJsZSwgbWFjcm9OYW1lLCBwYXJhbWV0ZXJUaHJlc2hvbGQpIHtcbiAgdGhpcy5fdGFibGVzID0ge307XG4gIHRoaXMuX3BhcmFtZXRlclRocmVzaG9sZCA9IHBhcmFtZXRlclRocmVzaG9sZCB8fCAzMDAwMDtcblxuICBUYWJsZXMucHJvdG90eXBlLmFkZC5jYWxsKHRoaXMsIHRhYmxlLCBtYWNyb05hbWUpO1xufVxuXG4vKlxuKiBBZGQgdGFibGUgdG8gdGFibGVzIG9iamVjdFxuKiBAcGFyYW0ge2FycmF5fSB0YWJsZSAtIEFycmF5IG9mIHRhYmxlIG9iamVjdHNcbiogQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIFNhcyBtYWNybyBuYW1lXG4qXG4qL1xuVGFibGVzLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbih0YWJsZSwgbWFjcm9OYW1lKSB7XG4gIGlmKHRhYmxlICYmIG1hY3JvTmFtZSkge1xuICAgIGlmKCEodGFibGUgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgYXJndW1lbnQgbXVzdCBiZSBhcnJheScpO1xuICAgIH1cbiAgICBpZih0eXBlb2YgbWFjcm9OYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdTZWNvbmQgYXJndW1lbnQgbXVzdCBiZSBzdHJpbmcnKTtcbiAgICB9XG4gICAgaWYoIWlzTmFOKG1hY3JvTmFtZVttYWNyb05hbWUubGVuZ3RoIC0gMV0pKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01hY3JvIG5hbWUgY2Fubm90IGhhdmUgbnVtYmVyIGF0IHRoZSBlbmQnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGFyZ3VtZW50cycpO1xuICB9XG5cbiAgY29uc3QgcmVzdWx0ID0gdGhpcy5fdXRpbHMuY29udmVydFRhYmxlT2JqZWN0KHRhYmxlLCB0aGlzLl9wYXJhbWV0ZXJUaHJlc2hvbGQpO1xuXG4gIGNvbnN0IHRhYmxlQXJyYXkgPSBbXTtcbiAgdGFibGVBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KHJlc3VsdC5zcGVjKSk7XG4gIGZvciAobGV0IG51bWJlck9mVGFibGVzID0gMDsgbnVtYmVyT2ZUYWJsZXMgPCByZXN1bHQuZGF0YS5sZW5ndGg7IG51bWJlck9mVGFibGVzKyspIHtcbiAgICBjb25zdCBvdXRTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShyZXN1bHQuZGF0YVtudW1iZXJPZlRhYmxlc10pO1xuICAgIHRhYmxlQXJyYXkucHVzaChvdXRTdHJpbmcpO1xuICB9XG4gIHRoaXMuX3RhYmxlc1ttYWNyb05hbWVdID0gdGFibGVBcnJheTtcbn07XG5cblRhYmxlcy5wcm90b3R5cGUuX3V0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRhYmxlcztcbiIsImNvbnN0IGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5jb25zdCBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xuXG4vKlxuKiBDb252ZXJ0IHRhYmxlIG9iamVjdCB0byBTYXMgcmVhZGFibGUgb2JqZWN0XG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBpbk9iamVjdCAtIE9iamVjdCB0byBjb252ZXJ0XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuY29udmVydFRhYmxlT2JqZWN0ID0gZnVuY3Rpb24oaW5PYmplY3QsIGNodW5rVGhyZXNob2xkKSB7XG4gIGNvbnN0IHNlbGYgICAgICAgICAgICA9IHRoaXM7XG5cbiAgaWYoY2h1bmtUaHJlc2hvbGQgPiAzMDAwMCkge1xuICAgIGNvbnNvbGUud2FybignWW91IHNob3VsZCBub3Qgc2V0IHRocmVzaG9sZCBsYXJnZXIgdGhhbiAzMGtiIGJlY2F1c2Ugb2YgdGhlIFNBUyBsaW1pdGF0aW9ucycpO1xuICB9XG5cbiAgLy8gZmlyc3QgY2hlY2sgdGhhdCB0aGUgb2JqZWN0IGlzIGFuIGFycmF5XG4gIGlmICh0eXBlb2YgKGluT2JqZWN0KSAhPT0gJ29iamVjdCcpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RoZSBwYXJhbWV0ZXIgcGFzc2VkIHRvIGNoZWNrQW5kR2V0VHlwZU9iamVjdCBpcyBub3QgYW4gb2JqZWN0Jyk7XG4gIH1cblxuICBjb25zdCBhcnJheUxlbmd0aCA9IGluT2JqZWN0Lmxlbmd0aDtcbiAgaWYgKHR5cGVvZiAoYXJyYXlMZW5ndGgpICE9PSAnbnVtYmVyJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGhlIHBhcmFtZXRlciBwYXNzZWQgdG8gY2hlY2tBbmRHZXRUeXBlT2JqZWN0IGRvZXMgbm90IGhhdmUgYSB2YWxpZCBsZW5ndGggYW5kIGlzIG1vc3QgbGlrZWx5IG5vdCBhbiBhcnJheScpO1xuICB9XG5cbiAgY29uc3QgZXhpc3RpbmdDb2xzID0ge307IC8vIHRoaXMgaXMganVzdCB0byBtYWtlIGxvb2t1cCBlYXNpZXIgcmF0aGVyIHRoYW4gdHJhdmVyc2luZyBhcnJheSBlYWNoIHRpbWUuIFdpbGwgdHJhbnNmb3JtIGFmdGVyXG5cbiAgLy8gZnVuY3Rpb24gY2hlY2tBbmRTZXRBcnJheSAtIHRoaXMgd2lsbCBjaGVjayBhbiBpbk9iamVjdCBjdXJyZW50IGtleSBhZ2FpbnN0IHRoZSBleGlzdGluZyB0eXBlQXJyYXkgYW5kIGVpdGhlciByZXR1cm4gLTEgaWYgdGhlcmVcbiAgLy8gaXMgYSB0eXBlIG1pc21hdGNoIG9yIGFkZCBhbiBlbGVtZW50IGFuZCB1cGRhdGUvaW5jcmVtZW50IHRoZSBsZW5ndGggaWYgbmVlZGVkXG5cbiAgZnVuY3Rpb24gY2hlY2tBbmRJbmNyZW1lbnQoY29sU3BlYykge1xuICAgIGlmICh0eXBlb2YgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdICAgICAgICAgICA9IHt9O1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTmFtZSAgID0gY29sU3BlYy5jb2xOYW1lO1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sVHlwZSAgID0gY29sU3BlYy5jb2xUeXBlO1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoID0gY29sU3BlYy5jb2xMZW5ndGggPiAwID8gY29sU3BlYy5jb2xMZW5ndGggOiAxO1xuICAgICAgcmV0dXJuIDA7IC8vIGFsbCBva1xuICAgIH1cbiAgICAvLyBjaGVjayB0eXBlIG1hdGNoXG4gICAgaWYgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbFR5cGUgIT09IGNvbFNwZWMuY29sVHlwZSkge1xuICAgICAgcmV0dXJuIC0xOyAvLyB0aGVyZSBpcyBhIGZ1ZGdlIGluIHRoZSB0eXBpbmdcbiAgICB9XG4gICAgaWYgKGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbExlbmd0aCA8IGNvbFNwZWMuY29sTGVuZ3RoKSB7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xMZW5ndGggPSBjb2xTcGVjLmNvbExlbmd0aCA+IDAgPyBjb2xTcGVjLmNvbExlbmd0aCA6IDE7IC8vIGluY3JlbWVudCB0aGUgbWF4IGxlbmd0aCBvZiB0aGlzIGNvbHVtblxuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICB9XG4gIGxldCBjaHVua0FycmF5Q291bnQgICAgICAgICA9IDA7IC8vIHRoaXMgaXMgZm9yIGtlZXBpbmcgdGFicyBvbiBob3cgbG9uZyB0aGUgY3VycmVudCBhcnJheSBzdHJpbmcgd291bGQgYmVcbiAgY29uc3QgdGFyZ2V0QXJyYXkgICAgICAgICAgID0gW107IC8vIHRoaXMgaXMgdGhlIGFycmF5IG9mIHRhcmdldCBhcnJheXNcbiAgbGV0IGN1cnJlbnRUYXJnZXQgICAgICAgICAgID0gMDtcbiAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0gID0gW107XG4gIGxldCBqICAgICAgICAgICAgICAgICAgICAgICA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgaW5PYmplY3QubGVuZ3RoOyBpKyspIHtcbiAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXSA9IHt9O1xuICAgIGxldCBjaHVua1Jvd0NvdW50ICAgICAgICAgICAgID0gMDtcblxuICAgIGZvciAobGV0IGtleSBpbiBpbk9iamVjdFtpXSkge1xuICAgICAgY29uc3QgdGhpc1NwZWMgID0ge307XG4gICAgICBjb25zdCB0aGlzVmFsdWUgPSBpbk9iamVjdFtpXVtrZXldO1xuXG4gICAgICAvL3NraXAgdW5kZWZpbmVkIHZhbHVlc1xuICAgICAgaWYodGhpc1ZhbHVlID09PSB1bmRlZmluZWQgfHwgdGhpc1ZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvL3Rocm93IGFuIGVycm9yIGlmIHRoZXJlJ3MgTmFOIHZhbHVlXG4gICAgICBpZih0eXBlb2YgdGhpc1ZhbHVlID09PSAnbnVtYmVyJyAmJiBpc05hTih0aGlzVmFsdWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdOYU4gdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICB9XG5cbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gLUluZmluaXR5IHx8IHRoaXNWYWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgdGhpc1ZhbHVlLnRvU3RyaW5nKCkgKyAnIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgfVxuXG4gICAgICBpZih0aGlzVmFsdWUgPT09IHRydWUgfHwgdGhpc1ZhbHVlID09PSBmYWxzZSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnQm9vbGVhbiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgIH1cblxuICAgICAgLy8gZ2V0IHR5cGUuLi4gaWYgaXQgaXMgYW4gb2JqZWN0IHRoZW4gY29udmVydCBpdCB0byBqc29uIGFuZCBzdG9yZSBhcyBhIHN0cmluZ1xuICAgICAgY29uc3QgdGhpc1R5cGUgID0gdHlwZW9mICh0aGlzVmFsdWUpO1xuXG4gICAgICBpZiAodGhpc1R5cGUgPT09ICdudW1iZXInKSB7IC8vIHN0cmFpZ2h0Zm9yd2FyZCBudW1iZXJcbiAgICAgICAgaWYodGhpc1ZhbHVlIDwgTnVtYmVyLk1JTl9TQUZFX0lOVEVHRVIgfHwgdGhpc1ZhbHVlID4gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHtcbiAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdPYmplY3RbJyArIGkgKyAnXS4nICsga2V5ICsgJyAtIFRoaXMgdmFsdWUgZXhjZWVkcyBleHBlY3RlZCBudW1lcmljIHByZWNpc2lvbi4nKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgICAgICAgICAgICAgICAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICAgICAgICAgICAgICAgICAgPSAnbnVtJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICAgICAgICAgICAgICAgICAgPSA4O1xuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoICAgICAgICAgICAgICA9IHRoaXNWYWx1ZS50b1N0cmluZygpLmxlbmd0aDtcbiAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSAgPSB0aGlzVmFsdWU7XG4gICAgICB9IGVsc2UgaWYgKHRoaXNUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgID0gJ3N0cmluZyc7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgPSB0aGlzVmFsdWUubGVuZ3RoO1xuXG4gICAgICAgIGlmICh0aGlzVmFsdWUgPT09IFwiXCIpIHtcbiAgICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldID0gXCIgXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSA9IGVuY29kZVVSSUNvbXBvbmVudCh0aGlzVmFsdWUpLnJlcGxhY2UoLycvZywgJyUyNycpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldLmxlbmd0aDtcbiAgICAgIH0gZWxzZSBpZih0aGlzVmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICBcdGNvbnNvbGUubG9nKFwiRVJST1IgVkFMVUUgXCIsIHRoaXNWYWx1ZSlcbiAgICAgIFx0Y29uc29sZS5sb2coXCJUWVBFT0YgVkFMVUUgXCIsIHR5cGVvZiB0aGlzVmFsdWUpXG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdEYXRlIHR5cGUgbm90IHN1cHBvcnRlZC4gUGxlYXNlIHVzZSBoNTRzLnRvU2FzRGF0ZVRpbWUgZnVuY3Rpb24gdG8gY29udmVydCBpdCcpO1xuICAgICAgfSBlbHNlIGlmICh0aGlzVHlwZSA9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgICAgICAgICAgICAgICAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICAgICAgICAgICAgICAgICAgPSAnanNvbic7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgICAgICAgICAgICAgICAgID0gSlNPTi5zdHJpbmdpZnkodGhpc1ZhbHVlKS5sZW5ndGg7XG4gICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KHRoaXNWYWx1ZSkpLnJlcGxhY2UoLycvZywgJyUyNycpO1xuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoICAgICAgICAgICAgICA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0ubGVuZ3RoO1xuICAgICAgfVxuXG4gICAgICBjaHVua1Jvd0NvdW50ID0gY2h1bmtSb3dDb3VudCArIDYgKyBrZXkubGVuZ3RoICsgdGhpc1NwZWMuZW5jb2RlZExlbmd0aDtcblxuICAgICAgaWYgKGNoZWNrQW5kSW5jcmVtZW50KHRoaXNTcGVjKSA9PSAtMSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnVGhlcmUgaXMgYSB0eXBlIG1pc21hdGNoIGluIHRoZSBhcnJheSBiZXR3ZWVuIHZhbHVlcyAoY29sdW1ucykgb2YgdGhlIHNhbWUgbmFtZS4nKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL3JlbW92ZSBsYXN0IGFkZGVkIHJvdyBpZiBpdCdzIGVtcHR5XG4gICAgaWYoT2JqZWN0LmtleXModGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal0pLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0uc3BsaWNlKGosIDEpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGNodW5rUm93Q291bnQgPiBjaHVua1RocmVzaG9sZCkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdSb3cgJyArIGogKyAnIGV4Y2VlZHMgc2l6ZSBsaW1pdCBvZiAzMmtiJyk7XG4gICAgfSBlbHNlIGlmKGNodW5rQXJyYXlDb3VudCArIGNodW5rUm93Q291bnQgPiBjaHVua1RocmVzaG9sZCkge1xuICAgICAgLy9jcmVhdGUgbmV3IGFycmF5IGlmIHRoaXMgb25lIGlzIGZ1bGwgYW5kIG1vdmUgdGhlIGxhc3QgaXRlbSB0byB0aGUgbmV3IGFycmF5XG4gICAgICBjb25zdCBsYXN0Um93ID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0ucG9wKCk7IC8vIGdldCByaWQgb2YgdGhhdCBsYXN0IHJvd1xuICAgICAgY3VycmVudFRhcmdldCsrOyAvLyBtb3ZlIG9udG8gdGhlIG5leHQgYXJyYXlcbiAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdICA9IFtsYXN0Um93XTsgLy8gbWFrZSBpdCBhbiBhcnJheVxuICAgICAgaiAgICAgICAgICAgICAgICAgICAgICAgICAgID0gMDsgLy8gaW5pdGlhbGlzZSBuZXcgcm93IGNvdW50ZXIgZm9yIG5ldyBhcnJheSAtIGl0IHdpbGwgYmUgaW5jcmVtZW50ZWQgYXQgdGhlIGVuZCBvZiB0aGUgZnVuY3Rpb25cbiAgICAgIGNodW5rQXJyYXlDb3VudCAgICAgICAgICAgICA9IGNodW5rUm93Q291bnQ7IC8vIHRoaXMgaXMgdGhlIG5ldyBjaHVuayBtYXggc2l6ZVxuICAgIH0gZWxzZSB7XG4gICAgICBjaHVua0FycmF5Q291bnQgPSBjaHVua0FycmF5Q291bnQgKyBjaHVua1Jvd0NvdW50O1xuICAgIH1cbiAgICBqKys7XG4gIH1cblxuICAvLyByZWZvcm1hdCBleGlzdGluZ0NvbHMgaW50byBhbiBhcnJheSBzbyBzYXMgY2FuIHBhcnNlIGl0O1xuICBjb25zdCBzcGVjQXJyYXkgPSBbXTtcbiAgZm9yIChsZXQgayBpbiBleGlzdGluZ0NvbHMpIHtcbiAgICBzcGVjQXJyYXkucHVzaChleGlzdGluZ0NvbHNba10pO1xuICB9XG4gIHJldHVybiB7XG4gICAgc3BlYzogICAgICAgc3BlY0FycmF5LFxuICAgIGRhdGE6ICAgICAgIHRhcmdldEFycmF5LFxuICAgIGpzb25MZW5ndGg6IGNodW5rQXJyYXlDb3VudFxuICB9OyAvLyB0aGUgc3BlYyB3aWxsIGJlIHRoZSBtYWNyb1swXSwgd2l0aCB0aGUgZGF0YSBzcGxpdCBpbnRvIGFycmF5cyBvZiBtYWNyb1sxLW5dXG4gIC8vIG1lYW5zIGluIHRlcm1zIG9mIGRvam8geGhyIG9iamVjdCBhdCBsZWFzdCB0aGV5IG5lZWQgdG8gZ28gaW50byB0aGUgc2FtZSBhcnJheVxufTtcblxuLypcbiogQ29udmVydCBqYXZhc2NyaXB0IGRhdGUgdG8gc2FzIHRpbWVcbipcbiogQHBhcmFtIHtvYmplY3R9IGpzRGF0ZSAtIGphdmFzY3JpcHQgRGF0ZSBvYmplY3RcbipcbiovXG5tb2R1bGUuZXhwb3J0cy50b1Nhc0RhdGVUaW1lID0gZnVuY3Rpb24gKGpzRGF0ZSkge1xuICBjb25zdCBiYXNlZGF0ZSA9IG5ldyBEYXRlKFwiSmFudWFyeSAxLCAxOTYwIDAwOjAwOjAwXCIpO1xuICBjb25zdCBjdXJyZGF0ZSA9IGpzRGF0ZTtcblxuICAvLyBvZmZzZXRzIGZvciBVVEMgYW5kIHRpbWV6b25lcyBhbmQgQlNUXG4gIGNvbnN0IGJhc2VPZmZzZXQgPSBiYXNlZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXG4gIGNvbnN0IGN1cnJPZmZzZXQgPSBjdXJyZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXG5cbiAgLy8gY29udmVydCBjdXJyZGF0ZSB0byBhIHNhcyBkYXRldGltZVxuICBjb25zdCBvZmZzZXRTZWNzICAgID0gKGN1cnJPZmZzZXQgLSBiYXNlT2Zmc2V0KSAqIDYwOyAvLyBvZmZzZXREaWZmIGlzIGluIG1pbnV0ZXMgdG8gc3RhcnQgd2l0aFxuICBjb25zdCBiYXNlRGF0ZVNlY3MgID0gYmFzZWRhdGUuZ2V0VGltZSgpIC8gMTAwMDsgLy8gZ2V0IHJpZCBvZiBtc1xuICBjb25zdCBjdXJyZGF0ZVNlY3MgID0gY3VycmRhdGUuZ2V0VGltZSgpIC8gMTAwMDsgLy8gZ2V0IHJpZCBvZiBtc1xuICBjb25zdCBzYXNEYXRldGltZSAgID0gTWF0aC5yb3VuZChjdXJyZGF0ZVNlY3MgLSBiYXNlRGF0ZVNlY3MgLSBvZmZzZXRTZWNzKTsgLy8gYWRqdXN0XG5cbiAgcmV0dXJuIHNhc0RhdGV0aW1lO1xufTtcbiJdfQ==
