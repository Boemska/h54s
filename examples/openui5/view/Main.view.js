sap.ui.define([
  'h54s/view/DebugDialog'
], function(DebugDialog) {
  sap.ui.jsview('h54s.view.Main', {

    getControllerName: function() {
      return "h54s.controllers.App";
    },

    init: function() {
      this.getController().loadLibNames();
    },

    createContent: function(oController) {
      var self = this;
      var libnameComboBox = new sap.m.ComboBox({
        id: 'dropDown'
      });
      var oItemTemplate1 = new sap.ui.core.ListItem();

      oItemTemplate1.bindProperty('text', 'LIBNAME');
      libnameComboBox.bindItems('/', oItemTemplate1);

      libnameComboBox.attachEvent('selectionChange', function() {
        var item = this.getSelectedItem();
        var libname = item.getText();
        self.getController().loadTable(libname);
      });

      var table = new sap.ui.table.Table({
        id: 'table',
        enableSelectAll: false,
        selectionBehavior: 'RowOnly',
        columns: [
          {
            label: 'Library Name',
            template: 'LIBNAME',
            sortProperty: 'LIBNAME'
          }, {
            label: 'Memory Name',
            template: 'MEMNAME',
            sortProperty: 'MEMNAME'
          }
        ]
      });

      table.attachRowSelectionChange(function(evt) {
        var src = evt.getSource();
        var ind = src.getSelectedIndex();
        if(ind === -1 ) {
          return false;
        }

        var context = src.getContextByIndex(ind);
        var obj = context.getObject();
        self.getController().loadData(obj);
        src.clearSelection();
      });
      table.bindRows('/');

      return new sap.m.Page({
        title: 'Main',
        hAlign: 'Center',
        content: [
          new sap.m.FlexBox({
            justifyContent: 'Center',
            height: '100%',
            items: [
              new sap.ui.layout.VerticalLayout({
                width: '500px',
                content: [
                  new sap.m.Panel({
                    showHeader: 'false',
                    height: '100px',
                    content: [
                      new sap.m.FlexBox({
                        justifyContent: 'End',
                        alignItems: 'End',
                        height: '100%',
                        items: [
                          new sap.m.Button({
                            text: 'Show debug data and logs',
                            press: function() {
                              DebugDialog.open();
                            }
                          })
                        ]
                      })
                    ]
                  }),
                  new sap.m.Panel({
                    showHeader: 'false',
                    layoutData: new sap.m.FlexItemData({
                      growFactor: 1
                    }),
                    content: [
                      new sap.m.FlexBox({
                        justifyContent: 'SpaceBetween',
                        items: [
                          new sap.m.SearchField(),
                          libnameComboBox
                        ]
                      }),
                      table
                    ]
                  })
                ]
              })
            ]
          })
        ],
        showHeader: false
      });
    }
  });
});
