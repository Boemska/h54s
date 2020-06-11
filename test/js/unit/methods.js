describe('h54s unit -', function() {
  describe('Methods test:', function() {

    it('Should throw error if arguments are not provided', function(done) {
      var sasAdapter = new h54s();
      proclaim.throws(function() {
        sasAdapter.call();
      });
      proclaim.throws(function() {
        sasAdapter.call({});
      });
      proclaim.throws(function() {
        sasAdapter.call({
          sasProgram: 'test'
        });
      });
      proclaim.throws(function() {
        sasAdapter.call('test');
      });
      proclaim.throws(function() {
        new h54s.SasData([]);
      });

      proclaim.doesNotThrow(function() {
        var ajaxPostDouble = td.replace(sasAdapter._ajax, 'post');
        td.when(ajaxPostDouble(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenReturn({
          success: function(callback) {
            callback({
              responseText: '{}', //it doesn't matter what's returned, just that it doesn't throw an error
              status: 200
            });
            return this;
          },
          error: function() {}
        });
        sasAdapter.call('test', null, function() {});
      });

      td.reset();
      done();
    });

    it('Should throw error if credentials are missing', function(done) {
      var sasAdapter = new h54s({
        hostUrl: serverData.hostUrl
      });
      proclaim.throws(function() {
        sasAdapter.login();
      });
      proclaim.throws(function() {
        sasAdapter.login('username');
      });
      proclaim.throws(function() {
        sasAdapter.login('username', {}, function() {});
      });
      done();
    });

    it('Try to log in without credentials', function(done) {
      var sasAdapter = new h54s({
        hostUrl: serverData.hostUrl
      });
      proclaim.throws(function() {
        sasAdapter.login();
      });
      done();
    });

    it('Call sas program without logging in', function(done) {
      this.timeout(300);
      var sasAdapter = new h54s();

      var ajaxPostDouble = td.replace(sasAdapter._ajax, 'post');
      td.when(ajaxPostDouble(sasAdapter.url, td.matchers.anything(), td.matchers.anything())).thenReturn({
        success: function(callback) {
          callback({
            responseText: sasResponses.unauthenticatedCall,
            status: 200
          });
          return this;
        },
        error: function() {}
      });

      sasAdapter.call('*', null, function(err, res) {
        assert.equal(err.message, 'You are not logged in', 'Should throw error because user is not logged in');
        assert.isUndefined(res, 'We got error, res should be undefined');
        td.reset();
        done();
      });
    });

    it('Log out success', function(done) {
      var sasAdapter = new h54s();

      var fakeFunction = function (url, data, multipartFormData, headers) {
        return {
          success: function (callback) {
            callback({
              status: 200
            });
            return this;
          },
          error: function () {}
        };
      }

      td.replace(sasAdapter._ajax, 'get', fakeFunction);

      sasAdapter.logout(function(errStatus) {
        assert.isUndefined(errStatus, 'Wrong status on logout');
        td.reset();
        done();
      });
    });


    it('Test pending calls after login', function(done) {
      this.timeout(300);
      var sasAdapter = new h54s();

      var ajaxPostDouble = td.replace(sasAdapter._ajax, 'post');
      var unauthentecatedResponseObj = {
        success: function(callback) {
          callback({
            responseText: sasResponses.unauthenticatedCall,
            status: 200
          });
          return this;
        },
        error: function() {}
      };
      var successfulLoginObj = {
        success: function(callback) {
          callback({
            responseText: sasResponses.loginSuccess,
            status: 200
          });
          return this;
        },
        error: function() {}
      };
      var successfulResponseObj = {
        success: function(callback) {
          callback({
            responseText: sasResponses.callSuccess, //empty json for testing
            status: 200
          });
          return this;
        },
        error: function() {}
      };
      td.when(ajaxPostDouble(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenReturn(
        unauthentecatedResponseObj,
        successfulResponseObj,
        successfulResponseObj,
        successfulResponseObj
      );
      td.when(ajaxPostDouble(td.matchers.anything(), td.matchers.anything())).thenReturn(successfulLoginObj);

      var counter = 0;

      sasAdapter.call('*', null, function(err) {
        if(!err) {
          counter++;
        }
      });
      sasAdapter.call('*', null, function(err) {
        if(!err) {
          counter++;
        }
      });
      sasAdapter.call('*', null, function(err) {
        if(!err) {
          counter++;
        }
      });

      setTimeout(function() {
        assert.equal(counter, 0, 'Some calls are already executed - should\'ve waited for login');

        sasAdapter.login('*', '*', function(status) {
          assert.equal(status, 200, 'We got wrong status code');
          setTimeout(function() {
            assert.equal(counter, 3, 'Some pending calls are not executed');
            td.reset();
            done();
          }, 100);
        });
      }, 100);
    });

    it('Status error', function(done) {
      this.timeout(300);
      var sasAdapter = new h54s();

      var ajaxPostDouble = td.replace(sasAdapter._ajax, 'post');
      td.when(ajaxPostDouble(sasAdapter.url, td.matchers.anything(), td.matchers.anything())).thenReturn({
        success: function(callback) {
          callback({
            responseText: sasResponses.callError,
            status: 200
          });
          return this;
        },
        error: function() {}
      });

      sasAdapter.call('*', null, function(err, res) {
        assert.equal(err.type, 'programError', 'Wrong error message type');
        assert.equal(err.message, 'err msg property value', 'Wrong error message value');
        assert.equal(err.status, 'sasError', 'Wrong error message status');
        td.reset();
        done();
      });
    });
  });
});
