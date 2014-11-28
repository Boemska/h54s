describe('h54s', function() {
  describe('init', function() {
    it('should error if config data is missing', function(done) {
      expect(function() {
        var sasAdapter = new h54s();
      }).to.throw(Error);
      expect(function() {
        var sasAdapter = new h54s({});
      }).to.throw(Error);
      var sasAdapter = new h54s({
        url: '/do'
      });
      done();
    });
  });
});
