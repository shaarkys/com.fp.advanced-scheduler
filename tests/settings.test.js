const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { ASSettings } = require('../.homeybuild/src/CommonContainerClasses');
const { SettingsPersistance } = require('../.homeybuild/src/SettingsPersistance');
const { SunWrapper } = require('../.homeybuild/src/SunWrapper');

function options() {
    const source = fs.readFileSync('settings-src/src/App.vue', 'utf8');
    const script = source.split('<script>')[1].split('</script>')[0];
    return vm.runInNewContext('(' + script.slice(script.indexOf('export default') + 14).trim().replace(/;$/, '') + ')', {
        ASSettings, SettingsPersistance, SunWrapper, AsvSchedule: {}, AsvSunEventTimes: {}
    });
}

function component() {
    const definition = options();
    const writes = [];
    const alerts = [];
    const values = new Map();
    const instance = Object.assign(definition.data(), {
        Homey: {
            get(key, cb) { cb(null, values.get(key)); },
            set(key, value, cb) { writes.push([key, value]); cb(null); },
            __(translations) { return translations.nl; },
            async alert(error) { alerts.push(error); }
        },
        $i18n: { locale: 'en' }
    });
    for (const [name, fn] of Object.entries(definition.methods)) instance[name] = fn.bind(instance);
    return { instance, writes, alerts, values };
}

test('settings load uses callback-only Homey APIs and selects a supported locale', async () => {
    const { instance, values } = component();
    const settings = new ASSettings();
    settings.addNewSchedule('Existing', true);
    values.set('settings', new SettingsPersistance().buildSettings(settings));
    await instance.getSettings();
    instance.getLanguage();
    assert.equal(instance.assettings.schedules[0].name, 'Existing');
    assert.equal(instance.$i18n.locale, 'nl');
});

test('a failed reload after successful load disables Save and preserves stored data', async () => {
    const { instance, values, writes } = component();
    values.set('settings', new SettingsPersistance().buildSettings(new ASSettings()));
    await instance.getSettings();
    assert.equal(instance.settingsLoaded, true);
    const previous = instance.assettings;
    values.set('settings', '{');
    await instance.getSettings();
    assert.equal(instance.settingsLoaded, false);
    assert.equal(instance.assettings, previous);
    await instance.saveSettings();
    assert.equal(writes.length, 0);
    assert.equal(values.get('settings'), '{');
});

test('invalid raw and invalid edited schedules never call Homey.set', async () => {
    const { instance, writes, alerts } = component();
    instance.rawSettings = '{"settingsVersion":2,"settings":{}}';
    await instance.saveRawSettings();
    instance.rawSettings = 'null';
    await instance.saveRawSettings();
    instance.rawSettings = '';
    await instance.saveRawSettings();
    assert.equal(writes.length, 0);
    assert.equal(alerts.length, 3);
    const persistence = new SettingsPersistance();
    const settings = new ASSettings();
    const schedule = settings.addNewSchedule('Existing', true);
    schedule.active = 'false';
    instance.assettings = settings;
    instance.settingsLoaded = true;
    await instance.saveSettings();
    assert.equal(writes.length, 0);
    assert.equal(alerts.length, 4);
    assert.throws(() => persistence.readSettings(persistence.buildSettings(settings)));
});

test('failed settings write leaves the currently edited model in place', async () => {
    const { instance, writes, alerts } = component();
    const current = instance.assettings;
    instance.rawSettings = new SettingsPersistance().buildSettings(new ASSettings());
    instance.Homey.set = (key, value, cb) => cb(new Error('Save failed'));
    await instance.saveRawSettings();
    assert.equal(instance.assettings, current);
    assert.equal(writes.length, 0);
    assert.equal(alerts[0], 'Save failed');
});

test('geolocation is loaded through callbacks and forwards the Homey timezone', async () => {
    const { instance, values } = component();
    values.set('geolocation', JSON.stringify({ latitude: 35.68, longitude: 139.69, timezone: 'Asia/Tokyo' }));
    await instance.getSunWrapper();
    assert.equal(instance.sunTimezone, 'Asia/Tokyo');
    assert.ok(instance.sunWrapper instanceof SunWrapper);
});

test('bootstrap replays an early Homey callback and mounts only once', () => {
    const listeners = {};
    let mounts = 0;
    let ready = 0;
    const order = [];
    function Vue() { order.push('create'); this.$mount = () => { mounts++; }; }
    Vue.config = {};
    Vue.component = () => order.push('component');
    Vue.use = () => order.push('plugin');
    Vue.mixin = () => {};
    const Homey = { ready() { ready++; } };
    const window = {
        homeySettings: { Homey },
        addEventListener(name, listener) { listeners[name] = listener; }
    };
    const source = fs.readFileSync('settings-src/src/main.js', 'utf8').replace(/^import .*$/gm, '');
    vm.runInNewContext(source, { window, Vue, App: {}, vuetify: {}, i18n: {}, VCurrencyField: {}, VTextField: {} });
    listeners['homey-settings-ready']({ detail: Homey });
    assert.equal(mounts, 1);
    assert.equal(ready, 1);
    assert.deepEqual(order.slice(0, 3), ['component', 'plugin', 'create']);
});
