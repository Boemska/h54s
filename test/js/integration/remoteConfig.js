/* global describe, it, assert, serverData, h54s, setTimeout */
describe('h54s integration -', function() {
  describe('Remote config tests:', function() {

    before(function(done) {
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        if(status === 200) {
          done();
        } else {
          done(new Error('Unable to login'));
        }
      })
    });

    it('Test config override with call', function(done) {
      this.timeout(6000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        isRemoteConfig: true,
        metadataRoot: serverData.metadataRoot
      });

      sasAdapter.call('startupService', null, function(err) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        done();
      });
    });

  });
});
