/* global describe, it, assert, serverData, h54s, proclaim, getRandomAsciiChars, setTimeout */
describe('h54s integration -', function() {
  describe('Methods test:', function() {


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
          assert.equal(counter, 0, 'Some calls are already executed - should have waited for login');

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
