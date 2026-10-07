'use strict';


import { App as HomeyApp } from "homey";

// this is copied from settings-src/src by build task. Not elegant, but...
import { ASSettings } from './CommonContainerClasses';
// this is copied from settings-src/src by build task. Not elegant, but...
import { SettingsPersistance } from './SettingsPersistance';

import { FlowAndTokenHandler } from "./FlowAndTokenHandler";
import { TriggerHandler } from "./TriggerHandler";

import { SunWrapper } from "./SunWrapper";

export class MainApp {
    private homeyApp:HomeyApp;
    private homey;
    private asSettings:ASSettings;
    private flowAndTokenHandler:FlowAndTokenHandler;
    private triggerHandler:TriggerHandler;
    private sunWrapper:SunWrapper;
    private reloadQueue:Promise<void> = Promise.resolve();
    private destroyed = false;
    private settingsListener = (variable:string) => {
        if (variable === 'settings' && !this.destroyed) {
            void this.reinit().catch(error => this.homeyApp.error('Settings reload failed:', error));
        }
    };
    
    constructor(homeyApp:HomeyApp) {
        this.homeyApp=homeyApp;
        this.homey = this.homeyApp.homey;
    }

    async init() {

        this.homeyApp.log('Advanced Scheduler MainApp is initializing...');

        let settingsTxt = this.homey.settings.get('settings');
        let sp = new SettingsPersistance();
        let version = -1;
        try {
            version = sp.readSettings(settingsTxt);
        } catch (error) {
            this.homeyApp.error('Stored settings are invalid; scheduling is disabled until settings are repaired:', error);
        }
        this.homeyApp.log('settings version (-1 means no settings has been stored) ', version);
        this.asSettings = sp.getSettings() || new ASSettings();

        this.saveGeolocation();

        this.sunWrapper = new SunWrapper();
        this.sunWrapper.init(this.homeyApp,this.homey.geolocation.getLatitude(), this.homey.geolocation.getLongitude());

        this.flowAndTokenHandler = new FlowAndTokenHandler(this.homeyApp, this.asSettings.schedules);
        this.flowAndTokenHandler.setupFlows();
        await this.flowAndTokenHandler.setupTokens();

        this.triggerHandler = new TriggerHandler(this.homeyApp, this.asSettings, this.flowAndTokenHandler, this.sunWrapper);
        this.triggerHandler.setupTriggers('startup');
        this.triggerHandler.startTimer();

        this.watchsettings();

        //let ws = new WebSettings();
        //this.homeyApp.log(ws.test());

        this.homeyApp.log('Advanced Scheduler MainApp has been initialized');
    }


    reinit():Promise<void> {
        const reload = this.reloadQueue.then(() => {
            if (!this.destroyed) return this.reloadSettings();
        });
        this.reloadQueue = reload.catch(() => {});
        return reload;
    }

    private async reloadSettings() {

        this.homeyApp.log('Advanced Scheduler MainApp is reinitializing...');

        let settingsTxt = this.homey.settings.get('settings');
        let sp = new SettingsPersistance();
        sp.readSettings(settingsTxt);
        this.triggerHandler.stopTimer();
        this.asSettings = sp.getSettings() || new ASSettings();
        
        this.flowAndTokenHandler.setSchedules(this.asSettings.schedules);
        await this.flowAndTokenHandler.setupTokens();
        if (this.destroyed) return;

        this.triggerHandler = new TriggerHandler(this.homeyApp, this.asSettings, this.flowAndTokenHandler, this.sunWrapper);
        this.triggerHandler.setupTriggers('startup');
        this.triggerHandler.startTimer();

        this.homeyApp.log('Advanced Scheduler MainApp has been reinitialized');
    }

    private watchsettings(){
        this.homeyApp.log('Soon watching settings.');

        this.homey.settings.on('set', this.settingsListener);

        //this.homeyApp.

        this.homeyApp.log('Watching settings.');
    }

    async destroy() {
        this.destroyed = true;
        this.homey.settings.removeListener('set', this.settingsListener);
        this.triggerHandler?.stopTimer();
        await this.reloadQueue;
    }

    private saveGeolocation() {
        let geo = {
            "latitude":this.homey.geolocation.getLatitude(), 
            "longitude":this.homey.geolocation.getLongitude(),
            "timezone":this.homey.clock.getTimezone()
        }
        
        this.homey.settings.set('geolocation', JSON.stringify(geo))
    }
}
