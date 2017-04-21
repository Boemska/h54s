sap.ui.jsview('h54s.view.DetailTable', {
  getControllerName: function() {
    return "h54s.controllers.App";
  },

  createContent: function(oController) {
    var table = new sap.ui.table.Table({
      height: '100%', // not working, why?
      enableSelectAll: false,
      selectionBehavior: 'RowOnly',
    });

    table.bindColumns("/keys", function(sId, oContext) {
      var sColumnId = oContext.getObject();
      return new sap.ui.table.Column({
        id : sColumnId,
        label: sColumnId,
        template: sColumnId,
        sortProperty: sColumnId,
        filterProperty: sColumnId
      });
    });

    table.bindRows('/rows');

    return new sap.m.Page({
      title: 'Detail View',
      showNavButton: true,
      navButtonPress: [function() {
        sap.ui.getCore().byId('h54sApp').backToPage('Main');
      }],
      content: [
        table
      ]
    });
  }

});
