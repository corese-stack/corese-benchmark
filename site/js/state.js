// state.js — Global application state (singleton)
'use strict';

const state = {
  activeTab: 'overview',
  data: null,           // normalized data
  rawData: null,        // original JSON
  engines: [],          // engine id list
  activeEngines: [],    // currently visible engines
  charts: {},           // chart instance registry (id -> Chart)
  dataFormat: null,     // 'v1' or 'v2'
};

export default state;
