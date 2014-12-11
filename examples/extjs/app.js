Ext.application({
  name: 'h54sExample',
  extend: 'h54sExample.Application',
  autoCreateViewport: 'h54sExample.view.Dashboard',

  models: [
    'Library',
    'Table'
  ],
  stores: [
    'LibraryListStore',
    'TableStore',
    'DetailTableStore'
  ],
});
