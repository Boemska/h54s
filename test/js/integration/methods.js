/* global describe, it, assert, serverData, h54s, proclaim, getRandomAsciiChars, setTimeout */
describe('h54s integration -', function() {
  describe('Methods test:', function() {

    it('Try to log in with credentials and callback', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      sasAdapter._ajax.get( serverData.url + 'SASStoredProcess/do', {_action: 'logoff'}).success(function(res) {
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
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });
      //logout because we are already logged in in previeous tests
      sasAdapter._ajax.get( serverData.url + 'SASStoredProcess/do', {_action: 'logoff'}).success(function(res) {
        assert.equal(res.status, 200, 'Log out is not successful');
        sasAdapter.call('startupService', null, function(err, res) {
          assert.equal(err.message, 'You are not logged in', 'Should throw error because user is not logged in');
          assert.isUndefined(res, 'We got error, res should be undefined');
          done();
        });
      });
    });

    it('Log in with wrong credentials', function(done) {
      this.timeout(6000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      sasAdapter.login('username', 'pass', function(status) {
        assert.equal(status, -1, 'We got wrong status code');
        done();
      });
    });

    it('Debug mode test', function(done) {
      this.timeout(6000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        debug: true,
        metadataRoot: serverData.metadataRoot
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        if(status === 200) {
          sasAdapter.call('startupService', null, function(err) {
            assert.isUndefined(err, 'We got error on sas program ajax call');
            done();
          });
        }
      });
    });

    it('Test concurent calls', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });

      var finishedRequests = 0;

      var data1 = getRandomAsciiChars(1000);
      var data2 = getRandomAsciiChars(10);

      var table = new h54s.Tables([
        {
          data: data1
        }
      ], 'data');

      sasAdapter.call('BounceData', table, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.isDefined(res, 'Response is undefined');
        assert.equal(res.outputdata[0].DATA, data1, 'data1 is not the same in response');
        finishedRequests++;
        if(finishedRequests === 2) {
          done();
        }
      });

      table = new h54s.Tables([
        {
          data: data2
        }
      ], 'data');

      sasAdapter.call('BounceData', table, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.isDefined(res, 'Response is undefined');
        assert.equal(res.outputdata[0].DATA, data2, 'data2 is not the same in response');
        finishedRequests++;
        if(finishedRequests === 2) {
          done();
        }
      });
    });

    it('Test pending calls after login', function(done) {
      this.timeout(30000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });

      var counter = 0;

      sasAdapter._ajax.get(serverData.url + 'SASStoredProcess/do', {_action: 'logoff'}).success(function() {
        sasAdapter.call('startupService', null, function(err) {
          if(!err) {
            counter++;
          }
        });
        sasAdapter.call('startupService', null, function(err) {
          if(!err) {
            counter++;
          }
        });
        sasAdapter.call('startupService', null, function(err) {
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
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });

      sasAdapter.call('missingProgram', null, function(err, res) {
        assert.isDefined(err);
        assert.equal(err.type, 'programNotFound', 'We got wrong error type');
        done();
      });
    });

    it('Missing SAS program with debug set', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        debug: true,
        metadataRoot: serverData.metadataRoot
      });

      sasAdapter.call('missingProgram', null, function(err, res) {
        assert.isDefined(err);
        assert.equal(err.type, 'programNotFound', 'We got wrong error type');
        done();
      });
    });

    it('Log out', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });

      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        assert.equal(status, 200, 'We got wrong status code');
        sasAdapter.logout(function() {
          sasAdapter.call('startupService', null, function(err, res) {
            assert.isDefined(err);
            assert.equal(err.type, 'notLoggedinError', 'We got wrong error type');
            done();
          });
        });
      });
    });

  });
});
