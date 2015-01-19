/* global Ext, sasAdapter */
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
      xtype: 'textfield',
      flex: 1,
      name: 'ux',
      fieldLabel: 'User ID',
      listeners: {
        specialkey: function (f, e) {
          if (e.getKey() == e.ENTER || e.getKey() === e.TAB) {
            e.preventDefault();
            this.up('window').down('textfield[name="px"]').focus(true, 10);
          }
        },
        change: function() {
          this.up('window').down('label').hide();
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
          if(e.getKey() === e.TAB) {
            e.preventDefault();
            Ext.getCmp('loginSubmit').focus(false, 10);
          }
        },
        change: function() {
          this.up('window').down('label').hide();
        }
      }
    }, {
      xtype: 'label',
      flex: 1,
      hidden: true,
      margin: '0 0 10 0',
      style: {
        color: 'red'
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
          id: 'loginSubmit',
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

  onOkClick: function () {
    var win = this;

    var invalidLogonLabel = win.down('label');
    var user = win.down('textfield[name="ux"]').getValue();
    var pass = win.down('textfield[name="px"]').getValue();

    sasAdapter.login(user, pass, function (err) {
      if (err) {
        invalidLogonLabel.setText(err);
        invalidLogonLabel.show();
        return;
      }
      win.close();
      sasAdapter.retry();
    });
  }

});
