/* global describe, it, assert, serverData, h54s, proclaim, getRandomAsciiChars, setTimeout */
describe('h54s integration -', function() {
  describe('Methods test:', function() {

    it('Try to log in with credentials and callback', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.hostUrl
      });
      sasAdapter._ajax.get( serverData.hostUrl + 'SASStoredProcess/do', {_action: 'logoff'}).success(function(res) {
        assert.equal(res.status, 200, 'Log out is not successful');

        sasAdapter.login(serverData.user, serverData.pass, function(status) {
          assert.equal(status, 200, "We got wrong status code");
          done();
        });
      });
    });

    it('Call sas program without logging in', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.hostUrl
      });
      //logout because we are already logged in in previeous tests
      sasAdapter._ajax.get( serverData.hostUrl + 'SASStoredProcess/do', {_action: 'logoff'}).success(function(res) {
        assert.equal(res.status, 200, 'Log out is not successful');
        sasAdapter.call('/AJAX/h54s_test/startupService', null, function(err, res) {
          assert.equal(err.message, 'You are not logged in', 'Should throw error because user is not logged in');
          assert.isUndefined(res, 'We got error, res should be undefined');
          done();
        });
      });
    });

    it('Log in with wrong credentials', function(done) {
      this.timeout(6000);
      var sasAdapter = new h54s({
        hostUrl: serverData.hostUrl
      });
      sasAdapter.login('username', 'pass', function(status) {
        assert.equal(status, -1, 'We got wrong status code');
        done();
      });
    });

    it('Debug mode test', function(done) {
      this.timeout(6000);
      var sasAdapter = new h54s({
        hostUrl: serverData.hostUrl,
        debug: true
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        if(status === 200) {
          sasAdapter.call('/AJAX/h54s_test/startupService', null, function(err) {
            assert.isUndefined(err, 'We got error on sas program ajax call');
            done();
          });
        }
      });
    });


    //TODO this is just a badly written test
    it('Test concurent calls', function(done) {
      this.timeout(100000);
      var sasAdapter = new h54s({
        hostUrl: serverData.hostUrl
      });

      var finishedRequests = 0;

      var data1 = getRandomAsciiChars(100);
      var data2 = getRandomAsciiChars(100);

      var table = new h54s.SasData([
        {
          "data": data1
        }
      ], 'data');

      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        if(status === 200) {
          sasAdapter.call('/AJAX/h54s_test/bounceData', table, function(err, res) {
            assert.equal(res.outputdata[0].DATA, data1, 'data1 is not the same in response');
            finishedRequests++;
            if(finishedRequests === 2) {
              done();
            }
          });
        }
      });

      var table2 = new h54s.SasData([
        {
          "data": data2
        }
      ], 'data');

      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        if(status === 200) {
          sasAdapter.call('/AJAX/h54s_test/bounceData', table2, function(err, res) {
            assert.equal(res.outputdata[0].DATA, data2, 'data1 is not the same in response');
            finishedRequests++;
            if(finishedRequests === 2) {
              done();
            }
          });
        }
      });

    });

    it('Test pending calls after login', function(done) {
      this.timeout(30000);
      var sasAdapter = new h54s({
        hostUrl: serverData.hostUrl
      });

      var counter = 0;

      sasAdapter._ajax.get(serverData.hostUrl + 'SASStoredProcess/do', {_action: 'logoff'}).success(function() {
        sasAdapter.call('/AJAX/h54s_test/startupService', null, function(err) {
          if(!err) {
            counter++;
          }
        });
        sasAdapter.call('/AJAX/h54s_test/startupService', null, function(err) {
          if(!err) {
            counter++;
          }
        });
        sasAdapter.call('/AJAX/h54s_test/startupService', null, function(err) {
          if(!err) {
            counter++;
          }
        });

        setTimeout(function() {
          assert.equal(counter, 0, 'Some calls are already executed - should\'ve waited for login');

          sasAdapter.login(serverData.user, serverData.pass, function(status) {
            assert.equal(status, 200, 'We got wrong status code');
            setTimeout(function() {
              assert.equal(counter, 3, 'Some pending calls are not executed');
              done();
            }, 4000);
          });
        }, 1000);
      });
    });

    it('Missing SAS program', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.hostUrl
      });

      sasAdapter.call('/AJAX/h54s_test/missingProgram', null, function(err, res) {
        assert.isDefined(err);
        assert.equal(err.type, 'programNotFound', 'We got wrong error type');
        done();
      });
    });

    it('Missing SAS program with debug set', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.hostUrl,
        debug: true
      });

      sasAdapter.call('/AJAX/h54s_test/missingProgram', null, function(err, res) {
        assert.isDefined(err);
        assert.equal(err.type, 'programNotFound', 'We got wrong error type');
        done();
      });
    });

    it('Log out', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.hostUrl
      });

      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        assert.equal(status, 200, 'We got wrong status code');
        sasAdapter.logout(function() {
          sasAdapter.call('/AJAX/h54s_test/startupService', null, function(err, res) {
            assert.isDefined(err);
            assert.equal(err.type, 'notLoggedinError', 'We got wrong error type');
            done();
          });
        });
      });
    });

  });
});
