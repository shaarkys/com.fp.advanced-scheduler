import { SettingsPersistance } from './src/SettingsPersistance';

module.exports = {
    async getScheduleState({ homey }) {
        const persistence = new SettingsPersistance();
        persistence.readSettings(homey.settings.get('settings'));
        return persistence.getSettings().schedules.map(schedule => ({
            id: schedule.id,
            name: schedule.name,
            active: schedule.active
        }));
    }
};
