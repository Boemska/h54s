/* global describe, it, assert, serverData, h54s, setTimeout */
describe('h54s integration -', function() {
  describe('Remote config tests:', function() {

    it('Test config override with call', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        isRemoteConfig: true
      });

      sasAdapter.call('/AJAX/h54s_test/startupService', null, function(err) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        done();
      });
    });

  });
});
