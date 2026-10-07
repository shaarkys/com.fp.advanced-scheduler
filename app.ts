'use strict';

import { App as HomeyApp } from "homey";
import { MainApp as MainApp } from "./src/MainApp";

class AdvSchedulerApp extends HomeyApp {
  private mainApp: MainApp;
  /**
   * onInit is called when the app is initialized.
   */ 
  async onInit() {
    // Start debuger
    if (process.env.DEBUG === '1') {
      require('inspector').open(9229, '0.0.0.0', false);
      //require(“inspector”).open(9229, “0.0.0.0”, true);
    }

    this.mainApp = new MainApp(this);
    await this.mainApp.init();
    this.log('Advanced Scheduler has been initialized');
  }

  async onUninit() {
    await this.mainApp?.destroy();
  }
}

module.exports = AdvSchedulerApp;
