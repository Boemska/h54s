Ext.define('h54sExample.Application', {
  extend: 'Ext.app.Application',
  name: 'h54s Example',
  stores: [],

  requires: [
    'h54sExample.sasAdapter'
  ],

  init: function() {
    console.log('init');
    Ext.getBody().setStyle('overflow', 'auto');
  },

  launch: function () {
    var me = this;

    sasAdapter.call('/AJAX/h54s_test/libraryList', function (err, res) {
      if (err && err.type === 'notLoggedinError') {
        me.logonWin.show(false, function () {
          setTimeout(function () {
            me.logonWin.down('textfield[name="ux"]').focus(true, 100);
          }, 400);
        });
      } else if (err) {
        alert(err.message);
      } else {
        Ext.getCmp('mainPanel').setLoading(false);
        Ext.getStore('LibraryListStore').setData(res.librarylist);
      }
    });
  },

  logonWin: Ext.create('Ext.window.Window', {

    requires: [
      'Ext.form.field.Text',
      'Ext.container.Container',
      'Ext.button.Button',
      'Ext.toolbar.Spacer'
    ],

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
          alert(err);
          return;
        }
        win.close();
        Ext.getCmp('mainPanel').setLoading(false);
      });
    }

  })
});
