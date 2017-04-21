sap.ui.jsview("h54s.view.App", {

  getControllerName: function() {
    return "h54s.controllers.App";
  },

  createContent: function(oController) {
    this.app = new sap.m.App({
      id: 'h54sApp'
    });

    this.app.addPage(sap.ui.jsview("Main", "h54s.view.Main"));
    this.app.addPage(sap.ui.jsview("DetailTable", "h54s.view.DetailTable"));

    return this.app;
  }
});
