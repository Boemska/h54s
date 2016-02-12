sap.ui.define([
], function() {
  var model = new sap.ui.model.json.JSONModel();
  var dialog;

  var messageText = new sap.m.Text({
    layoutData: new sap.ui.layout.form.GridElementData({hCells: "16"}),
    textAlign: 'Center'
  });

  var form = new sap.ui.layout.form.Form("F1",{
    width: '400px',
    // editable: true,
    layout: new sap.ui.layout.form.GridLayout(),
    formContainers: [
      new sap.ui.layout.form.FormContainer('f1c', {
        formElements: [
          new sap.ui.layout.form.FormElement({
            label: new sap.ui.commons.Label({
              text:'User ID:',
              layoutData: new sap.ui.layout.form.GridElementData({hCells: "4"})
            }),
            fields: [
              new sap.ui.commons.TextField({
                value: '{/user}',
                liveChange: function() {
                  messageText.setText('');
                }
              })
            ],
          }),
          new sap.ui.layout.form.FormElement({
            label: new sap.ui.commons.Label({
              text:'Password:',
              layoutData: new sap.ui.layout.form.GridElementData({hCells: "4"})
            }),
            fields: [
              new sap.ui.commons.PasswordField({
                value: '{/pass}',
                liveChange: function() {
                  messageText.setText('');
                }
              })
            ],
          }),
          new sap.ui.layout.form.FormElement({
            fields: [
              messageText
            ],
          }),
          new sap.ui.layout.form.FormElement({
            fields: [
              new sap.m.Button({
                text: 'Submit',
                press: function() {
                  //synchronious require because it's undefined if required asynchronously
                  //circular dependency (LoginDialog is required by SasAdapter too)
                  //TODO: fix?
                  jQuery.sap.require("h54s.SasAdapter");
                  var data = model.getData();
                  if(!data.user || !data.pass) {
                    messageText.setText('Credentials not set').addStyleClass('sapThemeCriticalText').rerender();
                  } else {
                    new h54s.sasAdapter().login(data.user, data.pass, function(errMsg) {
                      if(errMsg) {
                        messageText.setText(errMsg).addStyleClass('sapThemeCriticalText').rerender();
                      } else {
                        dialog.close();
                      }
                    });
                  }
                }
              })
            ],
          })
        ]
      })
    ]
  });

  form.setModel(model);

  if(!dialog) {
    dialog = new sap.m.Dialog({
      title: 'SAS Logon Manager',
      content: [
        form
      ]
    });
  }

  return dialog;
});
