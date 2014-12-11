Ext.define('h54sExample.view.LoginWindow', {
  extend: 'Ext.window.Window',

  width: 328,
  bodyPadding: 10,
  title: 'SAS Logon Manager',
  modal: true,
  defaultListenerScope: true,
  closable: false,

  layout: {
    type: 'vbox',
    align: 'stretch'
  },
  items: [
    {
      xtype: 'label',
      flex: 1,
      hidden: true,
      margin: '0 0 10 0',
      text: 'Invalid User ID or Password.',
      style: {
        color: 'red'
      }
    },
    {
      xtype: 'textfield',
      flex: 1,
      name: 'ux',
      fieldLabel: 'User ID',
      listeners: {
        specialkey: function (f, e) {
          if (e.getKey() == e.ENTER || e.getKey() === e.TAB) {
            this.up('window').down('textfield[name="px"]').focus(true, 10);
          }
        }
      }
    }, {
      xtype: 'textfield',
      inputType: 'password',
      flex: 1,
      name: 'px',
      fieldLabel: 'Password',
      listeners: {
        specialkey: function (f, e) {
          if (e.getKey() == e.ENTER) {
            this.up('window').onOkClick();
          }
        }
      }
    }, {
      xtype: 'container',
      height: 28,
      margin: '10 0 0 0',
      layout: {
        type: 'vbox',
        align: 'center'
      },
      items: [
        {
          xtype: 'button',
          width: 120,
          text: 'Sign in',
          listeners: {
            click: 'onOkClick'
          }
        }
      ]
    }
  ],

  onOkClick: function (button, e, eOpts) {
    var win = this;

    var invalidLogonLabel = win.down('label');
    var user = win.down('textfield[name="ux"]').getValue();
    var pass = win.down('textfield[name="px"]').getValue();

    sasAdapter.login(user, pass, function (err) {
      if (err) {
        //TODO: add message to the window instead of the alert
        alert(err);
        return;
      }
      win.close();
      Ext.getCmp('mainPanel').setLoading(false);
    });
  }

});
