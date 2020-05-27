/* global describe, it, assert, serverData, h54s, setTimeout */
describe('h54s integration -', function() {
  describe('Remote config tests:', function() {

    it('Test config override with call', function(done) {

      this.timeout(6000);
      var sasAdapter = new h54s({
        hostUrl: serverData.hostUrl,
        isRemoteConfig: true
      });

      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        assert.equal(status, 200, 'We got wrong status code');
        //metadataRoot is set to '/AJAX/' so the program path is prefixed with it
        sasAdapter.call('/h54s_test/startupService', null, function(err) {
          assert.isUndefined(err, 'We got error on sas program ajax call');
          done();
        });
      });
    });

  });
});
