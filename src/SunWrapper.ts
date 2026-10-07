'use strict';

import type * as SunCalcTypes from 'suncalc' with { "resolution-mode": "import" };
const SunCalc: typeof SunCalcTypes = require('suncalc');
import { DateTime } from "luxon";

export class SunWrapper {
    private homey;
//    private homeyApp:HomeyApp;
    private homeyApp;
    private lat:number;
    private lon:number;
    private timezone:string;

    constructor() {
        
      //  this.sunCalc = new SunCalc();
    }

//    init(homeyApp:HomeyApp) {
    init(homeyApp, lat, lon) {
        this.homeyApp = homeyApp;
        this.homey = this.homeyApp.homey;

        this.homeyApp.log('Advanced Scheduler SunWrapper is initializing...');

//        this.lat = ManagerGeolocation.getLatitude();
//        this.lon = ManagerGeolocation.getLongitude();
        this.lat = lat;
        this.lon = lon;

        this.timezone = this.homey.clock.getTimezone();

        //this.refreshTimes();
        this.addExtras();

        this.homeyApp.log('Advanced Scheduler SunWrapper has been initialized');
    }

    webInit(lat,lon, timezone?:string) {
        this.lat = lat;
        this.lon = lon;
        this.timezone = timezone;

        this.addExtras();
    }

    addExtras() {
        const extras: Array<[number, string, string]> = [
            [-4, "goldenHourMorningStart", "goldenHourEveningEnd"],
            [-4, "blueHourMorningEnd", "blueHourEveningStart"],
            [-8, "blueHourMorningStart", "blueHourEveningEnd"],
            [-18, "astronomicalDawn", "astronomicalDusk"]
        ];
        extras.forEach(([angle, morning, evening]) => {
            if (!SunCalc.times.some(row => row[1] === morning && row[2] === evening)) {
                SunCalc.addTime(angle, morning, evening);
            }
        });
    }

    
    private getTimes(date: Date){

        //let d = DateTime.fromJSDate(date);
        //var midday = d.startOf("day").toJSDate();
        //var midday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
        
//        let times = SunCalc.getTimes(midday, this.lat, this.lon);        
        const localDate = DateTime.fromJSDate(date, this.timezone ? { zone: this.timezone } : {});
        let times = SunCalc.getTimes(date, this.lat, this.lon, 0, localDate.offset);

        return [ 
            new SunEventInfo("nightEnd","Night End", times.nightEnd),
            new SunEventInfo("astronomicalDawn","Astronomical Dawn", times.astronomicalDawn),
            new SunEventInfo("nauticalDawn","Nautical Dawn", times.nauticalDawn),
            new SunEventInfo("blueHourMorningStart","Blue Hour Morning Start", times.blueHourMorningStart),
            new SunEventInfo("dawn","Dawn", times.dawn),
            new SunEventInfo("blueHourMorningEnd","Blue Hour Morning End", times.blueHourMorningEnd),
            new SunEventInfo("goldenHourMorningStart","Golden Hour Morning Start", times.goldenHourMorningStart),
            new SunEventInfo("sunrise","Sunrise", times.sunrise),
            new SunEventInfo("sunriseEnd","Sunrise End", times.sunriseEnd),
            new SunEventInfo("goldenHourMorningEnd","Morning Golden Hour End", times.goldenHourEnd),

            new SunEventInfo("solarNoon","Solar Noon", times.solarNoon),

            new SunEventInfo("goldenHourEveningStart","Evening Golden Hour Start", times.goldenHour),
            new SunEventInfo("sunsetStart","Sunset Start", times.sunsetStart),
            new SunEventInfo("sunset","Sunset", times.sunset),
            new SunEventInfo("goldenHourEveningEnd","Golden Hour Evening End", times.goldenHourEveningEnd),
            new SunEventInfo("blueHourEveningStart","Blue Hour Evening Start", times.blueHourEveningStart),
            new SunEventInfo("dusk","Dusk", times.dusk),
            new SunEventInfo("blueHourEveningEnd","Blue Hour Evening End", times.blueHourEveningEnd),
            new SunEventInfo("nauticalDusk","Nautical Dusk", times.nauticalDusk),
            new SunEventInfo("astronomicalDusk","Astronomical Dusk", times.astronomicalDusk),
            new SunEventInfo("night","Night", times.night),

            new SunEventInfo("nadir","Nadir", times.nadir),
            
            //New
        ];
    }

    //getTimes() {

        //this.homeyApp.log('Advanced Scheduler MainApp is reinitializing...');
    //    return this.timeInfos;
        //this.homeyApp.log('Advanced Scheduler MainApp has been reinitialized');
    //}

    getTime(date:Date, sunEvent:string):SunEventInfo {
        let result:SunEventInfo;
        //this.homeyApp.log('Advanced Scheduler MainApp is reinitializing...');
        this.getTimes(date).forEach((timeinfo)=>{
            //this.homeyApp.log('Checking: ' + timeinfo.id);
            if (timeinfo.id == sunEvent) {
                result = timeinfo;
            }
        })
        return result;
        //this.homeyApp.log('Advanced Scheduler MainApp has been reinitialized');
    }

}

export class SunEventInfo{
    constructor(id:string,desc:string,time:Date | boolean | null | undefined){
        this.id = id;
        this.desc = desc;
        this.time = time instanceof Date ? time : new Date(NaN);
    }

    id:string;
    desc:string;
    time:Date;
}
